// One detail page per language × business item (4 × 6 = 24 pages).
import { readFileSync } from "node:fs";
import site from "./site.js";

const load = (code) =>
  JSON.parse(readFileSync(new URL(`./i18n/${code}.json`, import.meta.url), "utf8"));

export default site.langs.flatMap((lang) => {
  const items = load(lang.code).business.items;
  return items.map((item, index) => ({
    lang,
    item,
    index,
    slug: item.id.replaceAll("_", "-"),
    others: items.filter((other) => other.id !== item.id),
  }));
});
