import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

test("built homepage supports browsing without a mandatory login", async () => {
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

  assert.doesNotMatch(html, /Checking your session/);
  assert.match(html, /Loading your movie library/);
  assert.doesNotMatch(html, /Interstellar|Breaking Bad|Stranger Things|interstellar-hero|13\+/);
  assert.match(html, /aria-label="Search the library"/);

  const assets = await readdir(new URL("../dist/client/", import.meta.url));
  assert.ok(!assets.includes("interstellar-hero.jpg"));
});
