# Tester 05 - Track And Tuning Review

## 総評

コース数、クラス別記録、セクター、ゴースト、FPV寄り物理の土台はかなり良いです。ただし「最高のFPVシム」として見ると、レース判定とチューニング導線がまだゲーム寄りです。特に `currentGate` の球形距離判定、非接触のゲートリング、未接続の `customStats` が大きな弱点です。

コースは `COURSE_LAYOUTS` 13種を `COURSE_THEME_GROUPS` 4テーマへ展開する52コース構成。実質的なラインは13種類で、最短のcompact系は約101-143m、通常系は約307-459m相当です。

## 良い点

- `COURSE_LAYOUTS` は `razorback`、`tunnelRush`、`overUnder`、`vaultDrop` などライン性が明確で、スプリント、トンネル、上下交差、ドロップの個性がある。
- `renderTrackAerialPreview(track)` でゲート番号付きの俯瞰ラインを表示できるため、初見コースの把握はしやすい。
- `rebuildGates()` の次ゲート強調は視認性が高い。次ゲートだけ `emissiveIntensity: 2.6`、黄色ビーム、`depthTest = false` なので迷子になりにくい。
- `updateLapData()`、`sectorBests`、`ghosts`、`captureLapSample()` があり、タイムアタックの反復要素は強い。
- 機体差は `DRONE_CLASS_PROFILES` と `normalizeDroneEntry()` で物理値化され、`speed`、`agility`、`weight`、`motorResponse`、`drag`、`batteryDrainBase`、`batteryDrainThrottle` に反映される。
- `getLoadedBatteryVoltage()` による電圧降下、`updatePhysics()` の二乗抗力、低スロットル高角速度時のwash揺らぎは、ブラウザゲームとしては良いリアル寄り表現。

## コース/チューニングの問題

- チェックポイント判定が `state.pos.distanceTo(g.posVec) < 5` の球形判定だけ。ゲート平面を通過したか、正面から抜けたか、リング内を通ったかを見ていない。
- `rebuildGates()` のゲートリングは `TorusGeometry` 表示のみで、`state.worldColliders` に入らない。ゲートフレームへ接触しても衝突しないため、FPVシムとしては甘い。
- `completeTimeAttackLap()` がゴール後すぐ `state.currentGate = 0`、`state.startTime = Date.now()` に戻す一方、`getTrackLengthMeters()` と `renderTrackAerialPreview()` は最終ゲートから第1ゲートへの戻り区間を含めない。連続ラップ時の実走距離と表示距離がズレる。
- `switchyard` と `patioSlalom` は最大旋回角が約131度、`spireWeave` は約111度、`arenaSplit` は約116度。5インチ機体では面白いが、初見では視認より暗記寄りになりやすい。
- `vaultDrop` は高度差44m、`skylineStep` は36mあるが、`drawCompass()` は水平方位と距離中心で、次ゲートの上下差を強く伝えない。
- `overUnder` のような上下交差コースは、俯瞰プレビューだけだと上下関係が読みづらい。
- `custom-drone-panel`、`input-cust-speed`、`input-cust-agility`、`input-cust-weight`、`state.customStats` は存在するが、選択画面では常に hidden にされ、`getSelectedDroneStats()` や `updatePhysics()` に使われていない。
- 有効なチューニングは `settings.rate`、`settings.expo`、`settings.deadzone` の操縦感度のみ。ドローンチューニングというよりRC設定。
- `getBestTimeKey(trackId, droneClassId)` のため、記録はクラス単位。`racing_fpv_5inch_mach_r5_sport_01` と `racing_fpv_5inch_nazgul_evoque_f5_v3_01` のような同クラス内機体差がランキング上は分離されない。
- rotated系 `tunnel`/`arch`/`bridge` は `addTrackProp()` 内で各パーツの向きだけ回転し、部品の相対配置はローカル回転されていないため、見た目と当たり判定の形状が意図からズレる可能性がある。

## 最高のFPVシムに向けた修正

- ゲート判定を `distanceTo < 5` から、ゲート平面交差 + ローカル座標内半径判定へ変更する。対象は `updatePhysics()` の `currentGate` 判定。
- ゲートリングにも軽量コライダーを追加する。少なくともリング外周/支柱接触で `resolveWorldCollisions()` 相当のダメージが入るべき。
- コースを「オープンライン」か「周回コース」か明示する。周回なら `getTrackLengthMeters()`、`renderTrackAerialPreview()`、`getSectorGateIndices()` に最終→第1ゲート区間を含める。
- `drawCompass()` に次ゲートの上下差、例: `+12m` / `-8m` を追加する。`vaultDrop`、`skylineStep`、`overUnder` の学習性が上がる。
- `renderTrackAerialPreview()` に高度色、交差注意、トンネル/壁/橋の概略も出す。現状はラインだけなので、障害物の記憶に弱い。
- `customStats` を廃止するか、正式な機体チューニングとして `getSelectedDroneStats()` に合成する。最低でも `speed`、`agility`、`weight`、`motorResponse`、`drag`、`cameraAngle`、`throttleExpo` をUIに出したい。
- 記録キーを必要に応じて `trackId::droneClassId::droneId` に拡張する。同クラス内の性能差をタイムアタックとして公平に扱える。
- compactコースには推奨クラス制限または警告を付ける。`microPulse` は最短101m、ゲート間14.8-18.6mで、5インチの全開タイムアタックには短すぎる。

## 優先度順TODO

1. `updatePhysics()` のゲート通過判定を、球形距離判定からゲート平面 + 内径判定へ変更する。
2. `rebuildGates()` のゲートリングに衝突判定を追加し、フレーム接触をクラッシュ/減速に反映する。
3. `completeTimeAttackLap()`、`getTrackLengthMeters()`、`renderTrackAerialPreview()` の周回距離仕様を統一する。
4. `custom-drone-panel` と `state.customStats` を実際の物理値へ接続するか、未使用UIとして削除する。
5. `drawCompass()` とHUDに次ゲートの高度差を追加する。
6. `addTrackProp()` の rotated `tunnel`/`arch`/`bridge` パーツ配置をローカル回転込みにする。
7. `getBestTimeKey()` をクラス単位のままにするか、機体単位へ分けるか設計判断する。
8. compactコースと大型/高速機体の組み合わせに推奨表示または制限を入れる。
