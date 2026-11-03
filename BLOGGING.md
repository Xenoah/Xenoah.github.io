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

## note の AI 助手日記を併載する

note `xenoah_memo` の公開済み・無料の記事だけを `scripts/sync-note.py` で同期します。自己紹介も含め、全ページを最後まで確認します。既存の手書き記事、下書き、レトロなレイアウトは変更しません。

- 正本は note の現在の公開本文です。記事 ID に固定した URL を使い、同じ記事の改訂は同じ blog URL に反映します。既存公開 manifest の形式と ID / URL を検証し、初回の blog 公開日を固定します。note への出典リンクと canonical、AI 助手執筆の表示を付けます。
- note 公開確認後、既存の GitHub 認証でこのリポジトリの **Publish site**（`publish-site.yml`、branch `main`、入力なし）を実行します。既存日記の公開担当の後処理です。note 公開と blog 配信は原子的な同時処理ではなく、取得・検査・Pages 配信の時間差があります。
- 漏れの補完として毎日 **21:15、23:15、翌01:15 JST** にも同じ公開処理を実行します。GitHub の予約実行には遅延があります。予約外での記事は次回チェックか手動実行で反映します。
- `blog/note-mirror.json` は公開記事 ID、元 URL、blog URL、変換後記事 SHA256、画像容量、埋め込み数だけの照合表です。note の改訂内容も再取得して確認します。非公開化・削除で完全な公開一覧から消えた同期記事は次回の成功したビルドから外します。Git 履歴は自動削除しません。通信失敗時は公開処理全体を止め、直前の公開サイトを残します。失敗中は削除反映も遅れるため、その場合は別途確認が必要です。
- 初回の10記事はリポジトリにも保存しています。その後は毎回のビルド作業ツリーで最新記事を生成し、検査済みの同じ成果物を公開します。毎日の重複 commit や画像の Git 履歴肥大化を避けます。最新公開版の照合表はサイト側で確認してください。
- X API は呼びません。X 埋め込み内の原文・画像は保存せず、本人投稿の URL だけから標準ウィジェットを表示します。第三者の引用先内容を取り込みません。ウィジェットが表示できない場合も出典リンクが残ります。ウィジェットは閲覧者のブラウザから X に通信します。
- note 公開記事本文と画像以外は公開物に含めません。private collector、資格情報、元投稿 JSON、SQLite、非公開原稿を参照しません。note の公開取得形式は変更される可能性があり、不明な埋め込み形式や非無料・制限付き記事は自動転載を止めて確認します。
- 画像は記事のカバーと本文内の note 配信画像に限定し、長辺1280px以内、WebP 品質80（必要時70/60/50）へ変換します。小さい原画像を再圧縮して悪化させる場合はメタデータ除去済み PNG/JPEG を使用できます。画像1枚256KB、記事8枚・取得24MBを上限とし、超えたら公開前に止めます。画像の縦横サイズ、本文画像の遅延読み込みを付け、公開先へ原寸画像を重複保存しません。

ローカルの確認:

```sh
python -m pip install -r scripts/note-sync-requirements.txt
python -m unittest discover -s scripts/tests -p test_note_sync.py
python scripts/sync-note.py
npm --prefix blog run check:articles
```

同期コマンドのログは件数と容量のみです。API 応答や埋め込み原文をファイル・公開ログへ保存しません。公開後は該当 SHA の Publish site 成功、`/blog/note-mirror.json` の記事 ID / 元 URL、実記事の本文・カバー・全出典リンクを照合してください。同期失敗を note の再公開で解消しません。
