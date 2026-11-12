# d-seng

智聖科技股份有限公司（D-SENG TECHNOLOGY CO., LTD.）官網，網域 `d-seng.com.tw`。

用 [Eleventy](https://www.11ty.dev/) 產生靜態網頁，GitHub Actions 建置後部署到 GitHub Pages。

## 本機開發

```bash
npm install
npm run serve        # http://localhost:8765/ ，存檔自動重新整理
npm run build        # 輸出到 _site/
npm run check-i18n   # 檢查各語言檔的結構是否與繁中一致
```

## 結構

- `src/pages/*.njk`：6 個頁面（首頁、關於我們、事業項目、人才招募、下載專區、聯絡我們），每頁自動產生 4 種語言。
- `src/_data/i18n/{zh-tw,zh-cn,en,ja}.json`：所有文字。**`zh-tw.json` 是主稿**，其他語言的 key 結構必須完全相同，部署時會檢查。
- `src/_data/site.js`：電話、Email、語言清單等共用設定。
- `src/_includes/`：共用版面。

網址：繁中 `/`、簡中 `/zh-cn/`、英文 `/en/`、日文 `/ja/`。

改文字：先改 `zh-tw.json`，再同步改其他三個語言檔的同一個 key。

## 環境

| 環境 | 網址 | repo | 部署方式 |
|---|---|---|---|
| 正式 | https://d-seng.com.tw/ | `D-SENG-TECH/official-website` | 推 `main` |
| 預覽 | https://dev.d-seng.com.tw/ | `D-SENG-TECH/official-website-dev` | 推到 dev repo 的 `main` |

預覽站會加上 `noindex` 與 `robots.txt` 禁止搜尋引擎收錄，頁尾版號前顯示 `DEV`。

```bash
git remote add dev https://github.com/D-SENG-TECH/official-website-dev.git   # 只需一次
git push dev HEAD:main --force   # 把目前分支推到預覽站
```

## 版號

頁尾的版號在部署時由 `git describe --tags --always` 產生，並連到對應的 commit。本機顯示 `dev`。

- 剛好在 tag 上：`v1.0.0`
- tag 之後還有 commit：`v1.0.0-2-gabc1234`（tag 之後第 2 個 commit，hash 為 `abc1234`）

發新版：

```bash
git tag -a v1.1.0 -m "v1.1.0" && git push origin v1.1.0
gh workflow run pages.yml
```

Pages 只從 `main` 部署，推 tag 不會觸發部署，所以打完 tag 要手動執行一次。

## 內容原則

這是公開網站。身分證、銀行帳號、股權比例、資本額、個人電話、客戶名稱與訂單、毛利、併購討論都不放進這個 repo，內部 PDF、簡報與會議紀錄也不要 commit 進來。彰京開發是唯一的關係企業；技術來源公司與合作夥伴不具名。
