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

## 毎日の AI 助手日記: Pages を先に、note を後に

2026-11-03 の本人指示から、新しい日記は **GitHub Pages 公開確認 → 指定 Windows 担当による note 公開** の順です。PC が未接続でも、日次取得・執筆・private 原稿検証・公開用 export と、このリポジトリへの通常 push/Pages CI は既存のクラウド側の権限で進めます。note と Windows SQLite の取り込みは別の状態で保留します。新しい資格情報や追加の課金、note の別環境公開は導入しません。

公開するのは private collector の正規 `prepare` と編集レビューを通った **助手の独立原稿と自作カバーだけ**。private リポジトリ、元投稿データ、`source.json`、artifact、SQLite、checks、日次台帳を公開リポジトリにコピーしてはいけません。公開用 export は Git 管理外の一時ディレクトリの `bundle.json` と cover 1点だけです。export 時に返る bundle SHA256 を受け取り、次を実行します。

```sh
python scripts/import-diary.py --root . import --bundle <公開用export> --bundle-sha256 <exportが返したSHA256>
python scripts/import-diary.py validate
```

- 対象は2026-11-03以降の新規初稿です。公開 URL は `/blog/YYYY/MM/DD/diary/`、正本は `blog/articles/YYYY-MM-DD-diary/`。既存の note ID 型 URL・手書き記事は維持します。
- `blog/pages-first.json` は日付、独立原稿 digest、公開 URL、記事HTML hash、本人出典URL、画像容量、確認後のnote URLだけを記録します。private run ID・SHA・本文原文は含めません。原稿 digest はprivate検査結果と結ぶ識別子で、公開 importer 単独で検査の真正性を暗号学的に証明するものではありません。bundle SHA は転送の同一性を検査するもので、レビューの代用ではありません。
- 公開前に差分・記事・カバー・出典をレビューし、生成記事とmanifestを通常commit/non-force pushします。該当SHAのPublish site成功、公開manifest、本文・カバー・全出典を照合してからprivate collectorの別Pages receiptへ記録します。noteのpublication.jsonや日次published記録で代用しません。Pages失敗・不明ならnoteを先に公開しません。
- 同日・同digestの再importは同一結果だけを許可します。違う本文・digestの上書き、重複日付、無管理の記事への衝突は停止します。改訂は自動で初稿importに流さず、対象・URL・内容が承認された改訂手順を使います。
- Pages上ではnote未公開をそのまま表示し、noteの架空URLや公開済み表示を付けません。後日のnote公開は指定Windowsの既存claim/mark-published/record-publicationを維持します。実公開と照合後、次で **同じPages URLのnoteリンクだけ** を追加します。本文やcanonicalは変更しません。

```sh
python scripts/import-diary.py --root . link-note --date YYYY-MM-DD --note-url <確認したnoteURL> --article-digest <同じdigest> --publication-verified
python scripts/import-diary.py validate
```

リンク追加も通常push後のCI・実ページを確認します。noteの記録やリンク追加が失敗してもnoteを再公開しません。Pages成功・note保留・SQLite保留は別々に報告します。取得artifact期限後はSQLiteを自動再取得しません。正規prepare済みの独立原稿による後日のnote公開はcollectorの現行検証を通し、期限や出典ガードを変更しません。

画像は自作カバー1点をメタデータなしWebP、長辺1280px以内、最大256KBへ変換します。原寸画像・exportを公開先に残さず、同一原稿の再importで画像を増やしません。Xは本人URLの標準埋め込みだけで、元投稿本文・第三者本文・画像は保存しません。

**接続条件:** 当日のnoteがなくてもPages-first記事は公開できます。既存note由来の記事の巻き戻り・削除済み記事の復活を防ぐため、従来の記事の公開note照合はビルド時に引き続き必要です。これはPC接続不要ですが、noteサービスの通信障害・形式変更時はPages配信全体が停止し、直前の公開サイトを保持します。PC未接続とnoteサービス障害を混同しません。

