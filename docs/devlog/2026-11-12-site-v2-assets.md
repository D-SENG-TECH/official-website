# 2026-11-12 — 官網 v2：logo、照片與材料頁圖庫

## 08:10 — logo「鋸齒」檢查

- **檢查結果**：
  - 新 SVG 的路徑放大 8 倍仍然平滑。
  - CSS 沒有 `image-rendering`、`transform` 等會讓瀏覽器降低解析度的屬性。
  - 在 1x 與 2x 解析度下截圖，瀏覽器都有正常做反鋸齒。
- **研判原因**：logo 高 46px 時寬度是 201.78px 的小數像素。在 1x 或 1.25x 這類非整數縮放的螢幕上，邊緣會落在半個像素上。
- **決策**：
  - header logo 寬度固定為 202px，footer 為 176px，讓寬度落在整數像素。原本的 `preserveAspectRatio` 會自動置中，不會變形。
  - SVG 根元素加上 `shape-rendering="geometricPrecision"`。
- **替代方案**：
  - 加大 logo 尺寸：會改變設計，沒有採用。
  - 輸出成 PNG：失去向量的優勢，沒有採用。
- **結論**：S 形標誌中間的白色縫隙在 46px 高時只剩約 2px，1x 螢幕本來就難免有些顆粒感。若仍不滿意，可以考慮做一個小尺寸專用、縫隙加寬的版本。

## 08:40 — 材料頁圖庫的取材原則

- **來源**：丁基橡膠墊片報告與奈米超晶體簡報。
- **排除的頁面**：
  - 有客戶廠區名稱、廠內標示或客戶代稱的頁面，包括客戶代稱。
  - 第三方檢測報告的頁面。
- **採用的內容**：產品照、CAD 剖面、EPDM 與 IIR 的實物剖面對照、加壓測試，以及接點剖面示意圖。
- **處理**：加壓測試照片裁掉時間與地點浮水印。
- **版面**：
  - 照片以 `object-fit: contain` 呈現，剖面圖與示意圖不會被裁切。
  - 照片說明放在 i18n 的 `item.gallery`；其他事業項目給空陣列，讓四種語言的結構一致。

## 09:30 — AI 監測結尾：導流到 3D demo

- **決策**：移植 `LiveDemoFinale.tsx` 收尾卡（QR → 開始導覽 → 聯絡），文案改成「智聖科技提供」，拿掉原版的品牌自稱標語與 QR 下方的外部網址文字；聯絡改用 site.js 的智聖信箱與電話。
- **背景**：原版背景是常駐的 dev-air iframe（WebGL 廠房），這裡改用已遮廠名的靜態底圖，並裁掉風機編號列與右下的「開始導覽」膠囊，避免重複按鈕；按下開始導覽才載入 iframe 全螢幕，Esc／關閉鈕還原，連結本身保留 `target=_blank` 當無 JS 與 Cmd+點擊的備援。
- **替代方案**：常駐 iframe 背景——每次進頁都載一個 WebGL 場景、手機更吃力，原版在手機也已經改成底圖。
- **風險（待業主處理）**：dev-air 訪客場景的麵包屑顯示客戶廠名，違反「不公開客戶名稱」；需要產品端訪客模式改成「某科技廠」後再上正式站。
- **相片區**：主圖與相片格改 `object-fit: cover` 填滿（業主不要白邊）；gallery `src` 改帶資料夾，材料與焊接共用同一個模板。

## 10:40 — 聯絡我們改全版面地圖

