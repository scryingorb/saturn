import assert from "node:assert/strict";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("pages-dist");
const base = process.env.PAGES_BASE_PATH || "/saturn/";
const html = await readFile(path.join(root, "index.html"), "utf8");
assert.match(html, /<title>Saturn/);
for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert.ok(asset.startsWith(base), `Asset must respect Pages base path: ${asset}`);
  assert.ok((await stat(path.join(root, asset.slice(base.length)))).isFile());
}
let files = 0;
async function verify(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await verify(file); continue; }
    files++;
    assert.ok(!/\.(?:map|pem)$/.test(file), "Private source/debug artifact in Pages output.");
    assert.ok(!/wrangler|^\.env|^\.dev\.vars/.test(entry.name), "Server configuration in Pages output.");
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /OPENAI_API_KEY|api\.openai\.com|cloudflare:workers|sk-(?:proj-|svcacct-)[A-Za-z0-9_-]{16,}/, "Server-only API material in static output.");
    for (const name of ["OPENAI_API_KEY", "CLOUDFLARE_API_TOKEN", "GITHUB_TOKEN", "GH_TOKEN"]) {
      const secret = process.env[name];
      if (secret && secret.length > 8) assert.ok(!content.includes(secret), `${name} leaked into static output.`);
    }
  }
}
await verify(root);
await writeFile(path.join(root, ".nojekyll"), "");
console.log(`Verified ${files} static files: base paths resolve; server credentials and code are absent.`);