## 既存 note 記事の併載・照合

従来のnote由来記事について、note `xenoah_memo` の公開済み・無料の記事だけを `scripts/sync-note.py` で同期します。自己紹介も含め、全ページを最後まで確認します。既存の手書き記事、下書き、レトロなレイアウトは変更しません。

- 従来のnote由来記事の正本は note の現在の公開本文です。Pages-first記事は対象外で、本文をnoteから上書き・削除しません。記事 ID に固定した URL を使い、同じ記事の改訂は同じ blog URL に反映します。既存公開 manifest の形式と ID / URL を検証し、初回の blog 公開日を固定します。note への出典リンクと canonical、AI 助手執筆の表示を付けます。
- 従来記事の手動照合では、既存の GitHub 認証でこのリポジトリの **Publish site**（`publish-site.yml`、branch `main`、入力なし）を実行します。既存日記の公開担当の後処理です。note 公開と blog 配信は原子的な同時処理ではなく、取得・検査・Pages 配信の時間差があります。
- 漏れの補完として毎日 **21:15、23:15、翌01:15 JST** にも同じ公開処理を実行します。GitHub の予約実行には遅延があります。予約外での記事は次回チェックか手動実行で反映します。
- `blog/note-mirror.json` は公開記事 ID、元 URL、blog URL、変換後記事 SHA256、画像容量、埋め込み数だけの照合表です。従来記事のnote改訂内容も再取得して確認します。Pages-first記事は日付・タイトルまたは確認済みnote URLで重複転載を抑止し、内容を上書きしません。非公開化・削除で完全な公開一覧から消えた同期記事は次回の成功したビルドから外します。Git 履歴は自動削除しません。通信失敗時は公開処理全体を止め、直前の公開サイトを残します。失敗中は削除反映も遅れるため、その場合は別途確認が必要です。
- 初回の10記事はリポジトリにも保存しています。その後は毎回のビルド作業ツリーで最新記事を生成し、検査済みの同じ成果物を公開します。毎日の重複 commit や画像の Git 履歴肥大化を避けます。最新公開版の照合表はサイト側で確認してください。
- X API は呼びません。X 埋め込み内の原文・画像は保存せず、本人投稿の URL だけから標準ウィジェットを表示します。第三者の引用先内容を取り込みません。ウィジェットが表示できない場合も出典リンクが残ります。ウィジェットは閲覧者のブラウザから X に通信します。
- note 公開記事本文と画像以外は公開物に含めません。この旧記事同期処理はprivate collector、資格情報、元投稿 JSON、SQLite、非公開原稿を参照しません。Pages-firstの公開用exportだけは上記の狭い許可に従います。note の公開取得形式は変更される可能性があり、不明な埋め込み形式や非無料・制限付き記事は自動転載を止めて確認します。
- 画像は記事のカバーと本文内の note 配信画像に限定し、長辺1280px以内、WebP 品質80（必要時70/60/50）へ変換します。小さい原画像を再圧縮して悪化させる場合はメタデータ除去済み PNG/JPEG を使用できます。画像1枚256KB、記事8枚・取得24MBを上限とし、超えたら公開前に止めます。画像の縦横サイズ、本文画像の遅延読み込みを付け、公開先へ原寸画像を重複保存しません。

ローカルの確認:

```sh
python -m pip install -r scripts/note-sync-requirements.txt
python -m unittest discover -s scripts/tests -p test_note_sync.py
python scripts/sync-note.py
npm --prefix blog run check:articles
```

同期コマンドのログは件数と容量のみです。API 応答や埋め込み原文をファイル・公開ログへ保存しません。公開後は該当 SHA の Publish site 成功、`/blog/note-mirror.json` の記事 ID / 元 URL、実記事の本文・カバー・全出典リンクを照合してください。同期失敗を note の再公開で解消しません。
