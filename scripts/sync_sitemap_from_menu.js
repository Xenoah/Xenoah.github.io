#!/usr/bin/env node
// menu.htm のサイト内リンクを正として、sitemap.htm / sitemap.xml /
// scripts/sitemap_thumbs_pages.txt に載っていないページを自動追記する。
// GitHub Actions (update-sitemap-thumbnails.yml) から実行されるほか、
// ローカルでも `node scripts/sync_sitemap_from_menu.js` で実行できる。
// `--check` を付けると書き込まずに追加予定の項目だけを表示する。
//
// 仕様:
//  - 追加のみ行う。メニューから消えたリンクをサイトマップから削除はしない
//    (ブログ記事や intmath レッスンなどメニューに無いページが多数あるため)。
//  - 対象は xenoah.github.io 配下のリンクのみ。外部サイトへのリンクは無視。
//  - sitemap.htm の追記先セクションは menu.htm の <b>見出し</b> から対応表で決める。
//  - 新規ページの説明文は仮テキストになるので、後から手で直すこと。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_ORIGIN = "https://xenoah.github.io/";
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST

const MENU_FILE = path.join(ROOT, "menu.htm");
const SITEMAP_HTM = path.join(ROOT, "sitemap.htm");
const SITEMAP_XML = path.join(ROOT, "sitemap.xml");
const THUMBS_LIST = path.join(ROOT, "scripts", "sitemap_thumbs_pages.txt");

// menu.htm の <b>見出し</b> → sitemap.htm の <h2> 見出し(部分一致)
const SECTION_MAP = [
    { menu: "便利ツール", h2: "便利ツール" },
    { menu: "ミニゲーム", h2: "ミニゲーム" },
    { menu: "すたでぃー", h2: "すたでぃー" },
    { menu: "データーベース", h2: "データベース" },
    { menu: "メニュー", h2: "メイン" } // 先頭ブロック(xenoah.github.ioメニュー)
];
const FALLBACK_H2 = "便利ツール";

const checkOnly = process.argv.includes("--check");

function readUtf8(file) {
    return fs.readFileSync(file, "utf8");
}

// menu.htm からセクション付きでサイト内リンクを抜き出す
function parseMenuLinks(menuHtml) {
    const links = [];
    let section = "";
    const tagRe = /<b>([^<]*)<\/b>|<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = tagRe.exec(menuHtml)) !== null) {
        if (m[1] !== undefined) {
            if (m[1].trim()) section = m[1].trim();
            continue;
        }
        const href = m[2].trim();
        const text = m[3].replace(/<[^>]*>/g, "").trim();
        if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
        if (/^https?:\/\//i.test(href) && !href.startsWith(SITE_ORIGIN)) continue; // 外部サイト
        // 正規化: サイトルートからの相対パスに揃える
        let rel = href.startsWith(SITE_ORIGIN) ? href.slice(SITE_ORIGIN.length) : href.replace(/^\//, "");
        if (rel === "menu.htm" || rel === "") continue;
        links.push({ rel, href, text, section });
    }
    return links;
}

// 表示タイトル: 先頭の絵文字・記号を落とす
function displayTitle(text) {
    const stripped = text.replace(/^[^0-9A-Za-z぀-ヿ一-鿿]+/u, "").trim();
    return stripped || text;
}

// パスからサムネイル用スラッグを作る (tools/foo/foo.htm → foo, bar/ → bar)
function makeSlug(rel, taken) {
    const segments = rel.replace(/\/+$/, "").split("/");
    let base = segments[segments.length - 1].replace(/\.[a-z0-9]+$/i, "");
    if (segments.length >= 2 && /\.[a-z0-9]+$/i.test(segments[segments.length - 1])) {
        base = segments[segments.length - 2]; // ファイル名よりフォルダ名を優先
    }
    let slug = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    let candidate = slug;
    let n = 2;
    while (taken.has(candidate)) candidate = slug + "-" + n++;
    return candidate;
}

function sectionH2For(menuSection) {
    for (const entry of SECTION_MAP) {
        if (menuSection.includes(entry.menu)) return entry.h2;
    }
    return FALLBACK_H2;
}

function main() {
    const menuLinks = parseMenuLinks(readUtf8(MENU_FILE));
    let htm = readUtf8(SITEMAP_HTM);
    let xml = readUtf8(SITEMAP_XML);
    let list = readUtf8(THUMBS_LIST);

    const takenSlugs = new Set();
    for (const line of list.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length === 2 && !line.startsWith("#")) takenSlugs.add(cols[0]);
    }

    const added = [];
    for (const link of menuLinks) {
        const loc = SITE_ORIGIN + link.rel;
        if (xml.includes("<loc>" + loc + "</loc>")) continue; // 掲載済み

        const slug = makeSlug(link.rel, takenSlugs);
        takenSlugs.add(slug);
        const title = displayTitle(link.text);
        const h2 = sectionH2For(link.section);
        added.push({ loc, slug, title, h2 });
        if (checkOnly) continue;

        // sitemap.xml: </urlset> の直前に追記
        const urlBlock =
            "  <url>\n" +
            "    <loc>" + loc + "</loc>\n" +
            "    <lastmod>" + TODAY + "</lastmod>\n" +
            "    <changefreq>monthly</changefreq>\n" +
            "    <priority>0.6</priority>\n" +
            "    <image:image>\n" +
            "      <image:loc>" + SITE_ORIGIN + "images_sitemap/" + slug + ".jpg</image:loc>\n" +
            "    </image:image>\n" +
            "  </url>\n";
        xml = xml.replace(/<\/urlset>/, urlBlock + "</urlset>");

        // sitemap.htm: 対応セクションの </ul> の直前に追記
        const li =
            '        <li class="has-thumb"><img class="thumb" src="images_sitemap/' + slug +
            '.jpg" alt="" loading="lazy"><div><a href="' + loc +
            '" target="_blank" class="ext">' + title +
            '</a><span class="desc">' + link.text + "（メニューから自動追加）</span></div></li>\n";
        const h2Index = htm.search(new RegExp("<h2>[^<]*" + h2));
        if (h2Index === -1) {
            console.warn("WARN: sitemap.htm にセクションが見つからないため追記をスキップ: " + h2 + " (" + loc + ")");
        } else {
            const ulEnd = htm.indexOf("</ul>", h2Index);
            htm = htm.slice(0, ulEnd) + li + "    " + htm.slice(ulEnd);
        }

        // 撮影リスト: 末尾に追記
        if (!list.endsWith("\n")) list += "\n";
        list += slug + " " + link.rel + "\n";
    }

    if (added.length === 0) {
        console.log("sitemap sync: 追加すべきリンクはありません");
        return;
    }
    for (const item of added) {
        console.log((checkOnly ? "WOULD ADD: " : "ADDED: ") + item.loc + " (slug=" + item.slug + ", section=" + item.h2 + ")");
    }
    if (checkOnly) return;

    // 最終更新日も更新しておく
    htm = htm.replace(/最終更新: \d{4}-\d{2}-\d{2}/, "最終更新: " + TODAY);

    fs.writeFileSync(SITEMAP_HTM, htm);
    fs.writeFileSync(SITEMAP_XML, xml);
    fs.writeFileSync(THUMBS_LIST, list);
    console.log("sitemap sync: " + added.length + "件追加しました");
}

main();
