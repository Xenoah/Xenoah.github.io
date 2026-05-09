# Blog operation

This site uses GitHub Pages and Jekyll for the blog.

## Write a post

Open `/blog/editor.html`, write the article body in HTML, then export one folder per article:

```text
blog/articles/YYYY-MM-DD-slug/
├─ index.html
└─ image.png
```

Use `画像込みZIPを書き出し` to download a ZIP that contains `index.html` and selected images. Extract the ZIP, then put the extracted folder under `blog/articles`. GitHub Pages will build `index.html` as a blog article.

The editor saves drafts in the browser automatically. Drafts are local only and are not published.

Article folders with `index.html` are the standard format for this blog.

## Editor Features

- Export an article folder ZIP containing `index.html` and images.
- Save directly to a local folder when the browser supports the File System Access API.
- Manage multiple images and insert HTML `<figure>` blocks.
- Set an image as the eyecatch / OGP image.
- Paste external HTML into the body without running scripts.
- Import an existing `index.html`.
- Preview the full article, including title, description, tags, eyecatch, and body.
- Check basic publishing requirements before export.
- Copy the public URL and folder tree.

## Folder Article

```text
blog/articles/2026-05-08-blog-start/index.html
```

Required front matter for folder articles:

```yaml
---
layout: post
blog_article: true
title: "Article title"
date: 2026-05-08
description: "Short SEO description."
permalink: /blog/2026/05/08/article-title/
tags:
  - tag
image: "/blog/articles/2026-05-08-article-title/image.png"
---
```

Write the body as HTML after the front matter:

```html
<h2>Section title</h2>
<p>Article text.</p>
```

`image` is optional, but recommended. It is used for the article eyecatch, blog card thumbnail, and SNS preview.

## Images

Put article images in the same article folder:

```text
blog/articles/2026-05-08-article-title/image.png
```

Reference them from HTML like this:

```html
<figure>
  <img loading="lazy" src="/blog/articles/2026-05-08-article-title/image.png" alt="Alt text">
  <figcaption>Alt text</figcaption>
</figure>
```

The editor can preview a local image, insert the HTML figure block, set it as the eyecatch, and download the image with a clean filename. After export, place the image file next to `index.html`. If you use the GitHub upload button, the selected image is uploaded to the same article folder.

## HTML Import

Paste HTML into the import panel in `/blog/editor.html`.

The editor keeps common article HTML:

- headings
- paragraphs and line breaks
- links and images
- unordered and ordered lists
- blockquotes
- code blocks
- tables
- figure captions

`script`, `style`, `noscript`, inline event attributes, and `javascript:` URLs are removed before preview/export.

## Public pages

- `/blog/` lists posts automatically.
- `/blog/feed.xml` provides RSS.
- Posts use `/blog/YYYY/MM/DD/slug/` URLs.

The old `index.html` frame page is intentionally unchanged.
