// Mounts the self-running line film into #line-film, edge to edge, as tall as the viewport minus the sticky header.
const el = document.getElementById("line-film");
const lang = document.querySelector('script[src$="line-film/mount.js"]')?.dataset.lang || document.documentElement.lang || "zh-tw";
const header = document.querySelector(".site-header");
const setHeader = () => document.documentElement.style.setProperty("--line-film-top", (header?.offsetHeight ?? 0) + "px");
setHeader();
addEventListener("resize", setHeader);
try {
  const { mountLineFilm } = await import("./line.js");
  await mountLineFilm(el, { lang: lang.toLowerCase() });
} catch (err) {
  el.hidden = true; // no WebGL / module support: the product list on the page still tells the story
}
