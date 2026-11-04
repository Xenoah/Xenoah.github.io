# 検索・共有メタデータの保守

- 固定HTMLのtitle、description、canonicalは `scripts/update_seo_metadata.js` の定義と一致させる。固有の内容を説明し、キーワードを羅列しない。ホームの共有画像もここで管理する。
- ブログは `_layouts/blog.html` と `_layouts/post.html` が正本。canonical、og:url、mainEntityOfPageを一致させる。note原本の転載はnoteのcanonicalを維持し、ローカルURLをXMLサイトマップへ重複掲載しない。Pages先行記事は自身のURLを使う。
- AI助手を人間や架空の組織として構造化しない。AI執筆の本文表示・meta authorは維持するが、Person authorは出力しない。
- サイトマップの日付は実際の本文更新に基づく。ビルド時刻で全件を更新しない。記事は明示更新日または公開日を使い、一覧の不確かな更新日は省略する。
- 画像には分かる範囲で実寸と適切なaltを指定し、既存の軽量カバー処理を維持する。共有画像のために巨大な新規アセットを追加しない。
- `node scripts/check-site.js`、記事検査・単体テストに加え、Jekyll出力で `blog/tests/browser/seo.spec.cjs` を含む全ブラウザテストを実行する。editorのnoindexと既存URLを維持する。
- Search Console、検索順位、インデックス登録はこのコード変更で保証できない。新サービスや所有権確認は別途承認を得る。

## 一次資料

- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/appearance/snippet
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/appearance/structured-data/article
