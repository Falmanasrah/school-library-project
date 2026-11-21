// Cloudflare Worker: a second, free address for the School Library System.
//
// Some internet providers cut every connection to an address that ends in ".vercel.app".
// This Worker runs on Cloudflare at an address such as https://school-library.NAME.workers.dev
// and forwards every request to the Vercel site from Cloudflare's side, so the provider never
// sees "vercel.app". Nothing is stored here: the apps, the server and the database stay on Vercel.
//
// Settings (Cloudflare -> this Worker -> Settings -> Variables and Secrets):
//   PROXY_SECRET  type "Secret". Required. The same long random value as PROXY_SECRET in Vercel.
//   TARGET        type "Text". Optional. The Vercel address, if it is not the one below.
const DEFAULT_TARGET = 'https://school-library-project-nu.vercel.app';

// Visitor headers that are never passed on: our own trust headers (a visitor could fake them),
// Cloudflare's and the proxy-chain headers (Vercel adds its own), and connection-level headers.
const DROP = /^(x-sls-.*|cf-.*|x-forwarded-.*|x-real-ip|forwarded|true-client-ip|cdn-loop|host|connection|keep-alive|transfer-encoding|te|trailer|upgrade|proxy-.*)$/i;

function text(status, message) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    if (!env.PROXY_SECRET) return text(500, 'This address is not set up yet: add PROXY_SECRET in the Cloudflare Worker settings.');
    let target;
    try { target = new URL(env.TARGET || DEFAULT_TARGET); } catch { return text(500, 'TARGET in the Cloudflare Worker settings is not a web address.'); }
    const url = new URL(request.url);

    const headers = new Headers();
    for (const [k, v] of request.headers) if (!DROP.test(k)) headers.set(k, v);
    headers.set('X-SLS-Proxy-Key', env.PROXY_SECRET);
    headers.set('X-SLS-Public-Host', url.host);
    headers.set('X-SLS-Client-IP', request.headers.get('CF-Connecting-IP') || '');

    const init = { method: request.method, headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();

    // Joined as text so a path such as "//other-site.com" stays on the Vercel site.
    let upstream;
    try {
      upstream = await fetch(target.origin + url.pathname + url.search, init);
    } catch {
      return text(502, 'The school library server could not be reached. Please try again in a minute.');
    }

    // Redirects from Vercel (for example /library -> /library/) must stay on this address.
    const out = new Headers(upstream.headers);
    const loc = out.get('Location');
    if (loc) {
      const l = new URL(loc, target);
      if (l.host === target.host) { l.protocol = url.protocol; l.host = url.host; out.set('Location', l.toString()); }
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  }
};
