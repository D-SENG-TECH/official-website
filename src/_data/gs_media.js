// Product photos for Gold Stone, from the company deck (slides 6–19).
// One entry per group in i18n gold_stone.groups, same order. Labels are the
// deck's own product names, shared by all languages. `fit: "contain"` keeps
// diagrams uncropped.
export default [
  { cover: "pipe.jpg", photos: [
    { src: "pipe.jpg" },
    { src: "pipe-2.jpg" },
    { src: "pipe-grades.jpg", label: "AP / BA / MP / EP", fit: "contain" },
  ] },
  { cover: "fit-bend.jpg", photos: [
    { src: "fit-bend.jpg", label: "Bend" },
    { src: "fit-forged.jpg", label: "Forged & Micro" },
    { src: "fit-vcr.jpg", label: "VCR" },
    { src: "fit-compression.jpg", label: "Compression" },
    { src: "fit-cylinder.jpg", label: "Cylinder" },
    { src: "fit-presslok.jpg", label: "Presslok" },
  ] },
  { cover: "valves.jpg", photos: [
    { src: "valves.jpg" },
    { src: "valves-2.jpg" },
    { src: "valves-3.jpg" },
  ] },
  { cover: "regulators.jpg", photos: [
    { src: "regulators.jpg", label: "Regulator", fit: "contain" },
    { src: "gauge.jpg", label: "Gauge", fit: "contain" },
    { src: "filters.jpg", label: "Filter" },
  ] },
  { cover: "pfa-fittings.jpg", photos: [
    { src: "pfa-tube.jpg", label: "PFA / FEP Tube" },
    { src: "pfa-fittings.jpg", label: "PFA Fittings" },
    { src: "pfa-valves.jpg", label: "PFA Valve" },
  ] },
];
