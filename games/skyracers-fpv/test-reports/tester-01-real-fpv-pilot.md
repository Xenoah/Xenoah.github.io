# Tester 01 - Real FPV Pilot Review

## 総評

コード変更なしでレビューしました。ローカル試遊は、利用可能なブラウザ自動操作/Playwright/Puppeteer/OSブラウザが見つからず不可でした。なお `skyracers-fpv.html` は Tailwind と Three.js をCDN読み込みしており、ローカル起動時もネットワーク依存があります。

結論として、ゲームとしてはコース、ゴースト、クラス別記録、HUDが揃っていて良いです。ただし「リアルFPVシム」としてはまだ中間地点です。`js/game.js:updatePhysics()` は Acro 風の姿勢制御ですが、推力・重力・重量・レート・カメラ角がゲーム用スカラーで処理されており、実機5インチのスロットル感、慣性、プロップウォッシュ、PID感とはかなり違います。

## 良い点

- `js/game.js:getControls()` は Mode 2 風に、左スティックを throttle/yaw、右スティックを pitch/roll に割り当てている点はFPVパイロットに近いです。
- `state.quat` と `state.angVel` を使い、セルフレベリングなしで角速度を積分しているため、基本思想は Angle モードではなく Acro/Rate 寄りです。
- `input-rate`, `input-expo`, `input-deadzone` が `state.settings.rate/expo/deadzone` に反映され、最低限のレート調整があります。
- `getLoadedBatteryVoltage()`、`batteryDrainBase`、`batteryDrainThrottle` による電圧降下表現は、ゲーム的ながらFPVらしい雰囲気作りに効いています。
- `completeTimeAttackLap()`、ゴースト、セクター、ランキング、クラス別ベストがあり、ゲーム性はかなり良いです。
- HUDの `drawInputViz()`、`drawCompass()`、`drawHorizon()` はテスターや初心者に有用です。

## 操作性の問題

- `js/game.js:getControls()` のキーボード操作は `W` で `state.throttleStick += 0.04`、離すと即 `0` です。UIには `W,S` とありますが、`S` によるスロットルダウンが実装されていません。
- キーボードスロットル上昇量がフレーム依存です。高fpsほどスロットルが早く上がるため、操作再現性が落ちます。
- ゲームパッドスロットルは `rawThrot = -leftY` で中央が0スロットルです。実FPV送信機のスロットルは基本的に非センタリングなので、通常のゲームパッドでは仕方ないものの、リアル操作としてはキャリブレーションとスロットルモード選択が必要です。
- `padDz = Math.max(state.settings.deadzone, 0.15)` によりゲームパッドスロットルだけ実質15%デッドゾーンになります。細い高度維持が難しくなります。
- `rate/expo/deadzone` が全軸共通です。FPVでは roll/pitch/yaw 別のRC rate、super/expo、最大deg/s表示が欲しいです。
- `animate()` のカメラは `Math.PI / 6`、つまり30度が固定です。実FPVではカメラ角20〜60度を機体・速度・コースで変えるため、固定はかなり痛いです。

## リアルFPV化に必要な修正

- `js/game.js:updatePhysics()` の `targetAv = new THREE.Vector3(c.pitch * rs, c.yaw * rs, -c.roll * rs)` はRateモード風ですが、PID、モーター出力、慣性テンソル、モーターミキサーがありません。少なくとも「stick -> target deg/s -> PID -> torque -> angular acceleration」に分けたいです。
- 推力が `thrustCurve * stats.speed * 4.0` で決まっています。`stats.speed` が垂直推力にも効くため、ホバー位置や加速が実機パラメータとして解釈しづらいです。`massKg`、推力重量比、最大推力N、空気抵抗を分離してください。
- 重力が `CONSTANTS.GRAVITY * stats.weight` で、`weight` が質量ではなくゲーム倍率です。`drone-data.js` の `massKg` を中心にした物理へ寄せるべきです。
- `if (c.throttle < 0.28 && angSpeed > 3.5)` のランダムな wash は雰囲気はありますが、実機のプロップウォッシュ再現としては雑です。降下速度、迎角、スロットル変化、姿勢角速度に基づく減衰/乱れにしたいです。
- ゲート通過判定が `state.pos.distanceTo(g.posVec) < 5` の球判定です。ゲート面を正しい方向に通過したか、前フレーム位置との線分がゲート平面を交差したかで判定しないと、横抜けや逆走気味の通過が成立します。
- `resolveWorldCollisions()` の衝突半径 `radius = 1.2` は全機体共通です。Tiny Whoop と大型機で当たり判定が同じなのはリアルでもゲームバランスでも不自然です。

## 優先度順TODO

1. `js/game.js:getControls()` のキーボードスロットルを修正。`S` 実装、dtベース化、スロットル保持/減少、キーリピート非依存にする。
2. `state.settings` に `cameraAngleDeg`、軸別 `rollRate/pitchRate/yawRate`、`rollExpo/pitchExpo/yawExpo`、ゲームパッド軸反転、スロットルキャリブレーションを追加。
3. `js/game.js:updatePhysics()` を、`massKg`、推力重量比、最大推力、慣性、PID/Rate controller に分解する。
4. `stats.speed * 4.0` で推力を決める設計を廃止し、水平最高速と垂直推力を別パラメータ化する。
5. `animate()` の固定 `Math.PI / 6` カメラ角を設定化し、FOVの速度連動もオフ可能にする。
6. ゲート判定を `distanceTo < 5` から、ゲート平面交差 + 枠内判定 + 通過方向判定に変更。
7. `resolveWorldCollisions()` の `radius = 1.2` を機体サイズ由来にし、接触時の姿勢・速度減衰を機体重量で変える。
8. HUDにFPV OSDらしい throttle%、RSSI風表示、armed/disarmed、lap delta、低電圧警告を追加。
