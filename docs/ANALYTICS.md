# ページ別アクセスとテストの除外

計測先は従来と同じ GA4 プロパティ（測定 ID `G-NMPQ2W5W56`）。Jekyll ビルド後に `scripts/inject-analytics.js` が本リポジトリ内の公開 HTML、ブログ一覧、公開記事へ共通の `assets/analytics.js` を挿入して計測する。別リポジトリで公開する作品はこの変更の対象外。

## GA4 で見る

1. 対象プロパティの「レポート」→「エンゲージメント」→「ページとスクリーン」を開く（レポート構成によっては「ライフサイクル」配下）。
2. 表のディメンションを「ページパスとスクリーンクラス」または「ページタイトルとスクリーンクラス」に切り替える。
3. `/blog/`、`/tools/`、`/games/` などで絞り込む。ブログは記事 URL ごとに集計される。

通常の集計への反映には 24〜48 時間程度かかることがある。リアルタイムでは先に確認できる。追加ページの計測は公開後からで、過去に収集していないページ別データを復元するものではない。既存データや GA4 側の設定・フィルタは変更・削除していない。

## 計測とプライバシー

- HTTPS の `xenoah.github.io` のみで Google タグを読み込む。localhost、127.0.0.1、プレビュー、file URL からは読み込まず通信しない。
- WebDriver／headless、明示的なテストフラグ、GA 無効化フラグ、`?analytics=off` で無効化する。手動で本番を検証するときは URL に `analytics=off` を付ける。ページ移動を伴う検査は下記の通信遮断も利用する。
- `noindex` ページ（記事エディター、リダイレクト、非公開扱いの教材など）と refresh リダイレクトは除外する。下書き・フォーム入力・本文を追加送信しない。
- Do Not Track と Global Privacy Control を尊重する。Google signals と広告のパーソナライズ信号を無効化する。
- 初期ページビューの URL と参照元からクエリとフラグメントを除去し、`/index.html` を `/` として集計する。ページタイトルと実際の公開パスを送り、note を canonical に持つ転載もこのサイトの記事パスに集計する。
- 初期ページビューは `gtag('config', ...)` の自動送信 1 回のみ。同じスクリプトを重ねて読み込んでも二重初期化しない。GA4 管理画面の拡張計測は変更していないため、そこで有効な履歴変更などのイベント設定は引き続き適用される。

## 開発・追加時

- Google タグや共通ローダーをソースへ直接埋め込まない。Jekyll ビルド後の `node scripts/inject-analytics.js _site` が公開ページへ 1 個だけ挿入する。再実行しても重複しない。新しいページや記事も自動で対象になる。
- `node scripts/check-site.js` と `npm --prefix blog test` で直接タグ・挿入処理・初期化条件を検査する。ビルド後は `node scripts/inject-analytics.js _site --check` で全ページの設置漏れ・二重設置・除外を確認する。CI は挿入・確認後の実際の成果物をブラウザ検査し、その同じ成果物を公開する。
- Playwright の spec は必ず `./fixtures.cjs` から `test` と `expect` を読み込む。自分で context を作る場合は `protectContext(context)` も呼ぶ。Google Analytics / Tag Manager / DoubleClick の通信は context 全体で遮断し、Service Worker も無効にする。
- 本番のサムネイル撮影は `analytics=off` と Chrome のホスト解決ブロックを併用する。スクリーンショットのために実際の GA4 イベントを送らない。
