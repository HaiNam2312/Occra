// Occra API proxy (Cloudflare Worker). Keeps the YouTube key server-side and caches results
// so a shared daily quota (10,000 units; each search = 100) goes much further.
export default {
  async fetch(req, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (origin !== '*' && req.headers.get('Origin') && req.headers.get('Origin') !== origin)
      return json({ error: { message: 'Origin not allowed' } }, 403, cors);

    const url = new URL(req.url), p = url.searchParams;
    let api, ttl, shape, cacheKey;
    if (url.pathname === '/search') {
      const q = (p.get('q') || '').trim().toLowerCase().slice(0, 100);
      if (!q) return json({ error: { message: 'Missing q' } }, 400, cors);
      api = 'search?part=snippet&type=video&videoEmbeddable=true&maxResults=15&q=' + encodeURIComponent(q);
      ttl = 86400; cacheKey = 'search:' + q;
      shape = d => ({ items: (d.items || []).map(x => ({ id: x.id.videoId, title: decode(x.snippet.title), by: x.snippet.channelTitle })) });
    } else if (url.pathname === '/playlist') {
      const id = p.get('id') || '', tok = p.get('pageToken') || '';
      if (!/^[\w-]{10,50}$/.test(id) || !/^[\w-]{0,40}$/.test(tok)) return json({ error: { message: 'Bad params' } }, 400, cors);
      api = 'playlistItems?part=snippet&maxResults=50&playlistId=' + id + (tok ? '&pageToken=' + tok : '');
      ttl = 3600; cacheKey = 'pl:' + id + ':' + tok;
      shape = d => ({
        next: d.nextPageToken || null,
        items: (d.items || []).filter(x => x.snippet.resourceId && !/^(Private|Deleted) video$/.test(x.snippet.title))
          .map(x => ({ id: x.snippet.resourceId.videoId, title: x.snippet.title, by: (x.snippet.videoOwnerChannelTitle || '').replace(' - Topic', '') }))
      });
    } else return json({ error: { message: 'Not found' } }, 404, cors);

    const cache = caches.default, ck = new Request('https://occra.cache/' + encodeURIComponent(cacheKey));
    const hit = await cache.match(ck);
    if (hit) return new Response(hit.body, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });

    const r = await fetch('https://www.googleapis.com/youtube/v3/' + api + '&key=' + env.YT_KEY);
    const d = await r.json();
    if (d.error) return json({ error: { message: d.error.message } }, 502, cors);
    const res = new Response(JSON.stringify(shape(d)), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + ttl } });
    ctx.waitUntil(cache.put(ck, res.clone()));
    return new Response(res.body, { headers: { ...cors, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
  }
};
const json = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
