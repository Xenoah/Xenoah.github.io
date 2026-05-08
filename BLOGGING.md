# Blog operation

This site uses GitHub Pages and Jekyll for the blog.

## Write a post

Open `/blog/editor.html`, write the article in Markdown, then create one folder per article:

```text
blog/articles/YYYY-MM-DD-slug/
├─ index.md
└─ image.png
```

Put the whole folder under `blog/articles`. GitHub Pages will build `index.md` as a blog article.

The editor saves drafts in the browser automatically. Drafts are local only and are not published.

The old `_posts/YYYY-MM-DD-slug.md` style still works, but article folders are recommended for image-heavy posts.

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

## Public pages

- `/blog/` lists posts automatically.
- `/blog/feed.xml` provides RSS.
- Posts use `/blog/YYYY/MM/DD/slug/` URLs.

The old `index.html` frame page is intentionally unchanged.
