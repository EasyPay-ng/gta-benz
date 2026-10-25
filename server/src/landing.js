// What to say when someone opens the game's WebSocket address in a browser.
//
// Kept apart from index.js on purpose: this file has no Durable Object imports, so
// Node can test it without a `cloudflare:workers` runtime.

/** Does this look like a person in a browser rather than a WebSocket client? */
export function wantsHtml(request) {
  return (request.headers.get('accept') || '').includes('text/html');
}

/** Strip anything that could break out of an attribute or a tag. */
function safeOrigin(origin) {
  return String(origin || '').replace(/[<>"']/g, '');
}

export const GAME_URL = 'https://easypay-ng.github.io/gta-benz/';
export const GUIDE_URL = 'https://github.com/EasyPay-ng/gta-benz/blob/main/DEPLOY.md';

/**
 * A browser cannot open a WebSocket, so pasting the game's server address into the
 * address bar — the most natural thing to try — used to answer
 * `{"error":"expected a WebSocket upgrade"}`, which reads as a broken server.
 */
export function landingPage(origin, room = 'metro-1') {
  const safe = safeOrigin(origin);
  const ws = `${safe.replace(/^http/, 'ws')}/ws?room=${encodeURIComponent(room)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MetroVenture city server</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #0b1220; color: #e2e8f0;
         font: 16px/1.6 -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif; }
  main { max-width: 640px; padding: 32px 28px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  h1 span { color: #f59e0b; }
  p { color: #94a3b8; margin: 0 0 18px; }
  code { display: block; padding: 12px 14px; border-radius: 10px; margin: 0 0 18px;
         background: #111c33; border: 1px solid #1e293b; color: #7dd3fc;
         font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px;
         white-space: pre-wrap; word-break: break-all; }
  a { color: #fbbf24; }
  ul { padding-left: 20px; color: #cbd5e1; }
  li { margin-bottom: 6px; }
  .ok { color: #4ade80; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Metro<span>Venture</span> city server</h1>
  <p class="ok">&#10003; This server is running.</p>
  <p>You opened the game's <b>WebSocket</b> address in a browser. A browser cannot make
     that connection, which is why you are reading this page instead of playing.
     Nothing is broken.</p>
  <p>This address is not for the address bar &mdash; it goes into the
     <b>Server address</b> box inside the game:</p>
  <code>${ws}</code>
  <ul>
    <li><a href="${GAME_URL}">Open the game</a> and paste the address above</li>
    <li><a href="${safe}/health">Check the server's health</a> &mdash; plain JSON</li>
    <li><a href="${GUIDE_URL}">How this server was deployed</a></li>
  </ul>
</main>
</body>
</html>`;
}

/**
 * The response for a `/ws` request that is not a WebSocket upgrade.
 * A browser gets the page; anything else gets the 426 it was already being given.
 */
export function webSocketFallback(request, origin, room = 'metro-1') {
  if (wantsHtml(request)) {
    return new Response(landingPage(origin, room), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new Response(JSON.stringify({ error: 'expected a WebSocket upgrade' }), {
    status: 426,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
