# ブログ運用

記事の編集・公開手順は [エディターの使い方](blog/EDITOR.md) を参照してください。

記事の正本は `blog/articles/YYYY-MM-DD-slug/index.html` です。先頭に記事情報、続けて本文HTMLを書きます。GitHub PagesのJekyllが `_layouts/post.html` を適用します。生成済みの記事HTMLを別途管理する必要はありません。

`_includes/blog_articles.html` が共通の記事一覧を作り、一覧ページ・RSS・サイトマップ・エディター用JSONに使います。新しい記事をpushすると、ビルド時に各一覧へ反映されます。

旧 `render_static_blog_article.js` / `render_static_blog_index.js` は廃止しました。

- 記事一覧: `/blog/`
- エディター: `/blog/editor.html`
- RSS: `/blog/feed.xml`
- 記事の公開URL: `/blog/YYYY/MM/DD/slug/`
- サイトマップ: `/sitemap.xml`

テストは `cd blog` → `npm ci` → `npm test` で実行できます。
