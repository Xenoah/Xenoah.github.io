# 新規サイト・作品の追加

最初にルートの [AGENTS.md](../AGENTS.md) を読む。メニューだけにリンクを追加すると、一覧・検索・サイトマップに反映されない。以下の順で作業する。

## 1. 実物を確認

- GitHubで公開リポジトリ、README、使用方法を確認する。
- GitHub Pagesの実際のURLを開き、作品が表示されることを確認する。`/dist/` などの公開パスは作品によって異なる。
- 公開URLが404、未公開、ブラウザで動かないアプリの場合は、公開サイトボタンを作らずGitHubへの案内にする。
- タイトル・説明は確認できた機能を記載する。AIやLLMが推測した対応形式・プライバシー特性などを付け足さない。

## 2. 一覧データを登録

`data/projects.json` の配列に次の形式で追加する。以下は形式説明用の例で、リンクは実在確認した値に置き換える。

```json
{
  "id": "example-tool",
  "title": "作品名",
  "description": "何をするための作品かを説明する。",
  "category": "tools",
  "pagesUrl": "https://xenoah.github.io/example-tool/",
  "sourceUrl": "https://github.com/Xenoah/example-tool",
  "updated": "2026-09-15",
  "thumbnailSlug": "example-tool"
}
```

| 項目 | ルール |
| --- | --- |
| `id` | 重複しない英小文字・数字・ハイフン |
| `title` / `description` | 実際の名称と機能。日英併記は一覧では必須ではない |
| `category` | `music`, `images`, `tools`, `games`, `learn`, `data`, `models`, `software`, `community` |
| `pagesUrl` | 確認した正規の公開URL。未公開なら `null` |
| `sourceUrl` | GitHubのリポジトリ、またはこのリポジトリ内の該当ディレクトリ |
| `sourceOnlyReason` | `pagesUrl: null` のとき必須。例：`Windows用アプリ` |
| `pendingPagesUrl` | 未公開URLを記録したい場合だけ使う。画面・サイトマップには出さない |
| `updated` | 確認した実際の更新日。確認できない場合は省略する |
| `featured` | おすすめに掲載する場合だけ `true`。トップが長くなりすぎない件数に保つ |
| `thumbnailSlug` | 任意。英小文字・数字・ハイフン。未生成の画像はHTMLやXMLに出力されない |

このリポジトリ内の作品は、公開URLとコードのディレクトリが対応するようにする。例：`/tools/svg-converter/svg-converter.htm` と `https://github.com/Xenoah/Xenoah.github.io/tree/main/tools/svg-converter`。

## 3. ページと案内を更新

1. ローカルの新規HTMLを作る場合、UTF-8、`lang="ja"`、`viewport`、タイトル、説明、canonical、robots、OG/Twitter情報を記載する。`scripts/update_seo_metadata.js` のページ定義に登録すれば、`node scripts/update_seo_metadata.js <ファイル>` で適用できる。
2. 一般の案内ページは既存の `projects.htm` を参考に、Jekyllのfront matterと共通ナビゲーションを使う。全画面のゲーム・ツールは独立UIを維持してよい。
3. `node scripts/build-projects.js` を実行する。メニュー、検索対象、おすすめ、新着、HTML/XMLサイトマップ、撮影リストを更新する。
4. `changelog.htm` に追加・修正内容を記録する。新規の案内ページを増やす場合はXMLサイトマップの固定ページ部分にも登録する。
5. 画像を追加しない場合、架空の画像パスをHTMLに書かない。サムネイルは公開後の撮影処理で生成できる。

旧コマンド `node scripts/sync_sitemap_from_menu.js` は同じ生成処理を呼び出す互換コマンド。正本はメニューHTMLではなくJSONである。

## 4. 検査する

```sh
node scripts/check-project-urls.js --id example-tool
node scripts/build-projects.js --check
node scripts/check-site.js
npm --prefix blog run check:articles
npm --prefix blog test
git diff --check
```

`--check` は読み取り専用で、生成忘れを終了コード1で通知する。検査を無効化して通したり、公開対象外のレポートを検査に混ぜたりしない。

画面を変更した場合は、本物のJekyll出力を `_site` にビルドしてから `npm --prefix blog run test:browser` を実行する。CIではJekyllビルド、Chromium / Firefox / WebKit / モバイルの検査、公開をこの順番で実行する。テスト用の記事は公開前に除去する。Ruby/Jekyllがない環境では、ソース検査後にpushし、CIのビルドとブラウザ検査を確認する。Jekyll未処理のソースを配信しただけで表示確認済みとしない。

外部リンクは通信状態で一時的に失敗するため、毎回の公開ではローカル整合性を検査し、外部到達性は追加時・変更時と週次の専用ワークフローで確認する。

## 5. 小分けにコミット・公開

検査した変更だけを明示的にstageし、意味のある改修単位でcommit / pushする。該当SHAの `publish-site.yml` が成功したことと、公開ページの実際の内容を確認する。失敗した場合は原因を修正して再検査する。

LLMが `AGENTS.md` を自動読込しない環境では、作業依頼に「このリポジトリのAGENTS.mdとdocs/ADDING_PROJECTS.mdを読んでから作業」と明記する。自動検査は文章の読み忘れとは独立して、生成忘れや不整合を公開前に検出する。
