# XNH_WEBAPP_SVG-Conv

ブラウザ完結（ローカル処理のみ）の画像→SVG コンバーター Web アプリ。

## 設計方針

- **完全ローカル処理**：画像はネットワーク送信せず、Canvas / Web Worker / WASM ですべて処理する。
- **フレームワーク不使用**：HTML / CSS / JavaScript（ES Modules）のみで構成。ビルドステップなし。
- **PWA**：Service Worker + manifest でオフライン動作・インストール対応。
- **Web Worker**：トレース処理は UI を一切ブロックしない。
- **ベンダーライブラリは静的ファイルとして同梱**（CDN フェッチを避け、完全オフライン動作可能にする）。

## 技術スタック

| 領域 | 採用技術 |
| --- | --- |
| 言語 | HTML5 / CSS3 / JavaScript（ES2022 + ES Modules）|
| ビルド | なし（ブラウザがネイティブで読み込む）|
| 画像処理 | Canvas2D / OffscreenCanvas（前処理は自前実装）|
| トレース（B&W） | Potrace の JS 移植（vendor として同梱）|
| トレース（カラー） | ImageTracer.js（vendor として同梱、Worker 化）|
| SVG 最適化 | 自前ミニマル最適化（属性整理・小数点丸め）|
| PWA | Service Worker（手書き）+ Web App Manifest |
| 状態管理 | 自前の軽量 EventTarget ベースストア |
| i18n | 自前 JSON 辞書 + ロケール切替 |
| 開発サーバー | `python -m http.server` または任意の静的サーバー |

## ディレクトリ構成

```
/
├─ index.html                 # エントリ
├─ manifest.webmanifest       # PWA マニフェスト
├─ sw.js                      # Service Worker
├─ assets/                    # アイコン・画像
│  ├─ favicon.svg
│  └─ icons/                  # PWA アイコン
├─ styles/
│  ├─ base.css                # リセット・変数・テーマ
│  ├─ layout.css              # グリッド・分割プレビュー
│  └─ components.css          # 各 UI 部品
├─ js/
│  ├─ main.js                 # 起動・配線
│  ├─ store.js                # 状態管理（EventTarget ベース）
│  ├─ ui/
│  │  ├─ dropZone.js
│  │  ├─ preview.js           # 左右分割プレビュー
│  │  ├─ controls.js          # スライダ等
│  │  └─ toolbar.js
│  ├─ engine/                 # 純粋ロジック
│  │  ├─ preprocess.js
│  │  ├─ tracePotrace.js
│  │  ├─ traceImageTracer.js
│  │  └─ optimizeSvg.js
│  ├─ workers/
│  │  ├─ trace.worker.js
│  │  └─ preprocess.worker.js
│  └─ i18n/
│     ├─ index.js
│     ├─ ja.json
│     └─ en.json
└─ vendor/                    # サードパーティ（静的同梱）
   ├─ potrace/
   └─ imagetracer/
```

## 機能スコープ

### 変換モード
- 線画抽出（Canny / Sobel）
- センターライン抽出（細線化）
- アウトライン抽出（Potrace）
- カラートレース（ImageTracer）
- モノクロ 2 値化
- ステンシル / シルエット

### 前処理
明るさ / コントラスト / ガンマ / 彩度 / ノイズ除去 / シャープ / 背景除去（後期）/ リサイズ / クロップ / 回転・反転 / ヒストグラム均等化

### トレースパラメータ
減色数 / 2 値化しきい値（手動・大津法・適応的）/ パス単純化（Douglas-Peucker）/ ベジェフィッティング / コーナーしきい値 / スペックル除去 / オーバーラップ方式 / アンチエイリアス処理 / ストローク幅

### カラー制御
パレット編集 / 透過色指定 / 色抽出 / 同色グルーピング

### 出力
SVG / SVGZ（CompressionStream gzip）/ PNG / JPEG / WebP / PDF（最小単一ページ、FlateDecode 埋込）/ 小数点精度・属性整理・viewBox 保持・コードコピー

