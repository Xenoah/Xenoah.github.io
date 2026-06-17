# VJ FX Maker — 実装メモ / フェーズ計画

## ゴール
ブラウザ単体で動作する **AE 風 UI + タイムライン + キーフレーム** を持つ VJ 用エフェクトメーカー。
`index.html` 単一ファイル、外部 CDN 無し、HTML/CSS/JS のみで完結。

---

## フェーズ計画 (確定スコープ)
フェーズ完了ごとcommentしてcommitしpushして
> 進捗ステータス: ⏳=未着手 / 🚧=実装中 / ✅=完了

### Phase 0 — 基盤再構成 (UI レイアウト + ジャンル分け + パネルリサイズ)  ✅
- [x] CSS を AE 風 5 ペイン (Top / Left / Center / Right / Bottom) に再構築
- [x] 全 51 効果に `cat` (カテゴリ) 付与: Generate / Transform / Color / Light / Blur / Distort / Glitch / Time
- [x] 左パネルにカテゴリ別折畳式エフェクトライブラリ
- [x] 右パネルは「選択中レイヤのコントロール」専用に
- [x] 下パネルにタイムライン枠 (中身は Phase 2)
- [x] 上ツールバーに BPM/録画/全画面/プリセット集約
- [x] **E10**: 左/右/下パネルの境界をドラッグでリサイズ

### Phase 1 — レイヤースタック & 効果選択  ✅
- [x] エフェクトを「レイヤー」概念に変更 (同じ効果を複数追加可能)
- [x] ライブラリの効果クリックで「+ 追加」ボタン → レイヤー追加
- [x] レイヤー一覧 (タイムラインの縦軸) で選択状態管理
- [x] 右ペインに選択レイヤのパラメータ詳細表示
- [x] レイヤー削除/複製/並び替え/有効化トグル
- [x] **E9**: 効果の複製 (同じレイヤをコピー)

### Phase 2 — タイムライン基盤  ✅
- [x] コンポジション: duration (4〜60秒), timeMode (sec | beat)
- [x] プレイヘッド (横線), ドラッグでスクラブ
- [x] 再生/停止/巻き戻し/ループ ON-OFF ボタン
- [x] 現在時刻表示 (timecode)
- [x] **E2**: ショートカット (Space=再生, ←→=±1f, Home=先頭, End=末尾, I/O=In/Out 設定)
- [x] In/Out ポイント (デフォルト 0〜duration)
- [x] BPM グリッドスナップ (1拍/半拍/8分音符単位選択)
- [x] スクラブ中もリアルタイム反映
- [x] 時間軸の目盛り描画 (秒表示 / ビート表示)
- [x] 各エフェクトレイヤーをクリップ化し、開始/終了範囲をタイムライン上でドラッグ編集

### Phase 3 — キーフレーム  ✅
- [x] 各レイヤを展開 → パラメータ毎にキーフレーム行
- [x] ◆追加 ボタン (現在時刻に現在値で打つ)
- [x] キーをクリックして選択 → ドラッグで時刻移動
- [x] 削除 (Delete キー)
- [x] 線形補間 (デフォルト)
- [x] レンダ時はキーフレーム評価値を `eff.values` に上書き
- [x] **E4**: キーフレームコピペ (Ctrl+C/V) — 現在選択キー → 現在時刻に貼付

### Phase 4 — 録画範囲 & MP4 出力  ✅
- [x] In/Out 区間だけ録画 (再生位置を In に飛ばし→ Out に到達で自動停止)
- [x] **A1**: `MediaRecorder` で `video/mp4;codecs=avc1` 優先 → WebM フォールバック
- [x] 録画中の状態表示・進捗バー
- [x] 拡張子は実際の出力形式に合わせて `.mp4` or `.webm`

