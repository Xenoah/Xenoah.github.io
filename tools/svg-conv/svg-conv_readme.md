# SVG Converter
https://xenoah.github.io/tools/svg-conv/svg-conv.htm

ブラウザだけで完結する画像 → SVG コンバーター。
画像はネットワークに送信せず、すべてあなたのブラウザの中で処理されます。

> ラスター画像（PNG / JPEG / WebP / BMP / GIF / AVIF）をドロップして、
> モノクロ・線画・カラーのいずれかでベクター化します。
> ビルドツールもサーバー側処理も使っていません。

---

## このリポジトリの魅力

- **完全ローカル処理**
  画像は `<canvas>` と `Web Worker` で処理され、外部に一切送信されません。
  オフラインの PWA として動かせるので、機密ロゴや社内データの SVG 化にも安心です。

- **ビルドステップなし**
  `svg-conv.htm` と ES Modules だけで動く、いわゆる "no-build" 構成です。
  クローンしたディレクトリを静的サーバーに置くだけで起動します。
  `node_modules` も `vite` も必要ありません。

- **依存ゼロのトレースエンジン**
  Potrace や ImageTracer の WASM/JS 移植を vendor として同梱せず、
  境界エッジ抽出 → Douglas-Peucker → Catmull-Rom 風ベジェ平滑化を
  `js/engine/` 配下に自前実装しています。
  線画モードでは Zhang-Suen で 1 ピクセル幅まで細線化したのち
  連結折れ線をベクター化（センターライン抽出）します。

- **ライブ再トレース**
  ヘッダーの「ライブ」トグルを ON にすると、スライダ・モード・プリセット変更が
  そのまま SVG プレビューに反映されます（350ms debounce）。
  原画キャンバスの前処理プレビューは常時リアルタイムです。

- **多彩な出力フォーマットと出力サイズテンプレート**
  SVG / SVGZ に加えて PNG / JPEG / WebP / PDF をブラウザだけで生成。
  圧縮は `CompressionStream`、PDF は最小構成を自前構築しています。
  **元サイズ / 正方 512・1024 / アイコン 128 / Instagram / X ヘッダ / YouTube / A4** など
  出力サイズテンプレートに応じて SVG は viewBox 維持、ラスタはスケールして出力します。

- **フィルター/エフェクトとカラーパレット編集**
  彩度・色相回転・色反転・セピアの 4 種フィルターをスライダ／チェックで適用。
  `color` モードのパレットスウォッチはカラーピッカーになっており、
  クリックで SVG 内の同色 fill を**即時一括置換**、`✕` で元色に戻せます。

- **前処理ブラシ（加筆 / 消しゴム）**
  ソースキャンバス上で **黒で加筆 / 白で消去** ができます。
  トレース前に不要部分を削ったり、線を強調したりが可能。太さ・硬さも調整できます。

- **左右分割ライブプレビュー**
  原画とトレース結果を並べて表示し、Before/After スライダで重ね比較もできます。
  ズーム・パン・フィットはマウス / トラックパッド / タッチ / キー（`+ / - / 0`）すべて対応。

- **i18n / ダークモード / モバイル UI まで**
  日本語・英語の辞書同梱、`prefers-color-scheme` 連動のダークモード、
  狭画面では上下分割に自動切替。Service Worker でオフラインキャッシュ対応。

---

## クイックスタート

ビルド不要。任意の静的サーバーから配信するだけです。

```sh
cd tools/svg-conv

# 例: Python 同梱の簡易サーバー
python -m http.server 5173
# → http://localhost:5173/ をブラウザで開く
```

> **注意**: Service Worker は `https://` または `http://localhost` でなければ動きません。
> `file://` 直開きでは PWA 機能が無効になるので、必ずローカル HTTP サーバー越しに開いてください。

---

## 使い方

1. **画像を投入する**
   - ドラッグ＆ドロップ
   - 「画像を開く」ボタン
   - `Ctrl+V` でクリップボードから貼付

2. **モードを選ぶ**
   - `outline` … アウトライン抽出（黒の塗り）
   - `silhouette` … 影絵
   - `binary` … モノクロ 2 値
   - `edges` … 線画（Sobel + 任意で Zhang-Suen 細線化）
   - `centerline` … センターライン抽出（細線化 + 連結折れ線追跡）
   - `color` … カラー減色トレース

