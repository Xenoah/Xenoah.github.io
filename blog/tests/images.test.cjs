const { test } = require("node:test");
const assert = require("node:assert/strict");
const { animatedPng, prepare } = require("../assets/editor-images.js");
test("image handling recognizes APNG and keeps unsupported formats unchanged", async () => {
  const png = new ArrayBuffer(20);
  new DataView(png).setUint32(12, 0x6163544c);
  assert.equal(animatedPng(png), true);
  assert.equal(animatedPng(new ArrayBuffer(4)), false);
  const gif = new File(["GIF89a"], "animated.gif", { type: "image/gif" });
  assert.equal((await prepare(gif)).file, gif);
});