### Phase 5 — プリセット拡張  ✅
- [x] **E3**: プリセット JSON にキーフレーム、クリップ範囲、composition / scenes / FFT トリガー設定 / MIDI バインドを含める
- [x] バージョン番号 v3 で旧版 v1 / v2 も読込可
- [x] ランダム生成: キーフレームもランダム化 (各レイヤ 2〜4個ランダム時刻に打つ)

### Phase 6 — Undo/Redo  ✅
- [x] **E1**: コマンドパターン (操作ごとに undo/redo 関数を持つコマンドを履歴に積む)
- [x] 対象操作: レイヤ追加/削除/移動/有効化、クリップ範囲変更、パラメータ変更、キーフレーム追加/削除/移動
- [x] Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) で巻き戻し/やり直し
- [x] スクラブやスライダー連続入力は debounce してまとめる

### Phase 7 — A/B シーン + クロスフェーダ  ✅
- [x] **E5**: scenes = [A, B] 2スロット、each に独立した layers
- [x] アクティブシーン (編集対象) 切替ボタン (A | B)
- [x] クロスフェーダ (上ツールバーのスライダ): 0=A / 1=B / 中間=blend
- [x] レンダ: 必要な側のみ描画 (両端なら片側スキップ)、最終ステージで blend
- [x] プリセットに両シーン保存

### Phase 7.5 — FFT トリガー + パーティクル  ✅
- [x] `AnalyserNode.getByteFrequencyData()` による指定周波数帯レベル取得
- [x] FFT Hz / width / threshold / edge (rise | fall | both) の UI
- [x] 短い trigger envelope を生成し、各レイヤー共通 `fftTrig` で amount を変調
- [x] Generate カテゴリに `particles` を追加
- [x] density / size / spread / glow / spin / tunnel / streak / style / color A/B を持つパーティクルシェーダ

### Phase 8 — MIDI 入力  ✅
- [x] **E6**: Web MIDI API で MIDIAccess 取得
- [x] パネルから MIDI Learn モード ON
- [x] パラメータ右の「M」ボタン → 次に来た CC/Note を bind
- [x] CC: 0–127 を min..max にマップしてパラメータ更新
- [x] Note On: enabled トグルや「キーフレーム追加」のトリガに割当可
- [x] バインド一覧パネル + 解除

### Phase 9 — オーディオ波形をタイムライン表示  ✅
- [x] **E7**: 音声ファイル読込時に AudioContext.decodeAudioData で peaks 抽出
- [x] タイムライン背景に波形を描画
- [x] BPM bar との位置合わせ (オーディオ start = composition 0 と仮定)

### Phase 10 — グラフエディタ  ✅
- [x] **E8**: パラメータ行にグラフモード切替 (G)
- [x] 値の時系列を曲線として描画 (canvas overlay)
- [x] キーフレーム点をドラッグ (時刻 + 値)
- [x] 補間: 線形 (Ease/Hold は今回スコープ外、後日)

### Phase 11 — AE風ワークスペース + 上部バー/右クリック操作  ✅
- [x] After Effects 風の Project / Composition / Info / Audio / Preview / Effects & Presets / Effect Controls / Timeline 構成へ整理
- [x] 2 段トップバーに素材/音声読込、プリセット、録画、MIDI、再生、A/B、XFade、エフェクト追加、Particles、音声入力、表示切替を集約
- [x] 右クリックメニューを追加し、プレビュー/タイムライン/レイヤー上で再生、In/Out、素材読込、エフェクト追加、レイヤー複製/削除、録画、PNG、表示切替を実行可能
- [x] 右サイドパネルに Info / Audio / Preview / Effects & Presets の簡易操作面を追加し、Effect Controls と併用できる構成に変更

