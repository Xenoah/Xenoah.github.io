# Tester 02 - Game Feel Review

## 総評

操作シム部分はかなり良いです。`updatePhysics()` のスロットル曲線、重力、ドラッグ、バッテリーサグ、プロップウォッシュ風の揺れ、FOV変化は「リアル寄りFPV」として説得力があります。

一方で、ゲームとしての報酬提示とリトライ導線が未接続です。特に `popup-finish` はUIがあるのに通常完走時の `completeTimeAttackLap()` から表示されず、`btn-finish-reset` / `btn-finish-menu` / `btn-finish-replay` が実質的に到達困難です。「最高のFPVシム」に近い素材はあるが、「遊び続けたくなるレースゲーム」としてはループ整理が必要です。

## 良い点

- `screen-menu` から `btn-mode-timeattack` / `btn-mode-freeselect` / `btn-settings-open` が明確で、初期メニューの入口は分かりやすい。
- `screen-select` の `selection-grid`、`renderTracks()`、`renderDroneClasses()`、`renderDrones()` による「コース、クラス、機体」選択は本格的。
- `course-briefing`、`detail-panel-card`、`track-aerial-preview`、`renderTrackAerialPreview()` は、プレイ前にコースを読む導線として良い。
- `hud-timer`、`hud-sector-1` から `hud-sector-3`、`hud-sector-delta`、`hud-ghost-status` により、タイムアタックとしての情報量は十分。
- `updateLapData()`、`updateBestTime()`、`renderLeaderboardPanel()`、`ghostRecord` により、ベスト、セクター、ランキング、ゴーストの継続要素がある。
- `respawnAtCurrentGate()` とクラッシュ時ペナルティ加算は、練習性とレース継続性のバランスが良い。
- コースは `COURSE_LAYOUTS` と `COURSE_THEME_GROUPS` の組み合わせで量があり、`microPulse`、`patioSlalom`、`pocketOrbit` のコンパクト系は練習向き。

## ゲーム性の問題

- 完走報酬が見えにくい。`completeTimeAttackLap()` は `finish-time` や `finish-rank` を更新するが、`popup-finish` を表示しないため、結果画面が通常プレイで出ない。
- レース導線が長い。`btn-start-race` は `state.selectDroneConfirmed` まで無効で、初回はコース選択、クラス選択、機体選択、Start の4段階になる。すぐ飛びたいプレイヤーには重い。
- `screen-freeselect` は練習用に見えるが、`renderFreeFlightTracks()` から `OPEN_WORLD` に入るだけで、ゲート練習、区間練習、ゴースト練習がない。
- ゲート判定が `state.pos.distanceTo(g.posVec) < 5` の球判定のみで、ゲート面の通過方向やラインクロスを見ていない。リアルなFPVレースとしては甘く、逆方向・横抜けでも成立しやすい。
- `startReplay()` 後、`updateReplay()` の終了時に `stopReplay(false)` が呼ばれ、結果へ戻らず `resetRace()` される。リプレイが報酬ではなくリセットに感じられる。
- HUD上は `Throttle: L-Stick(Y) / W,S` とあるが、`getControls()` のキーボード処理では `W` のみで、`S` は未使用。
- `custom-drone-panel` と `state.customStats` は存在するが、選択導線では常に hidden にされ、実際の機体性能にも反映されない。期待だけ作っている。
- 報酬データが分散している。`xnh_best_times` は cookie、`xnh_lap_data_v1` は localStorage、さらに `exportSave()` はランキング、ゴースト、セクターを含めない。

## 修正すべきUX/ループ

- 完走時のループを決めるべきです。自動で次ラップ継続するなら `popup-finish` を廃止または「Lap Summary Toast」に寄せる。結果画面を出すなら `completeTimeAttackLap()` で `popup-finish` を表示して一時停止する。
- `btn-finish-replay`、`btn-finish-reset`、`btn-finish-menu` は現在のゲームループと噛み合っていません。通常完走、ポーズ、リプレイ終了の3導線を統一する必要があります。
- `screen-select` に「Quick Start」か「Use Default Drone」を追加し、既定の `state.droneId` で `btn-start-race` を押せるようにしたい。
- `screen-freeselect` は「Practice」として再設計し、ゲート表示あり/なし、現在ゲートへリスポーン、区間だけ走る、ゴースト表示だけ走る、を選べると練習価値が出ます。
- `hud-ghost-status` と `detail-ranking-body` の報酬情報は良いので、完走直後にも必ず見せるべきです。
- モバイルの `mobile-btn-reset` は全リセットだけでなく、`respawnAtCurrentGate()` 相当の「Gate Respawn」も欲しいです。

## 優先度順TODO

1. P0: `completeTimeAttackLap()` 後の完走導線を確定し、`popup-finish` を表示するか、到達不能な結果UIを削除してHUDラップ継続型に統一する。
2. P0: `startReplay()` / `stopReplay()` / `btn-finish-replay` の流れを修正し、リプレイ終了後に結果画面または次ラップ待機へ戻す。
3. P1: `screen-select` の初回導線を短縮し、`state.droneId` のデフォルト選択で `btn-start-race` を有効化する。
4. P1: `OPEN_WORLD` を練習モード化し、`respawnAtCurrentGate()`、ゴースト、セクター練習を使えるようにする。
5. P1: ゲート判定を距離球ではなく、ゲート平面通過と進行方向で判定する。
6. P2: `getControls()` のキーボード説明と実装を一致させる。`S` をスロットルダウンにするか、HUD文言から外す。
7. P2: `exportSave()` / `importSave()` に `state.bestTimes` と `state.lapData` を含め、報酬継続性を守る。
8. P3: `custom-drone-panel` / `state.customStats` を正式機能化するか、UIから削除する。
