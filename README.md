# Xenoahのホームページ

[公開サイト（GitHub Pages）](https://xenoah.github.io/) · [作品一覧](https://xenoah.github.io/projects.htm) · [GitHub](https://github.com/Xenoah/Xenoah.github.io)

Webツール、ゲーム、数学教材、3Dモデル、制作記録をまとめる個人サイト。静的HTMLとJekyllを使い、GitHub Actionsで検査してGitHub Pagesへ公開します。

## 変更・追加する前に

**人もLLMも [AGENTS.md](AGENTS.md) を最初に確認してください。**

- [サイト・作品の追加手順](docs/ADDING_PROJECTS.md)
- [ブログ記事の追加・編集](BLOGGING.md)
- 作品情報の正本：`data/projects.json`
- 一覧の再生成：`node scripts/build-projects.js`
- 整合性検査：`node scripts/check-site.js`（事前に `npm --prefix blog ci`）

一般ページは通常のURLで移動でき、スマホではメニューが折りたたまれます。作品一覧とリンクはJekyllで出力するため、JavaScriptを無効にしても参照できます。