### Phase 12 — 波形可視化 / FFT・In-Out のレイヤー個別化  ✅
- [x] **波形を見れるように**: ルーラー直下に専用 `.timeline-wave` ストリップ (44px) を追加、ミラー描画 + グラデーション。プレイヘッドはルーラーと波形ストリップの両方を貫通。波形ストリップ自身もスクラブ可能。リサイズ追従。
- [x] **FFT 連動をエフェクトごとに**: 各レイヤーに `fft: {freq, width, threshold, edge, gain}` (+ runtime `_level/_gate/_env`) を保持。Effect Controls にレイヤー専用 FFT サブパネル (← global / → global コピー対応)。pollAudio で全シーンのレイヤー毎に `updateLayerFftTrigger()`。`effectiveAmount(values, layer)` と shader uniform `u_freq/u_trigger` がレイヤー値を使用。
- [x] **In/Out をエフェクトごとに**: Effect Controls に "Layer In / Out" サブパネル (数値入力 + @playhead ボタン + full)。`Shift+I` / `Shift+O` で選択レイヤー In/Out をプレイヘッドに設定 (素の `I` / `O` はコンポ用)。右クリックメニューに「現在時刻を Layer In/Out」追加。
- [x] **プリセット v4**: `version: 4`、各レイヤーに `fft` 同梱、`audioTrigger.gain` 追加。v1/v2/v3 を互換読込 (グローバル `audioTrigger` を fallback として全レイヤーに転写)。

### Phase 13 — タイムライン拡大縮小 + オーディオ同期 + 再生コントロール再配置  🚧
- [x] **タイムライン拡大縮小**: `state.view = {zoom, scroll}` 導入、`timeToPct()` / `pctToTime()` / `viewVisibleDuration()` ヘルパに集約。ルーラー / 波形 / クリップバー / キーフレーム / グラフ / クリップドラッグ / キードラッグの全箇所がビューポート経由
  - [x] `Ctrl + ホイール` = カーソル位置中心のズーム、`Shift + ホイール` / トラックパッド水平 = 横スクロール
  - [x] `=` / `+` / `-` / `_` でズーム、`\` でリセット
  - [x] スクロールバー (12px) を timeline-list 直下に追加。サム位置/幅は zoom と scroll に追従、クリックでジャンプ、ドラッグで連続スクロール
  - [x] `setTimelineTime()` から `ensurePlayheadVisible()` を呼びプレイヘッド外出時に自動スクロール
  - [x] **同軸化**: `--track-offset: 232px` の CSS 変数で `.timeline-head` (ヘッダ部) と `.lane-row` (各レイヤ行) を同じグリッド (`var(--track-offset) 1fr`) に統一。ヘッダのルーラー/波形と各レイヤのクリップバー/キーが完全に同じ x 軸上に並ぶ
  - [x] ヘッダ左の th-spacer にズームボタン (＋/−/⤧) と現在ズーム率 (`x1.0`) を表示
  - [x] timelineList に薄い縦線 (list-playhead) を追加し、レイヤ行を貫通するプレイヘッド表現
  - [ ] (後日) 目盛り間隔をズーム率に応じて自動調整 (1s → 0.5s → 0.1s → 1f)
- [ ] **オーディオをタイムシークバーと連動** (未着手):
  - 再生開始/停止/シークで `audio.elem.currentTime = state.play.time + offset` を反映
  - スクラブ中は audio 一時停止 (高速ジャンプによるノイズ回避)、ドロップ後に再開
  - 再生中はリアルタイム監視: `Math.abs(audio.elem.currentTime - state.play.time) > 0.05` で再同期
  - audio item ごとに `offset` (秒) を持たせ、コンポ 0 と音声先頭をずらせるように
  - ループ時 (`outPoint` 到達 → `inPoint` ジャンプ) も audio.currentTime を巻き戻し
- [x] **再生コントロールをプレビュー直下へ追加**:
  - センターペインの canvas 直下に `#previewControls` バーを新設
  - 巻戻し / 1f戻し / 再生・停止 / 1f送り / 末尾 / ループトグル / In マーク / Out マーク / 現在時刻+全体長 / **全体シークバー (zoom 非依存、常に 0–duration)** を実装
  - 全体シークバーには loop 範囲ハイライト + フィル + サムを表示。ドラッグでスクラブ、クリックでジャンプ
  - 上部ツールバーの既存 transport ボタンは撤去せず併存 (互換性維持)
