// The Durable Object wrapper around the pure AccountHub API.
//
// Deliberately thin: parse the body, hand it to `handleApi`, turn the result
// into JSON. All the rules live in ./account-hub.js so they can be tested in
// Node without the Workers runtime.
//
// One object — idFromName('global') — owns every account and every cloud save,
// so identity survives the district sharding that comes in Phase 2.

import { DurableObject } from 'cloudflare:workers';
import { handleApi, respond, CORS_HEADERS, MAX_SAVE_BODY_BYTES } from './account-hub.js';

const json = (status, body) => respond({ status, body }, CORS_HEADERS);

export class AccountHub extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!url.pathname.startsWith('/api/')) {
      return json(404, { ok: false, code: 'not_found', message: 'Unknown endpoint.' });
    }

    let body = null;
    if (request.method === 'PUT' || request.method === 'POST') {
      let text = '';
      try {
        text = await request.text();
      } catch {
        return json(400, { ok: false, code: 'bad_json', message: 'Malformed request.' });
      }
      if (text.length > MAX_SAVE_BODY_BYTES) {
        return json(413, { ok: false, code: 'too_large', message: 'That save is too large.' });
      }
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return json(400, { ok: false, code: 'bad_json', message: 'Malformed request.' });
        }
      } else {
        body = {};
      }
    }

    const result = await handleApi({
      method: request.method,
      path: url.pathname,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      storage: this.ctx.storage,
      now: Date.now(),
    });
    return respond(result, CORS_HEADERS);
  }
}
