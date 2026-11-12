// Contact map: brand-styled Google Map when a browser key is configured (site.maps_key),
// otherwise OpenFreeMap vector tiles via MapLibre with the same palette. Either way only
// road and area names are labelled. Both carry the same pin + card element,
// which is server-rendered so the page still reads correctly if no map loads.
(() => {
  const root = document.querySelector("[data-contact-map]");
  if (!root) return;
  const canvas = root.querySelector(".contact-map__canvas");
  const pin = root.querySelector("[data-contact-pin]");
  const office = { lat: Number(root.dataset.lat), lng: Number(root.dataset.lng) };
  const narrow = matchMedia("(max-width: 640px)").matches;
  const zoom = narrow ? 15 : 16;

  // Logo navy #14284B / gold #C5A15C on a pale blue-grey ground. Labels: road and area names only.
  const STYLES = [
    { elementType: "geometry", stylers: [{ color: "#eef1f5" }] },
    { elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "road", elementType: "labels.text", stylers: [{ visibility: "on" }] },
    { featureType: "administrative.locality", elementType: "labels.text", stylers: [{ visibility: "on" }] },
    { featureType: "administrative.neighborhood", elementType: "labels.text", stylers: [{ visibility: "on" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#5f6f84" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
    { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9d2de" }] },
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e5e9f0" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e1e8e3" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7a889a" }] },
    { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ecdfc2" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#c5a15c" }, { weight: 0.6 }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c3d1e2" }] },
  ];

  // Shift the view so the pin sits low (room for the card above it) and, on wide
  // screens, right of the heading.
  const offset = () => [narrow ? 0 : -Math.round(canvas.clientWidth * 0.18), -Math.round(canvas.clientHeight * (narrow ? 0.22 : 0.18))];

  function mounted() {
    pin.classList.add("is-mounted");
    root.classList.add("is-live");
  }

  function loadGoogle(key) {
    window.__dsengContactMap = () => {
      const g = google.maps;
      const map = new g.Map(canvas, {
        center: office, zoom, styles: STYLES,
        disableDefaultUI: true, zoomControl: true,
        zoomControlOptions: { position: g.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: "cooperative", clickableIcons: false,
      });
      class PinOverlay extends g.OverlayView {
        onAdd() {
          g.OverlayView.preventMapHitsAndGesturesFrom(pin);
          this.getPanes().floatPane.appendChild(pin);
          mounted();
        }
        draw() {
          const p = this.getProjection().fromLatLngToDivPixel(new g.LatLng(office.lat, office.lng));
          pin.style.left = p.x + "px";
          pin.style.top = p.y + "px";
        }
        onRemove() {}
      }
      new PinOverlay().setMap(map);
      g.event.addListenerOnce(map, "idle", () => map.panBy(...offset()));
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__dsengContactMap&language=${root.dataset.lang}&region=TW&loading=async`;
    s.async = true;
    s.onerror = loadVector;
    document.head.appendChild(s);
  }

  // Same palette for the OpenFreeMap "positron" style; every other symbol layer is dropped.
  const KEEP_LABELS = new Set(["highway-name-minor", "highway-name-major", "label_other", "label_village", "label_town", "label_city"]);
  const NAME = {
    "zh-TW": ["coalesce", ["get", "name:zh-Hant"], ["get", "name"]],
    "zh-CN": ["coalesce", ["get", "name:zh-Hans"], ["get", "name:zh"], ["get", "name"]],
    en: ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]],
    ja: ["coalesce", ["get", "name:ja"], ["get", "name"]],
  };
  const FILL = { background: "#eef1f5", park: "#e1e8e3", landcover_wood: "#e1e8e3", water: "#c3d1e2", landuse_residential: "#e8ecf2", building: "#e2e7ee" };
  function brandStyle(style) {
    style.layers = style.layers.filter((l) => l.type !== "symbol" || KEEP_LABELS.has(l.id));
    for (const l of style.layers) {
      const p = (l.paint ||= {});
      if (l.id === "background") p["background-color"] = FILL.background;
      else if (l.type === "fill" && FILL[l.id]) p["fill-color"] = FILL[l.id];
      else if (l.id === "waterway") p["line-color"] = FILL.water;
      else if (/motorway.*inner/.test(l.id)) p["line-color"] = "#ecdfc2";
      else if (/motorway.*casing/.test(l.id)) p["line-color"] = "#d9c49a";
      else if (/casing/.test(l.id)) p["line-color"] = "#d5dce6";
      else if (/^highway_(minor|major_inner|major_subtle|path)/.test(l.id)) p["line-color"] = "#ffffff";
      else if (/^railway/.test(l.id)) p["line-color"] = "#cfd6df";
      else if (/^boundary/.test(l.id)) p["line-color"] = "#c9d2de";
      if (l.type === "symbol") {
        l.layout["text-field"] = NAME[root.dataset.lang] || NAME["zh-TW"];
        p["text-color"] = l.id.startsWith("highway") ? "#7a889a" : "#5f6f84";
        p["text-halo-color"] = "#ffffff";
        p["text-halo-width"] = 1.4;
      }
    }
    return style;
  }

  function loadVector() {
    const base = "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/";
    const css = Object.assign(document.createElement("link"), {
      rel: "stylesheet", href: base + "maplibre-gl.css", crossOrigin: "anonymous",
      integrity: "sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V",
    });
    const js = Object.assign(document.createElement("script"), {
      src: base + "maplibre-gl.js", crossOrigin: "anonymous",
      integrity: "sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj",
    });
    js.onload = async () => {
      const style = brandStyle(await (await fetch("https://tiles.openfreemap.org/styles/positron")).json());
      const map = new maplibregl.Map({
        container: canvas, style, center: [office.lng, office.lat], zoom: zoom - 0.6,
        cooperativeGestures: true, attributionControl: { compact: true },
        localIdeographFontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat([office.lng, office.lat]).addTo(map);
      mounted();
      map.once("load", () => map.panBy(offset(), { duration: 0 }));
    };
    document.head.append(css, js);
  }

  if (root.dataset.key) loadGoogle(root.dataset.key);
  else loadVector();
})();