- [x] **キーフレーム上書きバグ修正**: パラメータにキーフレームがある状態でスライダーを動かすとプレイヘッド時刻のキーが自動的に更新/作成される (AE auto-keyframe 風)。`setParamValueAtPlayhead()` を導入、`makeRange` / `makeColor` が共通利用

### Phase 14 — ファイルプール (Project パネル) + マルチソース対応  ⏳
- [ ] **左ペインに Project パネル (素材プール)** を新設
  - リスト項目: 種別アイコン (image/video/audio) + サムネ + 名称 + duration / 解像度
  - ドラッグ&ドロップで追加、複数選択追加、削除、リネーム
  - クリックで選択 / ダブルクリックで「現在のソース」(映像 or 音声) に割当
  - 既存のエフェクトライブラリは Project の下に Effects パネルとして同居 (既存の左ペインを 2 ペインに分割)
- [ ] **マルチソース状態モデル** (旧 `state.source` を `state.pool` + `state.activeSource` へ置換):
  ```js
  state.pool = {
    items: [
      {id, kind: 'image'|'video'|'audio'|'demo', name, url, file, dataUrl?, duration?, width?, height?, thumb?},
      ...
    ],
    activeVideoId: null,    // 映像ソースとして選ばれている item の id
    activeAudioId: null,    // 音声ソースとして選ばれている item の id
    nextItemSeq: 1
  }
  ```
- [ ] **同時編集**: 複数の audio/video/image 項目を保持しつつ、現在の活性ソースだけが描画 / 再生に使われる。切替のたびに `state.source.dirty = true` でテクスチャを更新
- [ ] **動画/画像のサムネイル生成**: 読込時に 2D canvas にダウンスケール描画し、Project リストに表示
- [ ] **音声波形キャッシュ**: audio item 毎に peaks 配列を保持し、active 切替時に `rebuildTimelineRuler()` を呼んで波形を入れ替え
- [ ] **(任意/将来)**: レイヤーごとに source override (現在は global activeVideoId)。今フェーズではスコープ外
- [ ] 付随仕様: メモリ対策として動画ファイル本体は `URL.createObjectURL()` のみ保持し、プロジェクト保存時に「埋込/参照」を選択可能 (Phase 16 と連動)

### Phase 15 — After Effects 互換キーバインド  ⏳
- [ ] **トランスポート系**:
  - Space: 再生/停止 (既存)
  - `J` / `K` / `L`: 巻戻し / 停止 / 早送り (シャトル風、複数回押下で速度段階)
  - `Page Up` / `Page Down`: 1f 前 / 1f 後 (← →は維持)
  - `Shift + Page Up` / `Page Down`: 10f 前 / 10f 後
  - `Home` / `End`: コンポ先頭 / 末尾 (既存)
  - `Shift + Home` / `End`: 直前/直後のキーフレーム
- [ ] **In/Out マーカー系**:
  - `B` / `N`: ワークエリア (= comp In/Out) を「現在時刻に開始」/「現在時刻で終了」
  - `I` / `O`: コンポ In/Out (既存)
  - `Shift + I` / `Shift + O`: レイヤー In/Out (既存)
  - `[` / `]`: 選択レイヤー In/Out をプレイヘッドにトリム
  - `Alt + [` / `]`: 選択レイヤー全体をプレイヘッド位置にスライド
- [ ] **編集系**:
  - `Ctrl + D`: 選択レイヤー複製 (既存ツールバーボタンと統一)
  - `Ctrl + Shift + D`: 選択レイヤーをプレイヘッドで分割 (新規実装、内部的に複製 + 各 In/Out 調整)
  - `Delete` / `Backspace`: 選択レイヤー or 選択キー削除 (既存)
  - `F2` / `Enter`: 選択レイヤーをリネーム (新規 `layer.label` フィールド)
  - `Ctrl + A`: 全レイヤー選択 (将来の複数選択対応の足場)
  - `Ctrl + Z` / `Ctrl + Shift + Z` / `Ctrl + Y`: undo/redo (既存)