- **決策**：全版面地圖 + 自繪 pin（logo 深藍底、金色圓點）+ 左圖右文的資訊卡，卡片錨在 pin 上方、高度控制在半個螢幕內；標題疊在地圖左上，桌機把 pin 推到右側避開標題。
- **地圖來源**：業主要 Google 地圖客製樣式，這需要 Maps JavaScript API 的瀏覽器金鑰（iframe 嵌入無法改配色）。金鑰由 GitHub repo variable `GOOGLE_MAPS_API_KEY` 在建置時帶入（瀏覽器金鑰本來就公開，靠 HTTP referrer 限制保護，不進 repo）；沒設定時改用 Leaflet + OpenStreetMap，圖磚以 CSS filter 調成同一組藍灰色。pin 與卡片是同一個伺服器端渲染的元素，兩種地圖都只是把它掛到地圖圖層上。
- **踩雷**：Leaflet 的 `.leaflet-marker-pane img { width: auto }` 權重比 `.contact-card__photo` 高，照片寬度被撐開蓋住文字；改用更高權重的選擇器。`img` 的 height 屬性也會讓 grid 列被照片原始高度撐高，所以照片改成絕對定位在容器內、高度跟著文字欄走。
- **座標**：Nominatim 查「環北路一段269巷」得 24.8417, 121.0196，和業主 Google 地圖截圖的 pin 位置一致；site.js 用 24.8417, 121.0194。

## 11:20 — 地圖只留路名與區域名；備援改 MapLibre + OpenFreeMap

- **決策**：業主要求地圖除了路名、區域名之外什麼都不顯示。OSM 標準圖磚的圖示是烤在點陣圖裡的，濾不掉；改用 OpenFreeMap（免金鑰、可商用）的向量圖磚，以 MapLibre 繪製，從 positron 樣式只保留 highway-name-minor/major 與 label_village/town/city/other 這幾個文字圖層，其餘 symbol 圖層全部丟掉，顏色改成與 Google 版同一組。Google 版的 styles 也改成全部 labels 關掉、只開 road 與 administrative.locality/neighborhood 的文字。
- **踩雷**：第三方地圖 CSS 的同權重規則會蓋掉我們的樣式——MapLibre 的 `.maplibregl-map { position: relative; font: 12px Helvetica }` 讓地圖容器高度歸零、卡片字型變掉；先前 Leaflet 的 `.leaflet-container a { color: #0078A8 }` 讓深藍按鈕上的字變藍（業主回報看不清楚）。一律改用 `.contact-map …` 前綴提高權重。

## 11:50 — SEO：OG 圖、結構化資料、sitemap

- **OG 圖**：每個語言一張 1200×630（`assets/og/og-<lang>.jpg`），左側深藍底 + logo + 標語 + 六項事業，右側台元園區大樓實景；用 Playwright 把 HTML 版型截圖產生（腳本未進 repo，版型簡單，需要時重做即可）。日文標題在「、」後強制換行，避免「革新」被拆開。
- **meta**：首頁 og:description 用品牌標語，其餘頁用該頁 description；加 og:locale / alternate、og:image 尺寸與 alt、twitter:summary_large_image、theme-color。
- **JSON-LD**：每頁一份 Organization（地址拆成 PostalAddress、座標、電話、傳真、email、512px 方形 logo）；事業細頁與彰京產品頁加 BreadcrumbList。字串一律經 Nunjucks `dump`，避免多語文字破壞 JSON。
- **sitemap.xml**：13 個路徑 × 4 語言，每筆帶 xhtml:link hreflang 與 x-default。**robots.txt**：正式站允許全部並指向 sitemap；預覽站沿用部署流程覆寫成 Disallow。
- **og:image 指向正式網域**：預覽站分享時會抓不到圖，直到正式站上線——刻意如此，canonical 本來就指向正式站。

## 12:20 — OG 圖改版：拿掉照片，改成品牌圖形

- **決策**：業主看到分享預覽後認為太老派、照片縮小後看不出招牌。改成深色漸層 + 細點陣底、logo 的 S 圖形放大切出右側（金色漸層、深藍部分改半透明）、兩行大標題（第二行金色漸層）、一行副標，拿掉照片與事業標籤。
- **logo 圖形改成端正完整**（業主不喜歡傾斜裁切），配色同深底版 logo（白＋金）。檔名再改成 `brand-<lang>.jpg`：Facebook／LINE 依圖片網址快取，換檔名才會抓新圖。
- **替代方案**：保留照片改大圖滿版——招牌在 1200×630 的縮圖裡仍然太小，文字也難壓在照片上。
