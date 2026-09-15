# このリポジトリを変更するLLM・エージェントへ

作業開始時にこのファイルを読み、新しいサイト・ツール・ゲームを追加するときは、必ず [新規サイト追加手順](docs/ADDING_PROJECTS.md) も読むこと。記事の追加は [BLOGGING.md](BLOGGING.md) に従う。

## 変更の原則

- 公開先は **GitHub Pages**、リポジトリは `Xenoah/Xenoah.github.io`。既存のJekyll構成を維持する。
- 文字コードはUTF-8。一般ページには `viewport` を付け、スマホとキーボード操作に対応する。
- レトロな個人サイトの雰囲気、既存の作品・記事・下書き、公開済みURLを維持する。`frameset` / `frame` / `target="right"` を復活させない。
- 見た目は「古のホームページ」がユーザーの希望。白い本文、薄紫の左メニュー、黒い文字、青い下線リンク・訪問済みの紫を基本にする。共通フォントはMSゴシック（`"MS Gothic", "ＭＳ ゴシック", monospace`）を使い、`assets/site.css` の `--site-font` で管理する。トップ・作品一覧を大きなカードやボタンの並ぶランディングページへ戻さない。メニュー内では公開リンクの重複を避け、作品名と補助のGitHubリンクを読み分けられるようにする。
- 作業前に `git status` と差分を確認し、ユーザーの未コミット変更を消さない。コミットには対象の変更を明示して含める。
- 通常のページ移動で共有できるURLを使う。外部リンクはHTTPS、別タブにする場合は `rel="noopener"` と分かる表示を付ける。

## サイト追加時の必須ルール

1. **正本は `data/projects.json`**。タイトル、実際の機能説明、目的カテゴリ、公開URL `pagesUrl`、GitHub URL `sourceUrl` をここに登録する。
2. **GitHubとGitHub Pagesは別々に確認する**。Pagesをリポジトリ名から推測して掲載しない。公開されていない拡張機能・PCアプリなどは `pagesUrl: null` とし、`sourceOnlyReason` を書く。404の公開URLを掲載しない。
3. `updated` は確認できた実際の更新日だけを使う。既存作品の日付を新しく見せるために書き換えない。
4. `node scripts/build-projects.js` を実行する。生成された `_includes/*projects.html` / `_includes/site_menu.html` と、サイトマップ・サムネイルリストの生成ブロックを直接編集しない。
5. `changelog.htm` に変更内容を追記する。ローカルの新規公開ページにはSEOタグを付ける。ブログはJekyllの記事メタデータで管理する。
6. **検査が通るまで完了扱いにしない**。基本コマンドは次のとおり。

```sh
npm --prefix blog ci
node scripts/build-projects.js
node scripts/check-site.js
npm --prefix blog run check:articles
npm --prefix blog test
git diff --check
```

Windows PowerShellでは `npm` の代わりに `npm.cmd` を使用する。依存関係が既に揃っている場合、`npm ci` の再実行は不要。

追加・変更した外部URLは `node scripts/check-project-urls.js --id <作品ID>` で確認する。通信できない場合は確認済みと報告しない。画面・ナビゲーション・ブログの変更は、実際のJekyll出力に対するブラウザ検査も必要。手順は `docs/ADDING_PROJECTS.md` を参照。

## コミット・公開

- ユーザーはこの改修について、**改修単位でコミット＆プッシュする**よう指定している。検査済みの意味のある単位で実行し、最後にまとめて1回にしない。
- `git push origin main` 後に `publish-site.yml` の該当SHAの完了を確認する。ローカル検査成功、push成功、Pages公開成功を区別して報告する。
- 強制push、ユーザー変更の破棄、無関係なリポジトリへの変更は行わない。GitHub Actionsによる更新が先行した場合は差分を確認して通常の取り込みを行う。
- 利用するLLMによってはこのファイルを自動で読まないため、文章だけを保証にしない。`scripts/check-site.js` とGitHub Actionsの公開前検査を維持する。
