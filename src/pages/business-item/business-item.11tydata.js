// Overrides the per-language pagination in pages.11tydata.json: paginate over
// language × business item instead.
export default {
  pagination: { data: "business_pages", size: 1, alias: "bp" },
  permalink: (data) => `${data.bp.lang.prefix}business/${data.bp.slug}/index.html`,
  eleventyComputed: {
    lang: (data) => data.bp.lang,
    page_key: () => "business_item",
    page_path: (data) => `business/${data.bp.slug}/`,
    page_title: (data) => data.bp.item.title,
    page_description: (data) => data.bp.item.summary,
  },
};
