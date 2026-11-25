// /api/unsub?p=<person>&s=<signature>   the unsubscribe link at the bottom of marketing emails.
// Opening it shows a button (so a mail scanner that only follows links doesn't unsubscribe anyone); pressing it, or a
// mail app's own one-click unsubscribe (a POST), turns marketing email off for that one person. The signature is made
// and checked in the database, so the link works for that person only.
const { rpc, esc } = require('./_lib');
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head><body style="margin:0;background:#f6f3ec;font:16px/1.5 system-ui,-apple-system,sans-serif;color:#1d1b16"><div style="max-width:420px;margin:14vh auto;padding:28px;background:#fffdf8;border:1px solid #e4ded1;border-radius:16px;text-align:center"><h1 style="font:400 30px Georgia,serif;margin:0 0 10px">Foreign Tongues</h1>${body}</div></body></html>`;

module.exports = async (req, res) => {
  const q = new URL(req.url, 'https://x').searchParams, p = q.get('p') || '', s = q.get('s') || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  if (!/^[0-9a-f-]{36}$/i.test(p) || !/^[0-9a-f]{64}$/i.test(s)) { res.statusCode = 400; return res.end(page('Unsubscribe', '<p>This link isn’t complete. Use the one at the bottom of the email.</p>')); }
  if (req.method === 'POST') {
    let ok = false; try { ok = (await rpc('ftc_unsub', { pid: p, sig: s })) === true; } catch (e) {}
    res.statusCode = ok ? 200 : 400;
    return res.end(page(ok ? 'Unsubscribed' : 'Unsubscribe', ok ? '<p>You’re unsubscribed. You won’t get marketing email from us again.</p>' : '<p>That didn’t work. Reply to the email and we’ll take you off the list ourselves.</p>'));
  }
  res.statusCode = 200;
  res.end(page('Unsubscribe', `<p>Stop getting marketing email from Foreign Tongues?</p><form method="post" action="/api/unsub?p=${esc(p)}&s=${esc(s)}"><button style="font:500 15px system-ui;background:#1d1b16;color:#fff;border:0;border-radius:999px;padding:11px 22px;cursor:pointer">Unsubscribe</button></form>`));
};
