#!/usr/bin/env bash
# サイトマップ用サムネイルを本番サイトのスクリーンショットから更新する。
# GitHub Actions (ubuntu-latest) での実行を想定。ローカルでは CHROME_BIN を指定して実行可。
#   BASE_URL        撮影対象サイト (既定: https://xenoah.github.io/)
#   OUT_DIR         出力先フォルダ (既定: images_sitemap)
#   RMSE_THRESHOLD  既存画像との正規化RMSE差がこの値未満なら更新しない (既定: 0.02)
set -u

BASE_URL="${BASE_URL:-https://xenoah.github.io/}"
OUT_DIR="${OUT_DIR:-images_sitemap}"
RMSE_THRESHOLD="${RMSE_THRESHOLD:-0.02}"
LIST_FILE="$(dirname "$0")/sitemap_thumbs_pages.txt"
WIDTH=480
CAPTURE_SIZE="960,600"

if [ -n "${CHROME_BIN:-}" ]; then
    chrome="$CHROME_BIN"
else
    chrome="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium-browser || command -v chromium)"
fi
if [ -z "$chrome" ]; then
    echo "ERROR: Chrome/Chromium not found" >&2
    exit 1
fi

mkdir -p "$OUT_DIR"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

updated=0
skipped=0
failed=0

while IFS=' ' read -r slug path; do
    case "$slug" in ''|'#'*) continue ;; esac
    [ "$path" = "/" ] && path=""
    url="${BASE_URL}${path}"
    raw="$tmp/$slug.png"
    jpg="$tmp/$slug.jpg"
    dst="$OUT_DIR/$slug.jpg"

    "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
        --window-size="$CAPTURE_SIZE" --virtual-time-budget=9000 --timeout=25000 \
        --user-data-dir="$tmp/profile" --screenshot="$raw" "$url" >/dev/null 2>&1
    if [ ! -s "$raw" ]; then
        echo "FAIL    $slug ($url)"
        failed=$((failed + 1))
        continue
    fi

    convert "$raw" -resize "${WIDTH}x" -quality 85 "$jpg"

    if [ -f "$dst" ]; then
        # 正規化RMSE: "1234.5 (0.0188)" の括弧内を取り出す
        rmse="$(compare -metric RMSE "$dst" "$jpg" null: 2>&1 | sed -n 's/.*(\([0-9.]*\)).*/\1/p')"
        if [ -n "$rmse" ] && awk -v r="$rmse" -v t="$RMSE_THRESHOLD" 'BEGIN { exit !(r < t) }'; then
            echo "SKIP    $slug (rmse=$rmse)"
            skipped=$((skipped + 1))
            continue
        fi
    fi

    cp "$jpg" "$dst"
    echo "UPDATE  $slug"
    updated=$((updated + 1))
done < <(tr -d '\r' < "$LIST_FILE")

echo "----"
echo "updated=$updated skipped=$skipped failed=$failed"
# 撮影失敗があってもワークフロー自体は続行させる(サイト側の一時的な不調で全体を止めない)
exit 0
