# Tester 03 - Input UX Review

## 総評

入力実装は `getControls()` を中心にキーボード、ゲームパッド、タッチ仮想スティックまで揃っており、ブラウザゲームとしての土台は強いです。ただし「最高のFPVシム」「操作性はリアル」という目標に対しては、マウス/ポインタロック入力が未実装で、キーボード説明と実挙動にもズレがあります。特に `Throttle: L-Stick(Y) / W,S` と表示される一方、`getControls()` では `S` を読んでいません。

最大の改善ポイントは、PC向けに `canvas-container` / `renderer.domElement` で `requestPointerLock()` と `mousemove` を使ったマウス操縦を追加すること、そして `keydown`/`keyup` 周りの安全性とメニューのフォーカス管理を整理することです。

## 良い点

- `getControls()` がゲームパッド、タッチ、キーボードを一箇所で正規化しており、`state.lastControls` と `drawInputViz()` の入力可視化につながっている点は良いです。
- `setupMobileControls()` は `mobile-left-stick` / `mobile-right-stick` に `setPointerCapture()` を使っていて、指が少し外れても追従できる設計です。
- `mobile-btn-reset` / `mobile-btn-pause` が別ボタンで用意されており、タッチ環境でも最低限のリカバリ操作があります。
- `updateMenuNavigation()` によりゲームパッドの A/B、D-pad、左スティックで `screen-menu`、`screen-select`、`popup-settings` などを操作できる方向性は良いです。
- `input-rate`、`input-expo`、`input-deadzone`、`input-show` があり、感度調整と入力オーバーレイ確認ができるのはFPVシムとして好印象です。

## 操作説明と入力の問題

- `skyracers-fpv.html` のHUD説明では `Throttle: L-Stick(Y) / W,S` とありますが、`getControls()` で実装されているキーボードスロットルは `W` のみです。`S` は未使用です。
- `getControls()` のキーボードスロットルは `W` 押下中だけ `state.throttleStick` が増え、離すと即 `0` になります。FPVのリアルなスロットルというより、押しっぱなし上昇型です。リアル寄りなら保持式スロットル、下げるキー、アイドル/アームの概念が必要です。
- `requestPointerLock`、`pointerlockchange`、`mousemove`、`movementX/Y` がコード上存在せず、マウス操縦ができません。PCで「FPVシム」として入る初心者はマウス操作を期待しやすいので詰まります。
- `window.addEventListener('keydown', ...)` は全画面状態で `Escape` を `togglePause()` に渡しますが、`togglePause()` は `MENU` 以外なら動くため、`screen-select` や `popup-settings` 表示中でもポーズメニューが混ざる可能性があります。
- `keydown` / `keyup` は `e.key` ベースです。日本語配列や別配列では物理WASDの期待とずれるため、操縦は `e.code` の `KeyW` / `KeyA` / `KeyS` / `KeyD` の方が安定します。
- `R` / ゲームパッド X / `mobile-btn-reset` は `getControls()` から毎フレーム `resetRace()` に入るため、長押しで連続リセットになります。`Start` や A/B と同じく立ち上がり検出にした方が安全です。
- `window` の `blur` 時に `keys` をクリアしていません。Alt+Tabやブラウザ外クリックで `keyup` を取り逃すと、`W`、矢印、`A/D` が押されっぱなし扱いになるリスクがあります。
- `updateMenuNavigation()` の Bボタン処理は `popup-pause` で `#btn-quit` を拾うため、Bで「戻る/閉じる」のつもりがメニューへ退出になります。ポーズ中のBは `btn-resume` が自然です。

## アクセシビリティ/デバイス別修正

- `btn-pause` はアイコンのみで `aria-label` がありません。スクリーンリーダーでは用途が分かりにくいです。
- `popup-pause`、`popup-settings`、`popup-finish` に `role="dialog"`、`aria-modal="true"`、初期フォーカス、フォーカストラップがありません。`showPopup()` / `showScreen()` でフォーカス移動もしていません。
- ゲームパッド用の `.btn-focus` は見た目だけで、DOMの実フォーカスではありません。支援技術やキーボード操作と状態が同期しません。
- `selection-grid` 内の生成ボタンは `[data-action="select"]`、`[data-action="detail"]` が繰り返され、アクセシブル名が `Select Course` / `Detail` だけになります。コース名やドローン名を含む `aria-label` が必要です。
- `mobile-left-stick` / `mobile-right-stick` は `div` で、`role` やラベルがありません。タッチ専用UIとしては動きますが、アクセシビリティ上は何の操作子か伝わりません。
- `state.mobile.enabled` は初期ロード時の `prefersTouchControls` 固定です。リサイズ、折りたたみPC、タッチ対応デスクトップで切り替わりません。設定に「Touch Controls: Auto/On/Off」が欲しいです。
- 設定画面の `input-rate`、`input-expo`、`input-deadzone` はゲームパッドの `updateMenuNavigation()` で選択対象になりますが、値を左右入力で調整する処理がありません。ゲームパッドだけでは調整しづらいです。

## 優先度順TODO

1. `canvas-container` / `renderer.domElement` に `requestPointerLock()` と `mousemove` 操縦を追加し、マウス感度・反転・無効化設定を `popup-settings` に入れる。
2. `getControls()` のキーボード説明と実装を一致させる。最低限 `S` を実装するか、HUD説明から `S` を消す。
3. `keydown` / `keyup` を `e.code` ベースにし、操縦キーと矢印キーでは `preventDefault()`、`window.blur` で `keys` 全クリアを入れる。
4. `R`、ゲームパッド X、`mobile-btn-reset` を立ち上がり検出にし、長押し連続 `resetRace()` を防ぐ。
5. `togglePause()` を飛行中のみ有効にし、`Escape` は `popup-settings` なら閉じる、`popup-pause` なら再開、選択画面なら戻る、のように画面別へ分岐する。
6. `popup-pause` のゲームパッドBを `btn-resume` に割り当て、`btn-quit` 誤爆を避ける。
7. `showScreen()` / `showPopup()` で初期フォーカスを設定し、`popup-*` に `role="dialog"`、`aria-modal`、フォーカストラップを追加する。
8. `btn-pause`、生成される `selection-grid` 内の `Select` / `Detail` ボタン、`mobile-*` 操作子に具体的な `aria-label` を付ける。
9. `updateMenuNavigation()` で `input[type="range"]` 選択時に左右で値を変更できるようにする。
10. `state.mobile.enabled` を設定画面から切り替え可能にし、リサイズ時にも再評価する。
