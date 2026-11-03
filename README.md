# d-seng

智聖科技股份有限公司（D-SENG Technology）靜態官網，網域 `d-seng.com.tw`。

純 HTML/CSS，沒有建置步驟。網站根目錄是 `public/`，部署時只發布這個資料夾。

本機預覽：

```bash
python3 -m http.server 8000 -d public
```

## 版號

頁尾的版號在部署時由 `git describe --tags --always` 產生，並連到對應的 commit。本機預覽顯示 `dev`。

- 剛好在 tag 上：`v1.0.0`
- tag 之後還有 commit：`v1.0.0-2-gabc1234`（tag 之後第 2 個 commit，hash 為 `abc1234`）

發新版：

```bash
git tag -a v1.1.0 -m "v1.1.0" && git push origin v1.1.0
```

Pages 只從 `main` 部署，推 tag 不會觸發部署。打完 tag 後執行 `gh workflow run pages.yml`（或到 Actions 手動執行），頁尾就會換成新版號。

## 內容原則

這是公開網站。身分證、銀行帳號、股權比例、個人電話、客戶名稱與訂單、毛利、併購討論都不放進這個 repo，內部 PDF 與會議紀錄也不要 commit 進來。
