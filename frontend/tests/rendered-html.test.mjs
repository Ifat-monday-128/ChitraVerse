import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("built homepage renders without fabricated movie data or artwork", async () => {
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
  assert.match(html, /Hollywood movies/);
  assert.match(html, /Loading your movie library/);
  assert.doesNotMatch(html, /Interstellar|Breaking Bad|Stranger Things|interstellar-hero|13\+/);
  assert.match(html, /aria-label="Search"/);
  assert.match(html, /aria-label="Open profile"/);
  const assets = await readdir(new URL("../dist/client/", import.meta.url));
  assert.ok(!assets.includes("interstellar-hero.jpg"));
});
