// GA4 is shared by public pages, but must never count local builds or browser tests.
(function () {
  "use strict";

  var measurementId = "G-NMPQ2W5W56";
  var location = window.location;
  var robots = document.querySelector('meta[name="robots"]');
  if (location.origin !== "https://xenoah.github.io" ||
      navigator.webdriver || /(?:HeadlessChrome|Playwright)/i.test(navigator.userAgent) ||
      window.__XENOAH_DISABLE_ANALYTICS__ || window["ga-disable-" + measurementId] ||
      new URLSearchParams(location.search).get("analytics") === "off" ||
      navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1" ||
      (robots && /\bnoindex\b/i.test(robots.content)) ||
      document.querySelector('meta[http-equiv="refresh" i]') ||
      window.__XENOAH_ANALYTICS_STARTED__) return;

  // Loading this file twice must not create a second config/page_view.
  window.__XENOAH_ANALYTICS_STARTED__ = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // Do not include search text, preview parameters, or fragments in page URLs.
  var pagePath = location.pathname.replace(/\/index\.html$/, "/");
  var referrer = "";
  try {
    var previous = new URL(document.referrer);
    if (/^https?:$/.test(previous.protocol)) referrer = previous.origin + previous.pathname;
  } catch (_) { /* Direct visits have no referrer. */ }
  window.gtag("js", new Date());
  // A single config call sends the initial page_view. Do not also send it manually.
  window.gtag("config", measurementId, {
    page_location: location.origin + pagePath,
    page_path: pagePath,
    page_title: document.title,
    page_referrer: referrer,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  document.head.appendChild(script);
})();