3. **パラメータを調整**
   - **前処理**: 明るさ / コントラスト / ガンマ / 彩度 / 色相回転 / ぼかし / 色反転 / セピア / 2 値化しきい値（手動 or 大津法）
   - **トレース**: パス単純化 / スムージング / スペックル除去 / 減色数 / 線幅 / 細線化（edges・centerline 用）
   - **プリセット**: Logo / Sketch / Photo / Icon / Manga
   - 変更はリアルタイムで原画プレビューに反映されます。

4. **（任意）原画を加筆 / 消去する**
   - 原画パネル右上のブラシツール（**↖ 無効 / ✎ 加筆 / ⌫ 消しゴム / ⟲ クリア**）を切り替えて、
     ソース画像にそのまま黒の加筆や白の消去を行えます。太さスライダ付き。
   - トレース前に不要な領域を消したり、途切れた線を補ったりできます。

5. **（カラーモード時）パレットを差し替える**
   - 変換後にサイドバーの「パレット」スウォッチをクリックするとカラーピッカーが開き、
     SVG 内の同色 fill が**即時一括置換**されます。
   - スウォッチ右上の `✕` で元の色にリセット。

6. **変換 → 保存**
   - 「変換」ボタン（または `Ctrl+Enter`）でトレース実行
   - ヘッダーの「ライブ」トグルを ON にすると、パラメータ変更がリアルタイムで再変換に反映
   - **出力サイズ**セレクタで `元サイズ / 正方 512・1024 / アイコン 128 / Instagram / X / YouTube / A4` から選択
   - **形式**セレクタから出力形式を選択（**SVG / SVGZ / PNG / JPEG / WebP / PDF**）し、「保存」ボタンでダウンロード
   - 「コピー」で SVG コードをクリップボードへ
   - 結果ファイルサイズとノード数はヘッダ右側に表示されます。

7. **比較する**
   - SVG プレビュー側の `⇄` ボタンで Before/After スライダ比較が開きます。
   - スライダはドラッグ、または矢印キーで動かせます。

---

## キーボードショートカット

| キー | 動作 |
| --- | --- |
| `Ctrl + Enter` | 変換実行 |
| `Ctrl + S` | SVG ダウンロード |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo（モード・前処理・トレースパラメータ） |
| `Ctrl + V` | クリップボードから画像を貼付 |
| `+` / `-` / `0` | ズームイン / アウト / フィット（プレビュー） |
| プレビューをダブルクリック | フィット |
| 分割バーをダブルクリック | 左右 50:50 にリセット |

ヘッダーの `?` ボタンでヘルプダイアログも開けます。

---

## 技術スタック

| 領域 | 採用技術 |
| --- | --- |
| 言語 | HTML5 / CSS3 / JavaScript（ES2022 + ES Modules） |
| ビルド | **なし**（ブラウザがネイティブで読み込む） |
| 画像処理 | `Canvas2D` / `OffscreenCanvas`（前処理は自前実装） |
| 前処理 | 明るさ・コントラスト・ガンマ（LUT 1 パス）・彩度／色相回転（HSL）・色反転・セピア・ぼかし（box blur 3 パス）・大津法 |
| トレース（塗り） | 境界エッジ抽出 + Douglas-Peucker + Catmull-Rom 風ベジェ |
| トレース（線画） | Zhang-Suen 細線化 + 連結折れ線追跡 + ベジェ平滑化 |
| エッジ検出 | Sobel フィルタ |
| 減色 / パレット | Median Cut + 変換後パレット編集（同色 fill 一括置換） |
| ブラシ編集 | 原画キャンバスにオーバーレイ canvas を合成（加筆＝黒、消しゴム＝白、半径フェード） |
| 出力形式 | SVG / SVGZ（gzip）/ PNG / JPEG / WebP / PDF（最小単一ページ・FlateDecode 埋込） |
| 出力サイズ | 元サイズ / 正方 512・1024 / アイコン 128 / Instagram / X / YouTube / A4（SVG は viewBox 維持で書換、ラスタはスケール） |
| SVG 最適化 | 小数点丸め・空白圧縮・コマンド前空白除去（自前ミニマル実装） |
| 圧縮 | `CompressionStream`（deflate / gzip） |
| PWA | Service Worker（手書き）+ Web App Manifest |
| 状態管理 | `EventTarget` ベースの軽量ストア（永続化＋Undo/Redo 内蔵） |
| 並列処理 | Web Worker（`type: 'module'`、Transferable で zero-copy） |
| i18n | JSON 辞書 + ロケール切替 |
| 開発サーバー | `python -m http.server` または任意の静的サーバー |

