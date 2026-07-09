# Tester 04 - Performance Review

## 総評

ブラウザ実行確認は制約ありです。ローカル headless Chrome/CDP で起動を試しましたが、この環境では Chrome 側の GPU process / Crashpad / `DawnGraphiteCache` 周りで落ち、実プレイ相当の FPS 数値・スクリーンショット確認までは到達できませんでした。以下は静的レビューと起動試行結果に基づく評価です。コード変更はしていません。

完成度は高めですが、「最高のFPVシム」を狙うには、フレーム安定性のための固定物理ステップ、HUD更新の間引き、ゲート再構築の抑制、CDN依存の解消が優先課題です。

## 良い点

- `games/skyracers-fpv/js/game.js` は Three.js を正面から使っており、`new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" })`、`THREE.Clock`、`requestAnimationFrame(animate)` の基本構成は妥当です。
- `configureRendererForQuality()` に `FLAT` / `TEXTURED` / `CINEMATIC` があり、`renderer.setPixelRatio()` を `CINEMATIC` でも `Math.min(devicePixelRatio, 1.5)` に抑えている点は良いです。
- `clearWorldObjects()` と `clearGhostVisuals()` で `geometry.dispose()` / `material.dispose()` を呼んでおり、ワールド再生成時の最低限の GPU リソース破棄は入っています。
- `window.addEventListener('resize', ...)` で `camera.aspect`、`camera.updateProjectionMatrix()`、`renderer.setSize()` を更新しており、基本的な画面リサイズには対応しています。
- `js/error-handler.js` は `window.onerror`、resource `error`、`unhandledrejection` を拾って `loading-screen` に失敗表示を出すため、CDN読み込み失敗時の無反応化は避けられています。
- `setupMobileControls()` は Pointer Events と `touch-action: none` を使っており、仮想スティックの入力設計自体はブラウザ向けとして良い方向です。

## パフォーマンス/互換性の問題

- `skyracers-fpv.html` が `https://cdn.tailwindcss.com` と `https://unpkg.com/three@0.160.0/build/three.min.js` に起動時依存しています。ネットワーク不通、CDN障害、CSP制限、学校/企業ネットワークで即起動不能になります。
- `new THREE.WebGLRenderer(...)` 周辺に WebGL 事前判定や `try/catch` がありません。`error-handler.js` で例外表示は出せますが、WebGL非対応・コンテキストロスト時の専用案内や復旧処理はありません。
- `animate()` で `updateHUD()` が毎フレーム呼ばれ、`updateHUD()` は多数の `textContent` / `className` 更新、`getElementById()`、`drawCompass()`、`drawHorizon()` を実行します。DOM更新と2D Canvas描画が描画ループに密結合しており、低スペック端末でフレーム落ち要因になります。
- `updatePhysics(dt)` は `dt = Math.min(clock.getDelta(), 0.1)` の可変ステップです。FPS低下時に操作感・衝突・ゲート通過判定が変わるため、「操作性はリアル」という目標には固定タイムステップが欲しいです。
- `rebuildGates()` がゲート通過ごとに全ゲートの `TorusGeometry` / `MeshStandardMaterial` を作り直し、次ゲート用に `PointLight` と `CylinderGeometry` ビームも再生成します。チェックポイント通過の瞬間にGC/ GPU負荷スパイクが出やすいです。
- `buildTerrainMesh()` は `PlaneGeometry(1000, 1000, 96, 96)` または `128,128` を毎回生成します。画質変更時の `refreshCurrentWorldVisuals()` も `generateWorld()` で丸ごと再生成するため、設定変更中に大きなスタッターが出ます。
- シャドウは初期状態で `renderer.shadowMap.enabled = true`、`sun.shadow.mapSize` が `2048`、多くの `addWorldBox()` が `castShadow` / `receiveShadow` 有効です。モバイルや内蔵GPUではかなり重い構成です。
- モバイル判定の `prefersTouchControls` は起動時一度だけです。`window.innerWidth < 1024` と UA 判定に依存するため、リサイズ/回転/タブレット/タッチPCで表示状態がずれる可能性があります。
- モバイルHUDは `hud-timer-container` の `min-w-[220px]`、左右のHUD、右上ポーズボタン、下部の左右スティックが同時表示されます。390px幅級では重なりや視界阻害のリスクがあります。
- `error-handler.js` の `showFailure()` は `innerHTML` に `safeMessage` / `safeDetail` を直接埋め込んでいます。エラー表示としては便利ですが、文字列エスケープなしは実装上のリスクです。

## 修正すべき実装

- `skyracers-fpv.html`: CDN版 Tailwind と Three.js をローカル配布に切り替える。Tailwind はビルド済みCSS、Three.js は固定バージョンのローカルファイルにする。
- `js/game.js`: `new THREE.WebGLRenderer()` を `try/catch` 化し、WebGL非対応・`webglcontextlost`・`webglcontextrestored` の専用UIを追加する。
- `animate()` / `updatePhysics(dt)`: 可変 `dt` 物理を固定ステップに変更する。例: 1/120秒または1/60秒 accumulator、最大サブステップ数制限。
- `updateHUD()`: DOM参照を初期化時にキャッシュし、HUD更新を10-20Hz程度に間引く。値が変わった時だけ `textContent` / `className` を更新する。
- `rebuildGates()`: 毎回全破棄せず、ゲートMesh/Material/Lightを事前生成して色・透明度・表示状態だけ更新する。`TorusGeometry` と beam geometry は共有する。
- `configureRendererForQuality()`: shadow map size、`castShadow`、`receiveShadow`、pixel ratioを画質ごとにより明確に落とす。低FPS検出時の自動品質ダウンも入れる。
- `refreshCurrentWorldVisuals()`: 画質変更でワールド丸ごと再生成せず、既存materialの差し替え・shadow設定更新に留める。
- `setupMobileControls()` / `updateUI()`: `matchMedia('(pointer: coarse)')` と viewport を `resize` / `orientationchange` で再評価し、モバイルHUDのportrait/landscape専用レイアウトを作る。
- `error-handler.js`: `innerHTML` 直書きではなく `textContent` でメッセージを組み立てる。

## 優先度順TODO

1. P0: CDN依存を解消し、Three.js/Tailwindをローカル固定化する。
2. P0: WebGL初期化失敗・context lost の専用エラー表示を実装する。
3. P1: `updatePhysics(dt)` を固定タイムステップ化して、FPS低下時も操作感を安定させる。
4. P1: `updateHUD()` を間引き、DOM更新とCanvas HUD描画を毎フレームから切り離す。
5. P1: `rebuildGates()` の全再生成をやめ、ゲートオブジェクトを再利用する。
6. P2: shadow map、pixel ratio、地形解像度、cast/receive shadow を画質ごとに再調整する。
7. P2: モバイルHUD/仮想スティックの重なり確認とレスポンシブ調整を行う。
8. P3: 実機Chrome/Edge/Safari/Firefoxでロード時間、FPS、context lost、回転、タッチ操作を計測する。
