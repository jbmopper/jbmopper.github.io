import {afterEach, beforeEach, test} from "node:test";
import assert from "node:assert/strict";

const BASE = "https://api.example.test";
let calls: {url: string; init: RequestInit}[] = [];
let respond: () => Promise<Response>;
let store: Map<string, string>;
let loadCount = 0;

// warmUpChat keeps its in-flight promise at module scope, so each test loads a
// fresh copy of the module, the way each page load gets one.
async function freshWarmUpChat() {
  const mod = await import(`../../src/components/jay/api-client.ts?load=${loadCount++}`);
  return mod.warmUpChat as (apiBase?: string) => Promise<boolean>;
}

beforeEach(() => {
  calls = [];
  respond = async () => new Response(null, {status: 204});
  store = new Map();
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({url, init});
    return respond();
  }) as typeof fetch;
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
});

afterEach(() => {
  delete (globalThis as any).sessionStorage;
});

test("does nothing without an API base", async () => {
  const warmUpChat = await freshWarmUpChat();
  assert.equal(await warmUpChat(undefined), false);
  assert.equal(calls.length, 0);
});

test("sends one credential-free POST per page load, deduping concurrent calls", async () => {
  const warmUpChat = await freshWarmUpChat();
  const [first, second] = await Promise.all([warmUpChat(BASE), warmUpChat(BASE)]);
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/v1/chat/warmup`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers, undefined);
  assert.equal(calls[0].init.credentials, undefined);
  assert.equal(calls[0].init.body, undefined);
});

test("skips later page loads within the cooldown after a successful warmup", async () => {
  await (await freshWarmUpChat())(BASE);
  assert.equal(await (await freshWarmUpChat())(BASE), true);
  assert.equal(calls.length, 1);
});

test("retries on the next page load after a failed warmup", async () => {
  respond = async () => {
    throw new TypeError("network down");
  };
  assert.equal(await (await freshWarmUpChat())(BASE), false);
  respond = async () => new Response(null, {status: 503});
  assert.equal(await (await freshWarmUpChat())(BASE), false);
  respond = async () => new Response(null, {status: 204});
  assert.equal(await (await freshWarmUpChat())(BASE), true);
  assert.equal(calls.length, 3);
});

test("works where AbortSignal.timeout is missing", async () => {
  const original = AbortSignal.timeout;
  (AbortSignal as any).timeout = undefined;
  try {
    assert.equal(await (await freshWarmUpChat())(BASE), true);
    assert.equal(calls[0].init.signal, undefined);
  } finally {
    AbortSignal.timeout = original;
  }
});

test("never throws when storage is unavailable", async () => {
  (globalThis as any).sessionStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(await (await freshWarmUpChat())(BASE), true);
});
