# SYNTH MATCH SPECTRA

## 基本情報

- 配置場所: `games/synth-wave-match/synth-wave-match.html`
- 公開時のリンク: `https://xenoah.github.io/games/synth-wave-match/synth-wave-match.html`
- ジャンル: 音作り・シンセパラメータ一致ゲーム
- 実装形式: HTML / CSS / JavaScript の単体ページ
- 主な使用技術: Web Audio API、Canvas、Cookie

## ゲーム概要

相手の音を聴き、右側のシンセラックで自分の音を調整して、ターゲット音に近づけるゲームです。波形や周波数、フィルター、ディレイ、歪み、各種エフェクトを操作し、`CHECK / 判定` で一致度を確認します。

## モード

- レベル指定プレイ: Lv.1 から Lv.100 まで任意の難易度で開始できます。
- クイックスタート: Lv.1、Lv.10、Lv.40、Lv.100 をすぐ開始できます。
- FREE: 判定を気にせず、シンセとエフェクトを自由に調整できます。

## 操作

- `T`: 押している間、ターゲット音を再生
- `Space`: 押している間、自分の音を再生
- `Enter`: 判定
- 画面右上の設定: ゲーム音量と UI SE 音量を調整

## レベル解放要素

- Lv.1: 周波数
- Lv.2: 波形
- Lv.5: LPF
- Lv.10: 歪み、ディレイ
- Lv.20: サブ VCO
- Lv.30: レゾナンス、HPF
- Lv.40 以降: BitCrush、Tremolo など全機材

Lv.26 以上、Lv.51 以上では判定の許容誤差がさらに厳しくなります。

## 保存仕様

Cookie 保存を許可した場合、音量設定、最後に到達したレベル、ベストスコアが保存されます。初回表示時に Cookie 保存の確認ダイアログが表示されます。

## 主なエフェクト

Reverb、Chorus、Flanger、Phaser、Auto Pan、Vibrato、Ring Mod、Overdrive、Fuzz、Saturation、Wavefolder、SampleRate Reducer、Band Pass、Notch、Compressor、Gate、Noise、Stereo Width、Vocoder、Granular、Spectral Morph、Convolution IR、Poly Pitch などを備えています。
