# Pink Noise

**Web Audio だけ**でピンクノイズを再生する PWA。実行時に Max / RNBO は不要。

`export/` は Max からの RNBO 書き出し置き場（参照用・将来用）。音は `js/app.js` 内のアルゴリズムで生成。

## 構成

```text
index.html  style.css  sw.js  js/app.js
```

（`js/rnbo.min.js` と `export/Pinknoise.json` はオフライン用キャッシュから外してよい）

## 互換性

- Safari / iOS 向け。`AudioContext` と `localStorage` があれば動作
- RNBO より古い iPad / iPhone で起動しやすい

## 本番

https://kotaro-42.github.io/pinknoize/

## キャッシュ更新

`sw.js` の `CACHE_NAME`（現在 `pink-noise-v8`）