const { test, expect } = require("./fixtures.cjs");

const siteUrl = "https://xenoah.github.io";

async function readMetadata(page, request, url) {
  const response = await request.get(url);
  expect(response.ok(), `${url} must be readable`).toBeTruthy();
  return page.evaluate((html) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const content = (selector) => document.querySelector(selector)?.getAttribute("content");
    const flatten = (value) => Array.isArray(value)
      ? value.flatMap(flatten)
      : value && typeof value === "object"
        ? [value, ...flatten(value["@graph"] || [])]
        : [];
    return {
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((link) => link.getAttribute("href")),
      ogUrl: content('meta[property="og:url"]'),
      ogImage: content('meta[property="og:image"]'),
      twitterImage: content('meta[name="twitter:image"]'),
      author: content('meta[name="author"]'),
      robots: content('meta[name="robots"]'),
      schemas: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .flatMap((script) => flatten(JSON.parse(script.textContent))),
    };
  }, await response.text());
}

function hasType(schema, type) {
  return [].concat(schema["@type"] || []).includes(type);
}

test("homepage exposes its website identity and usable social preview images", async ({ page, request }) => {
  const metadata = await readMetadata(page, request, "/");
  const website = metadata.schemas.find((schema) => hasType(schema, "WebSite"));
  expect(website).toBeTruthy();
  expect(website.url).toBe(`${siteUrl}/`);
  expect(website.name).toContain("Xenoah");
  expect(metadata.ogImage).toMatch(/^https:\/\/xenoah\.github\.io\/.+/);
  expect(metadata.twitterImage).toBe(metadata.ogImage);
  const imagePath = new URL(metadata.ogImage).pathname;
  const image = await request.get(imagePath);
  expect(image.ok()).toBeTruthy();
  expect(image.headers()["content-type"]).toMatch(/^image\//);
});

test("core pages have exactly one self canonical and matching Open Graph URL", async ({ page, request }) => {
  for (const path of ["/", "/projects.htm", "/portfolio.htm", "/links.htm", "/environment.htm", "/changelog.htm", "/dashboard.htm", "/blog/"]) {
    const metadata = await readMetadata(page, request, path);
    expect(metadata.canonicals, path).toEqual([`${siteUrl}${path}`]);
    expect(metadata.ogUrl, path).toBe(metadata.canonicals[0]);
  }
});

test("article metadata and sitemap honor original canonicals and AI attribution", async ({ page, request }) => {
  const catalogResponse = await request.get("/blog/articles.json");
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  expect(catalog.length).toBeGreaterThan(0);
  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.ok()).toBeTruthy();
  const sitemapUrls = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    if (document.querySelector("parsererror")) throw new Error("Sitemap XML is invalid");
    return [...document.getElementsByTagNameNS("http://www.sitemaps.org/schemas/sitemap/0.9", "loc")]
      .map((element) => element.textContent.trim());
  }, await sitemapResponse.text());
  expect(new Set(sitemapUrls).size).toBe(sitemapUrls.length);

  for (const article of catalog) {
    const metadata = await readMetadata(page, request, article.url);
    expect(metadata.canonicals, article.url).toHaveLength(1);
    const canonical = metadata.canonicals[0];
    expect(canonical, article.url).toMatch(/^https:\/\//);
    expect(metadata.ogUrl, article.url).toBe(canonical);
    const posting = metadata.schemas.find((schema) => hasType(schema, "BlogPosting"));
    expect(posting, article.url).toBeTruthy();
    const mainEntityUrl = typeof posting.mainEntityOfPage === "string"
      ? posting.mainEntityOfPage
      : posting.mainEntityOfPage?.["@id"] || posting.mainEntityOfPage?.url;
    expect(mainEntityUrl, article.url).toBe(canonical);
    expect(metadata.author, article.url).toBe(article.author);
    if (article.author === "AI助手") {
      for (const author of [].concat(posting.author || [])) {
        expect(hasType(author, "Person"), `${article.url}: AI must not be represented as a person`).toBe(false);
      }
    }
    const localUrl = new URL(article.url, siteUrl).href;
    const indexable = !/\bnoindex\b/i.test(metadata.robots || "");
    expect(sitemapUrls.includes(localUrl), article.url).toBe(canonical === localUrl && indexable);
  }
});

test("the article editor remains excluded from indexing and the sitemap", async ({ page, request }) => {
  const metadata = await readMetadata(page, request, "/blog/editor.html");
  expect(metadata.robots).toMatch(/\bnoindex\b/i);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain(`${siteUrl}/blog/editor.html`);
});