- [ ] **表示系**:
  - `;` (セミコロン): タイムラインを全幅にズームリセット
  - `=` / `-`: タイムライン拡大 / 縮小 (Phase 13 と連動)
  - `U`: 選択レイヤーの「キーフレームありプロパティ」のみ展開
  - `UU`: 選択レイヤーの「変更されたプロパティ」のみ展開
  - `S` / `T` / `R` / `P`: 透明度/位置/回転/スケール … VJ FX 用に `A=amount`, `S=speed`, `M=mix` にマッピング
- [ ] **ヘルプ**: `?` で全キーバインド一覧オーバーレイ
- [ ] 付随仕様: 入力ターゲットが `<input>` / `<select>` / `<textarea>` / `contenteditable` のときはホットキーを発火させない (一部既存)

### Phase 16 — プロジェクト保存 / 読出  ⏳
- [ ] **プロジェクトファイル形式 `.vjproj`** (内部は JSON):
  ```json
  {
    "format": "vjfx-project",
    "version": 1,
    "savedAt": "2026-...",
    "preset": { /* Phase 5 の preset v4 をそのまま埋込 */ },
    "view": { "zoom": 1.0, "scroll": 0, "leftW": 280, "rightW": 330, "bottomH": 210 },
    "pool": {
      "activeVideoId": "P3",
      "activeAudioId": "P5",
      "items": [
        {"id":"P3","kind":"video","name":"loop.mp4","embed":true,"dataUrl":"data:video/mp4;base64,..."},
        {"id":"P5","kind":"audio","name":"track.wav","embed":false,"href":"./assets/track.wav"}
      ]
    },
    "transport": { "time": 0, "loop": true }
  }
  ```
- [ ] **保存**: メニュー / ショートカット (`Ctrl + S`) で `.vjproj` をダウンロード
  - 「素材を埋め込む / 参照のみ」をダイアログで選択 (大容量警告: 動画 > 50MB は警告)
  - 埋込時は `FileReader.readAsDataURL` で base64 化 (※ 動画は数十〜数百 MB に膨らむため明示確認)
- [ ] **読出**: `Ctrl + O` で `.vjproj` を選択 → 既存状態を破棄して復元
  - 参照モード (`href`) は `dataUrl` を持たないので、不在ならプロジェクトロード後に再添付ダイアログ
  - `preset` 部分は既存の `importPreset()` パスを再利用 (v1〜v4 互換)
- [ ] **プロジェクト名 + メタ**: `state.project = {name, savedAt, dirty}` を持ち、未保存変更時はタブタイトルに `*` を付ける
- [ ] **新規プロジェクト** (`Ctrl + N`): 全状態を初期値に戻す
- [ ] **直近プロジェクト** (任意): localStorage に最後に開いた `.vjproj` の名前 / handle を保持し、起動時に「再読込」ボタン
- [ ] **自動保存** (任意/将来): 30 秒間アイドルで localStorage に圧縮版 (preset のみ、pool は除く) を保存

---

## Phase 13–16 実装上の注意 (将来作業の備忘)

### タイムラインビューポート
- 現状の `time → x%` 計算は `t / state.comp.duration * 100` で全箇所に直書き → 共通関数 `timeToPx(t)` / `pxToTime(x)` / `timeToPct(t)` に置換する。検索置換 1 度で済むよう、最初にラッパ関数を導入する。
- ズーム時はキーフレームのドラッグ可能領域 (`.lane-track`) も同じ `timeToPct` で再計算しないと位置がずれる。
- 波形の再描画は zoom/scroll 変更時にも必要 (ただし peaks 自体は同じ、サンプリング範囲だけ変わる)。

