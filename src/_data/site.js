// Languages: zh-tw is the source of truth; every other i18n file must have the same keys.
export default {
  url: "https://d-seng.com.tw",
  email_info: "service@d-seng.com.tw",
  email_hr: "hr@d-seng.com.tw",
  phone: "03-5550718",
  phone_intl: "+886-3-5550718",
  phone_tel: "+88635550718",
  fax: "03-5550918",
  fax_intl: "+886-3-5550918",
  // Structured-data address (schema.org PostalAddress)
  org_address: { street: "環北路一段269巷68號3樓", locality: "竹北市", region: "新竹縣", postal_code: "302" },
  // Pin for the contact map (Lane 269, Huanbei Rd Sec. 1, Zhubei)
  office: { lat: 24.8417, lng: 121.0194 },
  // Browser key for the styled Google Map; restrict it to the site domains in Google Cloud.
  // Empty → the contact page falls back to a tinted OpenStreetMap.
  maps_key: process.env.GOOGLE_MAPS_API_KEY || "",
  repo: `https://github.com/${process.env.GITHUB_REPOSITORY || "D-SENG-TECH/official-website"}`,
  // Google Tag Manager container (GA4 is configured inside GTM). Loaded on production only,
  // so preview-site testing does not pollute analytics.
  gtm_id: "GTM-TWTN3GKQ",
  // "dev" on the preview site (dev.d-seng.com.tw): adds noindex and a DEV badge
  env: process.env.SITE_ENV || "production",
  // Set by the deploy workflow; local builds show "dev"
  build_version: process.env.BUILD_VERSION || "dev",
  build_commit: process.env.BUILD_COMMIT || "",
  pages: ["", "about/", "business/", "careers/", "downloads/", "contact/"],
  langs: [
    { code: "zh-tw", og_locale: "zh_TW", html: "zh-Hant-TW", label: "繁體中文", prefix: "/", font: "Noto+Sans+TC" },
    { code: "zh-cn", og_locale: "zh_CN", html: "zh-Hans-CN", label: "简体中文", prefix: "/zh-cn/", font: "Noto+Sans+SC" },
    { code: "en", og_locale: "en_US", html: "en", label: "English", prefix: "/en/", font: "Noto+Sans" },
    { code: "ja", og_locale: "ja_JP", html: "ja", label: "日本語", prefix: "/ja/", font: "Noto+Sans+JP" },
  ],
};
