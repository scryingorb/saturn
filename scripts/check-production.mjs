import assert from "node:assert/strict";

const pagesUrl = process.env.PAGES_URL || "http://127.0.0.1:4173/saturn/";
const workerUrl = process.env.WORKER_URL || "http://127.0.0.1:8789";
const staticResponse = await fetch(pagesUrl);
assert.equal(staticResponse.status, 200);
const html = await staticResponse.text();
assert.match(html, /<title>Saturn/);
for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const response = await fetch(new URL(asset, pagesUrl));
  assert.equal(response.status, 200, `Missing asset ${asset}`);
  if (asset.endsWith(".js")) {
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.doesNotMatch(await response.text(), /OPENAI_API_KEY|api\.openai\.com|cloudflare:workers/);
  }
}
console.log(`Static page and all referenced assets passed: ${pagesUrl}`);

if (!process.env.SKIP_WORKER) {
  const page = await fetch(workerUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Saturn/);
  const api = `${workerUrl}/api/affirmation`;
  const origin = "https://scryingorb.github.io";
  const response = await fetch(api, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ question: "Can I finish my project?" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).source, "built-in");
  const preflight = await fetch(api, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
  assert.equal(preflight.status, 204);
  const denied = await fetch(api, { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify({ question: "hello" }) });
  assert.equal(denied.status, 403);
  const invalid = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  assert.equal(invalid.status, 400);
  console.log("Production Worker page, built-in reply, CORS/preflight, origin denial and invalid input passed.");
}
