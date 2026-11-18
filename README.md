# Pink Noise

iPad 向けピンクノイズ PWA（RNBO Web Export）。**優先度と制約**は [docs/SPEC.md](docs/SPEC.md) を正とする。

## 優先度（要約）

1. **オフライン** — 初回同期後、ネットなしで起動・再生・音量（SW + IndexedDB + 同梱 RNBO）
2. **画面オフ継続** — ベストエフォート（Web では保証不可。SPEC 参照）
3. **バックグラウンド** — ベストエフォート（同上）
4. **再生・停止**
5. **音量** — GainNode（パッチ不変更）

## 本番 URL

https://kotaro-42.github.io/pinknoize/

**初回はオンラインで開く** →「オフライン利用可」表示後、機内モードで確認。

ホーム画面に追加（スタンドアロン）を推奨。

## ローカル開発

```sh
npx http-server
```

`file://` では動作しません。

## キャッシュ更新

`sw.js` の `CACHE_NAME` を上げる（現在 `pink-noise-v4`）。`index.html` の `app.js?v=*` も同期。

## Phase 2（画面オフ・BG を保証する場合）

ネイティブシェル（Capacitor 等）+ バックグラウンド音楽モード。詳細は [docs/SPEC.md](docs/SPEC.md)。