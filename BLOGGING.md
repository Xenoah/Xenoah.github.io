# Blog operation

This site uses GitHub Pages and Jekyll for the blog.

## Write a post

Open `/blog/editor.html`, write the article in Markdown, then export one folder per article:

```text
blog/articles/YYYY-MM-DD-slug/
├─ index.md
└─ image.png
```

Use `画像込みZIPを書き出し` to download a ZIP that contains `index.md` and selected images. Extract the ZIP, then put the extracted folder under `blog/articles`. GitHub Pages will build `index.md` as a blog article.

The editor saves drafts in the browser automatically. Drafts are local only and are not published.

The old `_posts/YYYY-MM-DD-slug.md` style still works, but article folders are recommended for image-heavy posts.

## Editor Features

- Export an article folder ZIP containing `index.md` and images.
- Save directly to a local folder when the browser supports the File System Access API.
- Manage multiple images and insert Markdown image tags.
- Set an image as the eyecatch / OGP image.
- Convert pasted HTML to Markdown without running scripts.
- Import an existing `index.md`.
- Preview the full article, including title, description, tags, eyecatch, and body.
- Check basic publishing requirements before export.
- Copy the public URL and folder tree.

## Folder Article

```text
blog/articles/2026-05-08-blog-start/index.md
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

`image` is optional, but recommended. It is used for the article eyecatch, blog card thumbnail, and SNS preview.

## Images

Put article images in the same article folder:

```text
blog/articles/2026-05-08-article-title/image.png
```

Reference them from Markdown like this:

```md
![Alt text](/blog/articles/2026-05-08-article-title/image.png)
```

The editor can preview a local image, insert the Markdown image tag, set it as the eyecatch, and download the image with a clean filename. After export, place the image file next to `index.md`. If you use the GitHub upload button, the selected image is uploaded to the same article folder.

## HTML Conversion

Paste HTML into the converter panel in `/blog/editor.html`.

The converter supports common article HTML:

- headings
- paragraphs and line breaks
- links and images
- unordered and ordered lists
- blockquotes
- code blocks
- tables
- figure captions

After conversion, use the article preview to check visual layout before exporting.

## Public pages

- `/blog/` lists posts automatically.
- `/blog/feed.xml` provides RSS.
- Posts use `/blog/YYYY/MM/DD/slug/` URLs.

The old `index.html` frame page is intentionally unchanged.