### UI/UX
ドラッグ&ドロップ / 左右分割ライブプレビュー / リアルタイム再トレース（debounce）/ ズーム・パン / Undo・Redo / プリセット / Before/After スライド比較 / ノード数・サイズ表示

### バッチ
複数形式入力（PNG/JPG/WebP/BMP/GIF/AVIF）/ 一括 ZIP 出力 / クリップボード貼付

### パフォーマンス
WASM / Web Workers / 進捗バー / キャンセル / 自動ダウンサンプル提案 / OffscreenCanvas

### プライバシー・配布
完全ローカル明示 / PWA / テレメトリなし

### アクセシビリティ
ダークモード / 日英切替 / キーボードショートカット / モバイル対応

---

## 開発フェーズと進捗

### Phase 1: 基盤セットアップ — ✅ 完了
- [x] `index.html` エントリ作成
- [x] CSS 基盤（リセット・変数・ダークモード）
- [x] `js/main.js` 起動配線
- [x] ディレクトリ・空モジュールのスタブ作成
- [x] 軽量ストア（EventTarget ベース）の骨格
- [x] Web Worker のスタブと配線確認（stub SVG を返す）
- [x] PWA manifest + Service Worker（最小キャッシュ）
- [x] 静的サーバーでの動作確認（全アセット 200、JS 構文 OK）

### Phase 2: 画像入力・基本 UI — ✅ 完了
- [x] DropZone（D&D・ファイル選択・クリップボード貼付） ※Phase 1 で先行実装
- [x] Canvas プレビュー（基本表示）
- [x] ズーム・パン（マウスホイール / ドラッグ / ピンチ / キー +/-/0）
- [x] 左右分割サイズの可変ドラッグ（縦表示時は上下、ダブルクリックで 50:50）
- [x] フィット / 拡大 / 縮小ボタン
- [x] Before/After スライド比較
- [ ] サムネイル / 複数画像時のリスト → Phase 7（バッチ処理）に集約

### Phase 3: 前処理 — ✅ 完了
- [x] 明るさ / コントラスト / ガンマ（LUT 1 パス適用）
- [x] 2 値化（しきい値・大津法）／ autoThreshold トグルで連動制御
- [x] ぼかし（box blur 3 パス＝近似ガウシアン）
- [x] グレースケール（edges モードの前段）
- [x] リアルタイムプレビュー連動（rAF debounce）
- [ ] シャープ化 / リサイズ → 必要が出た段階で追加（Phase 5/7）

### Phase 4: トレースエンジン統合 — ✅ 完了
- [x] 自前トレーサー（境界エッジ抽出 → CCW 閉路化）
- [x] Douglas-Peucker による単純化（パラメータ: simplify）
- [x] Catmull-Rom 風 Cubic Bezier 平滑化（パラメータ: smoothing）
- [x] Sobel エッジ抽出 + edges モード
- [x] median cut カラー量子化 + color モード（パラメータ: colors）
- [x] silhouette / outline / binary モード
- [x] Web Worker 化（progress / cancel / done メッセージ）
- [ ] Potrace 互換のベジェフィッティング（コーナー検出）— Phase 7 に再検討
- [ ] センターライン抽出（細線化）— Phase 7

### Phase 5: パラメータ調整 UI — ✅ 完了
- [x] パス単純化スライダ
- [x] スムージング
- [x] スペックル除去
- [x] 減色数（カラー時）
- [x] 線幅（edges / centerline 用）
- [x] プリセット（Logo / Sketch / Photo / Icon / Manga）
- [ ] コーナーしきい値（Phase 7 のベジェフィット強化と合わせて実装）

### Phase 6: SVG 出力・最適化 — ✅ 完了
- [x] 自前 SVG 最適化（小数桁丸め、空白圧縮、コマンド前空白除去）
- [x] SVG ダウンロード
- [x] SVGZ ダウンロード（CompressionStream gzip）
- [x] クリップボードコピー
- [x] ファイルサイズ・ノード数表示

