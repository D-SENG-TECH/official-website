// Voice narration for the showroom hero.
//
// One mp3 per product (+ a short intro on Play) per language: <base><lang>/<id>.mp3.
// Nothing is downloaded until the user presses Play; only the page language is fetched, and only
// the current clip plus the next one (preload).
//
// Driven entirely by the showroom's onUI(s) state, so it follows whatever the sequence does:
//   - a product's clip starts when its caption starts to appear (s.index === N and captionK > 0);
//   - the intro clip starts on Play; if it is still talking when product 1 appears, product 1 waits for it;
//   - jump(k) -> cut(k): the current clip stops at once and nothing else plays until k is on screen;
//   - s.paused pauses/resumes the audio; idle stops it;
//   - when onUI stops arriving (tab hidden, hero scrolled away: the sequence freezes) the audio pauses too.
// Mute keeps a clock of where the clip would be, so unmuting mid-product resumes at the right spot.
// Mute state is remembered in localStorage (try/catch: private mode / blocked storage just forgets).

export function createNarration({ base, lang, ids, button, labels, storageKey = "hero_voice" }) {
  const url = (key) => `${base}${lang}/${key}.mp3`;
  let muted = false;
  try { muted = localStorage.getItem(storageKey) === "0"; } catch {}

  const audio = new Audio();
  audio.preload = "auto";
  const pre = new Audio();
  pre.preload = "auto";

  let started = false;   // Play pressed (user gesture) and the sequence has not gone back to idle
  let cur = null;        // clip that owns the current moment ("intro" | product id | null)
  let loaded = null;     // clip whose file is in `audio`
  let done = false;      // cur has finished (or its time is over while muted)
  let queued = null;     // product clip waiting for the intro to finish
  let waited = 0;        // how long it has waited (a stalled intro must never hold product 1 back)
  let target = null;     // after a jump: ignore everything until this clip is on screen
  let clock = 0;         // seconds since cur started, in sequence time (stops while paused)
  let last = null, lastAt = 0;

  function render() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? labels.unmute : labels.mute);
    button.title = muted ? labels.unmute : labels.mute;
  }
  render();

  function load(key, at = 0) {
    loaded = key;
    audio.src = url(key) + (at > 0.05 ? `#t=${at.toFixed(2)}` : "");
    const nx = key === "intro" ? ids[0] : ids[ids.indexOf(key) + 1];
    if (nx) pre.src = url(nx);
  }
  function run(want) {
    if (want) { if (audio.paused) audio.play().catch(() => {}); }
    else if (!audio.paused) audio.pause();
  }
  function setClip(key) {
    cur = key; done = false; queued = null; clock = 0;
    if (muted) { loaded = null; return; }
    load(key);
    run(true);
  }

  audio.addEventListener("ended", () => {
    done = true;
    if (queued) setClip(queued);
  });

  // sequence stopped calling onUI (hidden tab / hero off screen): hold the audio where it is
  setInterval(() => { if (last && performance.now() - lastAt > 300) run(false); }, 200);

  function onUI(s) {
    const now = performance.now();
    const dt = last && !s.paused && now - lastAt < 300 ? (now - lastAt) / 1000 : 0;
    last = s; lastAt = now;
    if (s.mode === "idle") { started = false; cur = queued = target = null; run(false); return; }
    if (!started) return;
    if (cur && !done) clock += dt;
    if (queued && (waited += dt) > 1.5) setClip(queued);
    if (s.mode !== "outro" && s.index >= 0 && s.captionK > 0.02) {
      const want = ids[s.index];
      if (target && want === target) target = null;
      if (!target && want !== cur && want !== queued) {
        if (cur === "intro" && !done && !muted) { queued = want; waited = 0; }
        else setClip(want);
      }
    }
    run(!muted && !s.paused && cur === loaded && !done && !target);
  }

  return {
    onUI,
    // call synchronously inside the Play click handler (this is what unlocks audio playback)
    start() {
      if (started) return;
      started = true; target = null;
      setClip("intro");
    },
    // call when the user jumps to product k
    cut(k) {
      const key = ids[k];
      if (!started) return this.start();
      if (key === cur) return;
      target = key; queued = null;
      run(false);
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(storageKey, muted ? "0" : "1"); } catch {}
      render();
      if (muted) { run(false); return; }
      // unmute mid-clip: pick the clip up where the sequence is (gesture -> play() is allowed)
      if (started && cur && !done) {
        if (cur !== loaded) load(cur, clock);
        else if (audio.duration && clock >= audio.duration) done = true;
        else audio.currentTime = clock;
      }
      if (last) onUI(last);
    },
    get muted() { return muted; },
    get debug() { return { started, cur, loaded, done, queued, target, clock: +clock.toFixed(2), src: audio.src, paused: audio.paused, t: +audio.currentTime.toFixed(2), muted }; },
  };
}
