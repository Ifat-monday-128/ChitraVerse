import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

test("built homepage renders with its local hero asset", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /ChitraVerse/);
  assert.match(html, /Interstellar/);
  assert.match(html, /Movies &amp; Series/);
  await access(new URL("../dist/client/interstellar-hero.jpg", import.meta.url));
});
