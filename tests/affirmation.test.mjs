import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAffirmation } from "../server/affirmation.ts";

const origin = "https://scryingorb.github.io";
const request = (body = { question: "Can I finish my project?" }, extra = {}) => new Request("https://saturn.example/api/affirmation", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": "192.0.2.1", ...extra }, body: JSON.stringify(body),
});
const env = { AFFIRMATION_ALLOWED_ORIGINS: origin };
const neverFetch = () => { throw new Error("Provider should not be called"); };

test("keyless requests return labeled encouragement and explicit CORS without secrets", async () => {
  const response = await handleAffirmation(request(), env, neverFetch);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).source, "built-in");
});

test("Pages preflight succeeds; untrusted origins are rejected before provider access", async () => {
  const response = await handleAffirmation(new Request("https://saturn.example/api/affirmation", { method: "OPTIONS", headers: { Origin: origin } }), env, neverFetch);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  const denied = await handleAffirmation(request(undefined, { Origin: "https://untrusted.example" }), env, neverFetch);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
});

test("invalid JSON shapes, missing questions, long questions and large bodies are rejected", async () => {
  for (const body of [null, [], {}, { question: " " }, { question: 4 }, { question: "x".repeat(241) }]) {
    assert.equal((await handleAffirmation(request(body), env, neverFetch)).status, 400);
  }
  assert.equal((await handleAffirmation(request({ question: "x".repeat(3000) }), env, neverFetch)).status, 413);
  assert.equal((await handleAffirmation(request(undefined, { "Content-Type": "text/plain" }), env, neverFetch)).status, 415);
});

test("API key is used only in provider authorization; response contains no credentials", async () => {
  const secret = "test-server-secret-not-real";
  const configured = { ...env, OPENAI_API_KEY: secret, AFFIRMATION_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  let calls = 0;
  const response = await handleAffirmation(request(), configured, async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(JSON.parse(options.body).store, false);
    return Response.json({ output: [{ content: [{ type: "output_text", text: "Take one small step today." }] }] });
  });
  assert.equal(calls, 1);
  const body = await response.text();
  assert.equal(JSON.parse(body).source, "ai");
  assert.ok(!body.includes(secret));
});

test("quota guard fails closed and provider errors never expose secrets", async () => {
  const configured = { ...env, OPENAI_API_KEY: "test-server-secret-not-real" };
  assert.equal((await (await handleAffirmation(request(), configured, neverFetch)).json()).source, "built-in");
  const limited = await handleAffirmation(request(), { ...configured, AFFIRMATION_RATE_LIMITER: { limit: async () => ({ success: false }) } }, neverFetch);
  assert.equal(limited.status, 429);
  const response = await handleAffirmation(request(), { ...configured, AFFIRMATION_RATE_LIMITER: { limit: async () => ({ success: true }) } }, () => { throw new Error(configured.OPENAI_API_KEY); });
  const body = await response.text();
  assert.equal(JSON.parse(body).source, "built-in");
  assert.ok(!body.includes(configured.OPENAI_API_KEY));
});
