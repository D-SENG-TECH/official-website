# 產品介紹旁白

首頁 3D 展間的旁白音檔（`src/assets/product-animation/narration/<語言>/<片段>.mp3`）由這裡產生。

- `script.json`：四種語言的旁白文稿、各語言的語音與語速、每段的秒數上限（`budget_s`，旁白要在該產品字幕淡出前講完）。
- `gen.py`：用 edge-tts 把文稿轉成 mp3（24 kHz、48 kbps 單聲道，前後靜音修掉），並檢查每段有沒有超過秒數上限、有沒有被截斷。
- `manifest.json`：上次產生時各段的實際秒數。

## 改旁白

1. 改 `script.json` 裡的文字。
2. 在 repo 根目錄執行：

   ```sh
   python3 scripts/narration/gen.py --out src/assets/product-animation/narration
   ```

   只重做部分片段：`--lang zh-tw`、`--only aimon,nano`。只檢查秒數不重做：`--check`。
3. 輸出若有 `OVER`，代表超過秒數上限，把那段文字改短再跑一次。

需要先安裝 `edge-tts`（`pip install edge-tts`）、`ffmpeg`、`ffprobe`。