### 音声同期
- 現状 `<audio>` 要素は `loop=true` で勝手に回っている。`loop=false` に変えてコンポ側で巻戻しを管理する。
- スクラブ中の `audio.currentTime` 連続代入はブラウザによってはクリック/ノイズが乗るので、scrub-pause-resume パターンを採用する。

### ファイルプール
- 現状 `state.source` は `{kind: 'image'|'video'|'demo', media, image}` の単一値。Pool 化に伴い `state.source` は「アクティブ項目の派生」に格下げし、項目自体は `state.pool.items[]` に置く。
- WebGL テクスチャは `srcTex` 1 個だけ。ソース切替時は `texImage2D` で再アップロードする。
- 動画 item は `<video>` 要素を pool 内で保持し続けないとシーク追従できない。隠し DOM (`display:none`) に格納するか、`HTMLVideoElement` を Map で持つ。

### AE 互換キー
- `KeyboardEvent.code` ベースで判定し、IME 入力中は無効化する。
- `J/K/L` シャトルは「同じキー連打で速度段階」(2x→4x→...) を実装すると AE そっくりになる。
- レイヤー分割 (`Ctrl+Shift+D`) は内部的に「複製 → 元レイヤーの end をプレイヘッドに / コピー側の start をプレイヘッドに」で実装可能。キーフレームは両側に複製。

### プロジェクト保存
- 現行 `preset v4` は将来 v5 (label, source per layer 等) に拡張する想定。プロジェクトの `version` は preset の version とは独立に管理する (preset を埋め込む形なので二重バージョニングになる点に注意)。
- ファイル拡張子 `.vjproj` は MIME 紐付けがないため、ダウンロード時は `application/json` で出す。

---

## アーキテクチャ詳細

### レンダリングパイプライン
```
[ソース(image|video|demo)]
       │
       ▼ texImage2D(srcTex)
    [srcTex]
       │       ┌─── シーンA layers ───┐
       ├──────▶│ FBO ping ↔ pong       │──▶ outA
       │       └───────────────────────┘
       │       ┌─── シーンB layers ───┐
       └──────▶│ FBO ping ↔ pong       │──▶ outB
                                              │
                            ┌─── crossfade ───┤
                            ▼                 ▼
                         canvas ← [outA, outB, mix]
                            │
                            └──▶ prevFBO 保存 (trail/feedback 用)
```

### 状態モデル (新)
```js
state = {
  source: {...},                         // 素材
  bpm, beatStart, beatPhase,             // BPM
  audio: {
    level, gain,
    freq, freqWidth, freqThreshold, freqEdge,
    freqLevel, freqGate, triggerEnv
  },
  resScale,
  comp: { duration, timeMode, inPoint, outPoint, loop, snap },
  play: { playing, time, startWall },
  scenes: [
    { layers: [ {lid, effId, enabled, start, end, values, keyframes: {paramKey: [{t,v},...]}} ] },
    { layers: [...] }
  ],
  activeScene: 0,
  crossfader: 0,
  selectedLayer: null,                   // lid (currently editing)
  selectedKey: null,                     // {layer, paramKey, idx}
  midi: { access, learnTarget, bindings: [{id, type, channel, num, kind, lid, paramKey}] },
  graphOpen: {"lid:param": true},
  history: { past, future },
  panels: { leftW, rightW, bottomH },    // resize state
  rec: {...}
}
```

### キーフレーム評価
レンダ前に毎フレーム実行:
```
for each layer:
  if layer.enabled && layer.start <= state.play.time <= layer.end:
    for each paramKey in keyframes:
      layer.values[paramKey] = sample(keyframes[paramKey], state.play.time)
```
`sample()` は配列から現時刻の前後キーを二分探索し線形補間。