---

## プロジェクト構成

```
/
├─ svg-conv.htm               # エントリ
├─ manifest.webmanifest       # PWA マニフェスト
├─ sw.js                      # Service Worker
├─ assets/                    # アイコン・ファビコン
├─ styles/
│  ├─ base.css                # リセット・カラートークン・ダークモード
│  ├─ layout.css              # 三段レイアウト・分割プレビュー
│  └─ components.css          # 各 UI 部品
├─ js/
│  ├─ main.js                 # 起動・配線・Worker メッセージング
│  ├─ store.js                # 状態管理（EventTarget + Undo/Redo）
│  ├─ ui/
│  │  ├─ dropZone.js
│  │  ├─ preview.js           # 左右分割プレビュー + Before/After
│  │  ├─ viewport.js          # ズーム・パン
│  │  ├─ splitter.js          # 分割サイズ調整
│  │  ├─ brush.js             # 加筆/消しゴム用オーバーレイキャンバス
│  │  ├─ controls.js          # スライダ・モード・プリセット・パレット編集
│  │  └─ toolbar.js
│  ├─ engine/                 # 純粋ロジック（Worker からも呼べる）
│  │  ├─ preprocess.js        # 明るさ/コントラスト/ガンマ/彩度/色相/反転/セピア/ぼかし/大津法
│  │  ├─ tracer.js            # 境界エッジ抽出 + 単純化 + 平滑化
│  │  ├─ edges.js             # Sobel
│  │  ├─ thinning.js          # Zhang-Suen 細線化 + 折れ線追跡
│  │  ├─ quantize.js          # Median Cut
│  │  ├─ trace.js             # モード別ディスパッチ
│  │  ├─ optimizeSvg.js       # 最適化 / コピー / SVGZ
│  │  └─ export.js            # PNG / JPEG / WebP / PDF + 出力サイズテンプレート
│  ├─ workers/
│  │  └─ trace.worker.js
│  └─ i18n/
│     ├─ index.js
│     ├─ ja.json
│     └─ en.json
```

---

## ブラウザ対応

- Chrome / Edge / Firefox / Safari 最新版での動作を想定しています。
- 必須 API: `OffscreenCanvas`, `CompressionStream`, `<dialog>`, ES Modules, Web Worker (module type)。
- `CompressionStream` 非対応のブラウザでは SVGZ / PDF 書き出しは無効化、SVG にフォールバックします。

---

## ロードマップ

**完了済み:**

- Phase 1: 基盤セットアップ（HTML / CSS / ES Modules / PWA / Worker / 軽量ストア）
- Phase 2: 画像入力・基本 UI（ズーム・パン・分割・Before/After）
- Phase 3: 前処理（明るさ / コントラスト / ガンマ / ぼかし / 大津法）
- Phase 4: トレースエンジン（自前実装、Worker 化）
- Phase 5: パラメータ調整 UI とプリセット
- Phase 6: SVG 出力・最適化（コピー / SVGZ）
- Phase 7（部分完了）: Undo / Redo、カラーパレット表示、センターライン抽出、ライブ再トレース、出力フォーマット拡張（PNG/JPEG/WebP/PDF）
- Phase 8（概ね完了）: i18n（ja/en）、ダークモード、ショートカット、ヘルプダイアログ、モバイル UI
- **Phase 9.1〜9.4（Adobe Express 風機能）**:
  フィルター/エフェクト（彩度・色相回転・反転・セピア）／
  出力サイズテンプレート（正方・SNS・A4 ほか）／
  カラーパレット編集（同色 fill 一括置換）／
  前処理ブラシ（加筆 / 消しゴム）

**進行中・今後:**

- Phase 7（残り）: バッチ処理 + ZIP 出力 / 背景除去
- Phase 8（残り）: PWA オフライン動作の手動確認
- **Phase 9.5**: ベクター編集 UI（パス選択・移動・削除、テキスト/図形追加、プロパティパネル）
- **Phase 9.6**: 頂点編集（パスポイント追加・削除・ドラッグ、直線↔曲線切替）
- **Phase 9.7**: 背景除去 AI（onnxruntime-web + 軽量モデル同梱）

---

## ライセンス

このリポジトリのライセンスはまだ宣言されていません（プライベート利用前提）。
公開配布する場合は `LICENSE` ファイルを追加してください（MIT などが手堅いです）。

---
