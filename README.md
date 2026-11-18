# Pink Noise

シンプルな PWA（RNBO + 単一 `app.js`）。仕様は [docs/SPEC.md](docs/SPEC.md)。

## 構成

```text
index.html  style.css  sw.js  manifest.json
js/rnbo.min.js  js/app.js   ← アプリ本体はここだけ
export/Pinknoise.json       ← 変更しない
```

## 互換性

- **iOS / iPadOS 13.4+** 推奨（`localStorage` + `fetch` + RNBO）
- **iOS 12 以下** は未保証
- `file://` 不可。HTTPS または `localhost` で配信

## 本番

https://kotaro-42.github.io/pinknoize/

初回オンライン →「オフライン利用可」→ 機内モードで確認

## 更新時

`sw.js` の `CACHE_NAME` を変更（現在 `pink-noise-v6`）