### Phase 7: 高度機能 — ⏳ 進行中
- [x] Undo / Redo（store スナップショット、Ctrl+Z / Ctrl+Y）
- [x] カラーパレット表示（変換結果の fill から自動抽出、クリックで HEX コピー）
- [x] センターライン抽出（Zhang-Suen 細線化 + 連結折れ線追跡）
- [x] edges モードのストローク化（細線化を任意で適用、1 ピクセル幅のクリーンな線画）
- [x] ライブ再トレース（パラメータ変更時に 350ms debounce で自動変換）
- [x] 出力フォーマット拡張（SVG / SVGZ / PNG / JPEG / WebP / PDF）
- [ ] バッチ処理 + ZIP 出力（自前 STORE 形式 ZIP）
- [ ] カラーパレット編集（差し替え）
- [ ] 背景除去（onnxruntime-web）

### Phase 9: Adobe Express 風機能の取り込み — ⏳ 進行中
Adobe Express の画像→SVG ツールにある編集系機能を、完全ローカルのまま取り込む。
- [x] 9.1 フィルター/エフェクト（saturation / hueRotate / invert / sepia、preprocess パイプラインに統合）
- [x] 9.2 出力サイズテンプレート（正方 512/1024、アイコン 128、Instagram、X、YouTube、A4。SVG は viewBox 維持で width/height 書換、ラスタはスケールして出力）
- [x] 9.3 カラーパレット編集（パレットスウォッチを `<input type="color">` に拡張、変更で SVG 内の同色を即時一括置換、リセットボタン付き）
- [x] 9.4 前処理ブラシ（paint=黒 / erase=白、サイズ・硬さ、ソース canvas にオーバーレイ。viewport のパンと衝突しないようイベント抑止）
- [ ] 9.5 ベクター編集 UI（パス/グループ選択、移動・削除、テキスト追加、矩形/円/線/矢印追加、プロパティパネル）
- [ ] 9.6 頂点編集（パスの制御点追加・削除・ドラッグ、直線↔曲線切替）
- [ ] 9.7 背景除去（onnxruntime-web + U2-Net Lite / BiRefNet-tiny を vendor 同梱、ボタンで適用）

### Phase 8: 仕上げ — ⏳ 進行中
- [x] i18n（ja / en）— 全テキスト辞書化、ロケール切替
- [x] ダークモード（クラス切替 + prefers-color-scheme 連動）
- [x] ショートカット（Ctrl+Enter / Ctrl+S / Ctrl+Z / Ctrl+Y / Ctrl+V / +,-,0）
- [x] ヘルプダイアログ（`<dialog>` 要素ベース）
- [x] モバイル UI 調整（縦表示時に上下分割へ自動切替）
- [ ] PWA / オフライン動作の手動確認（Service Worker 登録のみ済）

---

## 開発・実行方法

ビルドツールは使わない。任意の静的ファイルサーバーで `index.html` を配信するだけ。

```sh
# 例: Python 同梱の簡易サーバー
python -m http.server 5173
# → http://localhost:5173/
```

Service Worker は `https://` または `http://localhost` でないと動作しないため、ローカルでも `file://` 直開きではなく必ず HTTP サーバー越しに開く。

## 実装メモ

- 画像処理の純粋関数は `js/engine/` に置き、Worker と UI 双方からテスト可能にする。
- Worker への画像転送は `ImageData` / `ArrayBuffer` の Transferable で zero-copy にする。
- Potrace / ImageTracer は `vendor/` に静的同梱し、Worker 内で `importScripts` または ES Module import する（Worker は `type: 'module'` で起動）。
- 大画像は事前に最大辺長で自動ダウンサンプル提案（例: 4096px 超で警告）。
- Service Worker のキャッシュはアプリ更新ごとに version bump で破棄する。