### FFT トリガー評価
`pollAudio()` 内で毎フレーム実行:
```
analyser.getByteFrequencyData(buf)
binHz = sampleRate / 2 / buf.length
freqLevel = average(buf bins around freq ± width/2) * gain
gate = freqLevel >= threshold
triggerEnv = edge(rise|fall|both) ? 1 : exponentialDecay(triggerEnv)
```
各レイヤーの `fftTrig` は `effectiveAmount()` で `triggerEnv` を amount に加算する。

### MIDI バインド
```
binding = {
  id,
  type: 'cc' | 'note',
  channel,
  num,
  kind: 'param' | 'enabled' | 'key',
  lid,
  paramKey
}
```
`param` は CC/Note velocity をパラメータ範囲へ線形マップ。`enabled` は Note でトグル、CC では 64 以上を ON として扱う。`key` は Note/CC 入力で `amount` キーフレームを現在時刻へ追加。

### 波形表示
音声ファイル読み込み時に `decodeAudioData()` で PCM を取得し、固定数のピーク配列へ縮約。ルーラー背景の canvas に composition 0 起点で描画する。音声ファイル自体はプリセットには保存しない。

### グラフエディタ
数値パラメータ行の `G` ボタンで graph mode を切替。キー点の x は時刻、y は `min..max` の正規化値。ドラッグ中は canvas 曲線と点を即時更新し、pointerup で履歴化する。

### UI 操作サーフェス
上部バーは既存のボタン/入力を呼び出す統合ショートカットとして扱う。`setupTopToolbar()` で既存 DOM や操作関数へ接続し、右クリックメニューは `contextTargetFromEvent()` で preview / timeline / layer / general を判定して表示項目を切り替える。

### Undo/Redo コマンド形式
```js
{ do: () => {...}, undo: () => {...}, label: '...' }
```
連続操作 (スライダ ドラッグ) は同種なら 200ms 以内のもの 1 コマンドに合体。

### MP4 出力
```js
const mimes = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm'
];
const supported = mimes.find(m => MediaRecorder.isTypeSupported(m));
```

---

## 効果カテゴリ (51)
| カテゴリ | 個数 | 効果 ID |
|---|---|---|
| Generate  | 1  | particles |
| Transform | 10 | zoom, pan, crop, rotate, mirror, tile, kaleido, split, pip, wrapscroll |
| Color     | 10 | hue, sat, contrast, bright, gamma, invert, mono, gradmap, poster, lut |
| Light     | 8  | glow, edgeglow, bloom, flare, leak, vignette, strobe, flash |
| Blur      | 4  | gblur, mblur, rblur, zblur |
| Distort   | 6  | wave, lensd, swirl, noisedisp, liquify, shake |
| Glitch    | 9  | rgbshift, chroma, glitch, slice, block, pixel, scan, grain, vhs |
| Time      | 3  | trail, feedback, audiobpm |

---

## ファイル
- `index.html` — 単一ファイル本体
- `README.md` — 使い方
- `claude.md` — 本ファイル (実装メモ + フェーズ進捗)

---

## 既知の制限 (継続)
- WebGL1 想定、blur/glow は単一パスでの近似。
- MP4 出力はブラウザ依存 (Chrome/Edge 130+ で `video/mp4`、それ以外 webm フォールバック)。
- 動画素材自身の音声は AudioContext に取り込まず、別途音声ファイル/マイクで Audio Reactive。
- FFT トリガーは指定帯域の平均レベルによる判定。キック抽出などは素材に応じて Hz / width / threshold / gain の調整が必要。
- Particles は 1 パスの手続き的シェーダ。density / glow / resolution が高いほど GPU 負荷が上がる。
- Web MIDI API はブラウザ/OS/権限に依存。
- 波形表示は読み込んだ音声ファイルのピーク解析のみ。動画素材内の音声波形は未対応。
- グラフエディタは数値パラメータのみ対応。色パラメータは通常のキー点編集。
- グラフエディタは線形補間のみ (ベジェ/Ease は将来拡張)。
