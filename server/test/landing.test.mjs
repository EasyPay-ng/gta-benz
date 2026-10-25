// What someone sees when they open the game's WebSocket address in a browser.
//
// The game's connection address is a WebSocket URL, and the most natural thing to do
// with it is paste it into the address bar. That used to answer
// `{"error":"expected a WebSocket upgrade"}`, which reads as a broken server. A
// browser now gets a page that explains itself; a script still gets the 426 it wants.
//
// Tested through src/landing.js rather than src/index.js because index.js re-exports
// the Durable Objects, which import `cloudflare:workers` — a specifier Node cannot
// resolve.

import test from 'node:test';
import assert from 'node:assert/strict';

import { landingPage, webSocketFallback, wantsHtml, GAME_URL } from '../src/landing.js';

const request = (headers = {}) => new Request('https://metroventure-city.example.workers.dev/ws?room=metro-1', { headers });

const BROWSER = { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
const TOOL = { accept: '*/*' };
const ORIGIN = 'https://metroventure-city.owanaomubo80.workers.dev';

// ---------------------------------------------------------------------------
// 1. Browser vs tool
// ---------------------------------------------------------------------------
test('Landing: a browser is recognised by its Accept header', () => {
  assert.equal(wantsHtml(request(BROWSER)), true);
  assert.equal(wantsHtml(request(TOOL)), false);
  assert.equal(wantsHtml(request({})), false, 'no header is not a browser');
  assert.equal(wantsHtml(request({ accept: 'application/json' })), false);
});

test('Landing: a browser on /ws gets a page, not JSON', async () => {
  const res = webSocketFallback(request(BROWSER), ORIGIN, 'metro-1');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);

  const html = await res.text();
  assert.match(html, /This server is running/, 'it confirms the server is alive');
  assert.match(html, /cannot make\s+that connection/, 'it says why it did not connect');
  assert.match(html, /Nothing is broken/, 'it does not imply a fault');
  assert.match(html, /Server address/, 'it names the box to paste into');
  assert.match(html, new RegExp(`wss://metroventure-city\\.owanaomubo80\\.workers\\.dev/ws\\?room=metro-1`));
  assert.ok(html.includes(GAME_URL), 'it links to the game');
  assert.match(html, /\/health/, 'it links to the health check');
  assert.doesNotMatch(html, /expected a WebSocket upgrade/, 'the raw error is not shown to people');
});

test('Landing: a tool still gets the machine-readable 426', async () => {
  const res = webSocketFallback(request(TOOL), ORIGIN, 'metro-1');
  assert.equal(res.status, 426);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await res.json(), { error: 'expected a WebSocket upgrade' });
});

// ---------------------------------------------------------------------------
// 2. The page content
// ---------------------------------------------------------------------------
test('Landing: http becomes ws and https becomes wss', () => {
  assert.match(landingPage('https://city.example.com'), /wss:\/\/city\.example\.com\/ws\?room=metro-1/);
  assert.match(landingPage('http://localhost:8787'), /ws:\/\/localhost:8787\/ws\?room=metro-1/);
});

test('Landing: the room in the address is the room shown back', () => {
  const html = landingPage(ORIGIN, 'downtown-2');
  assert.match(html, /\/ws\?room=downtown-2/);
  // and it is URL-encoded so it cannot break the code block
  assert.match(landingPage(ORIGIN, 'a b&c'), /room=a%20b%26c/);
});

test('Landing: a crafted origin cannot inject markup', () => {
  const nasty = landingPage('https://x"><script>alert(1)</script>');
  assert.doesNotMatch(nasty, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(nasty, /"><script/);
});

test('Landing: no origin at all still renders something usable', () => {
  const html = landingPage(undefined);
  assert.match(html, /This server is running/);
  assert.match(html, /\/ws\?room=metro-1/);
});
