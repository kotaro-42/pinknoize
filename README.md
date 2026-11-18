# Pink Noise

**Web Audio のみ**の PWA。実行ファイルは次のとおり。

```text
index.html  style.css  sw.js  manifest.json  js/app.js
```

旧 RNBO 関連は `archive/rnbo-legacy/` と `export/` に**保管のみ**（`index.html` からは読み込まない）。

## なぜフォルダに残っていても動かないわけではないか

ブラウザが読むのは **`index.html` が `<script>` で指定したものだけ**です。  
`guardrails.js` や `rnbo.min.js` がディスク上にあっても、HTML に書いてなければ**実行されません**。

表示が古いときの原因はほぼ **Safari のキャッシュ / Service Worker** です（`index.html` 冒頭で v9 から古いキャッシュ削除）。

## 本番

https://kotaro-42.github.io/pinknoize/

画面に **「v9 Web Audio」** と出れば新しい版。

## キャッシュ

`sw.js` の `CACHE_NAME`（現在 `pink-noise-v9`）