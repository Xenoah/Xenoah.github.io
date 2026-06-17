# Project Memory: XNH_WEBAPP_pic2gif

## プロジェクト概要
- **アプリ**: Pic2GIF — 画像を GIF アニメーションに変換するブラウザ完結型 Web アプリ
- **公開先**: GitHub Pages (Jekyll)
- **構成**: 単一 HTML ファイル (`index.html`)

## 技術スタック
- React 18.2.0 (CDN, UMD)
- Babel Standalone 7.23.5 (JSX トランスパイル)
- Tailwind CSS (CDN, darkMode: 'class')
- gif.js 0.2.0 (CDN) — GIF エンコーダー
- Inter フォント (Google Fonts)

## 重要な実装メモ

### gif.js Worker の扱い
- cross-origin 制約を避けるため、`fetch()` で worker.js を取得 → `Blob URL` に変換して使用
- `blobUrlRef.current` に保持、アンマウント時に `URL.revokeObjectURL()`

### 品質パラメータ変換
- UI スライダー: 1〜10 (10=高品質)
- gif.js quality: 1〜20 (1=高品質)
- 変換: `gifQuality = max(1, round(21 - uiQuality * 2))`

### 出力サイズ
- 幅: ユーザー指定
- 高さ: 1枚目フレームのアスペクト比から自動計算
- フレームスケーリング: レターボックス（白背景）

## ファイル構成
- `index.html` — メインアプリ
- `read.md` — 仕様書・作業メモ（詳細はこちら）
- `_config.yml` — GitHub Pages 設定
- `README.md` — リポジトリ概要

## ユーザー好み
- 日本語 UI 優先
- 作業内容と仕様は `read.md` に記録していく
