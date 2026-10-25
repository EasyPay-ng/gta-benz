// Server discovery: where the game looks for `net.json`, and what it does with
// whatever it finds there.
//
// This exists because of a bug that only shows up on a real deployment: GitHub
// Pages serves this project from a sub-path (`/gta-benz/`), so an absolute
// `/net.json` would be fetched from the domain root, 404, and the game would fall
// back to the "city is offline" card while the server was actually live.

import test from 'node:test';
import assert from 'node:assert/strict';

import { netJsonUrl, toWebSocketUrl, discoverServerUrl } from '../src/net.js';

const PAGES = 'https://easypay-ng.github.io/gta-benz/';
const LIVE = 'https://metroventure-city.owanaomubo80.workers.dev/ws?room=metro-1';

/** A storage stub: getItem returns null, setItem/removeItem do nothing. */
const emptyStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/** fetch stub that records the URL and replays one response. */
function fakeFetch(response = {}, calls = []) {
  return async (url) => {
    calls.push(url);
    if (response.throws) throw response.throws;
    return {
      ok: response.status ? response.status < 400 : true,
      status: response.status || 200,
      json: async () => response.json,
    };
  };
}

// ---------------------------------------------------------------------------
// 1. Where net.json is looked for
// ---------------------------------------------------------------------------
test('Discovery: net.json is looked for beside the page, not at the domain root', () => {
  const expected = 'https://easypay-ng.github.io/gta-benz/net.json';

  // the three shapes a project page can actually be requested as
  assert.equal(netJsonUrl(PAGES), expected);
  assert.equal(netJsonUrl('https://easypay-ng.github.io/gta-benz'), expected, 'no trailing slash is still the directory');
  assert.equal(netJsonUrl('https://easypay-ng.github.io/gta-benz/index.html'), expected, 'index.html is a file');

  // a query string must not become part of the path
  assert.equal(netJsonUrl(`${PAGES}?server=wss%3A%2F%2Fx`), expected);
  assert.equal(netJsonUrl(`${PAGES}#hud`), expected);

  // the dev server serves the game at the root
  assert.equal(netJsonUrl('http://localhost:8080/'), 'http://localhost:8080/net.json');
  assert.equal(netJsonUrl('http://localhost:8080/index.html'), 'http://localhost:8080/net.json');

  // nested paths keep their directory
  assert.equal(netJsonUrl('https://example.com/a/b/c/'), 'https://example.com/a/b/c/net.json');
});

test('Discovery: netJsonUrl never throws on junk', () => {
  // A nonsense host still resolves against the base rather than throwing.
  assert.equal(typeof netJsonUrl('not a url'), 'string');
  // An unparseable href is reported as "no file here", not an exception.
  assert.equal(netJsonUrl('http://'), null);
});

// ---------------------------------------------------------------------------
// 2. What the discovered address is turned into
// ---------------------------------------------------------------------------
test('Discovery: an https address from net.json becomes wss, http becomes ws', () => {
  // This is the exact string the deploy summary prints.
  assert.equal(
    toWebSocketUrl(LIVE, PAGES),
    'wss://metroventure-city.owanaomubo80.workers.dev/ws?room=metro-1',
  );
  assert.equal(toWebSocketUrl('http://127.0.0.1:8787/ws', PAGES), 'ws://127.0.0.1:8787/ws');
  assert.equal(toWebSocketUrl('wss://x.workers.dev/ws', PAGES), 'wss://x.workers.dev/ws');
  // the dev server advertises a root-relative path; that must still work
  assert.equal(toWebSocketUrl('/ws?room=metro-1', 'https://host.example/'), 'wss://host.example/ws?room=metro-1');
  assert.equal(toWebSocketUrl('/ws?room=metro-1', 'http://localhost:8080/'), 'ws://localhost:8080/ws?room=metro-1');

  // and these are typos, not addresses — the URL parser would otherwise accept them
  assert.equal(toWebSocketUrl('ftp://host/ws', PAGES), null);
  assert.equal(toWebSocketUrl('not-a-url', PAGES), null, 'a bare word is not an address');
  assert.equal(toWebSocketUrl('', PAGES), null);
  assert.equal(toWebSocketUrl(null, PAGES), null);
});

// ---------------------------------------------------------------------------
// 3. The whole discovery path
// ---------------------------------------------------------------------------
test('Discovery: a published build with net.json connects without asking anyone', async () => {
  const calls = [];
  const url = await discoverServerUrl(PAGES, emptyStorage, fakeFetch({ json: { url: LIVE } }, calls));

  assert.deepEqual(calls, ['https://easypay-ng.github.io/gta-benz/net.json']);
  assert.equal(url, 'wss://metroventure-city.owanaomubo80.workers.dev/ws?room=metro-1');
});

test('Discovery: no net.json means no server, not a crash', async () => {
  const url = await discoverServerUrl(PAGES, emptyStorage, fakeFetch({ status: 404, json: null }));
  assert.equal(url, null);

  const offline = await discoverServerUrl(PAGES, emptyStorage, fakeFetch({ throws: new TypeError('offline') }));
  assert.equal(offline, null);
});

test('Discovery: a net.json with a bad url is rejected loudly but safely', async () => {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    const url = await discoverServerUrl(PAGES, emptyStorage, fakeFetch({ json: { url: 'not-a-url' } }));
    assert.equal(url, null);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /not a ws:\/\/ or wss:\/\/ address/);
  } finally {
    console.warn = original;
  }
});

test('Discovery: ?server= and a stored address win over net.json', async () => {
  // An explicit override must not even fetch the file.
  const calls = [];
  const viaQuery = await discoverServerUrl(`${PAGES}?server=wss%3A%2F%2Fchosen.example%2Fws`, emptyStorage, fakeFetch({ json: { url: LIVE } }, calls));
  assert.equal(viaQuery, 'wss://chosen.example/ws');
  assert.deepEqual(calls, [], 'net.json was not fetched');

  // A stored server is used and normalised to wss.
  const stored = { getItem: (k) => (k === 'metroventure_server' ? LIVE : null), setItem: () => {}, removeItem: () => {} };
  const calls2 = [];
  const viaStore = await discoverServerUrl(PAGES, stored, fakeFetch({ json: { url: 'wss://other.example/ws' } }, calls2));
  assert.equal(viaStore, 'wss://metroventure-city.owanaomubo80.workers.dev/ws?room=metro-1');
  assert.deepEqual(calls2, []);
});

test('Discovery: ?offline=1 still turns discovery off', async () => {
  const calls = [];
  const url = await discoverServerUrl(`${PAGES}?offline=1`, emptyStorage, fakeFetch({ json: { url: LIVE } }, calls));
  assert.equal(url, null);
  assert.deepEqual(calls, []);
});
