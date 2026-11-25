// Shared helpers for FT Comms' server functions (files starting with _ in api/ are helpers, not endpoints).
// The browser sends its Supabase session as  Authorization: Bearer <access token>.  Every call is checked against
// the database as that person (fts_join: invited and active; ftc_allowed), and reads and writes go through the
// database's own rules as them. The only secret here is the email service's key (RESEND_API_KEY, in Vercel).
const SUPABASE_URL = 'https://ctmvkumkqlspyenbnnkn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yyJg7u4i2MMe1Y7mWYVELQ_3MU9zXWo';   // publishable: safe anywhere

async function rpc(name, args, token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token || SUPABASE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  const txt = await r.text(); if (!r.ok) throw Object.assign(new Error('db: ' + txt.slice(0, 300)), { status: r.status });
  return txt ? JSON.parse(txt) : null;
}
// the signed-in FT person, if they may use FT Comms; null otherwise
async function person(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try { const p = await rpc('fts_join', {}, token); if (!p || !p.user_id) return null;
    if ((await rpc('ftc_allowed', {}, token)) !== true) return null; return { ...p, token }; } catch (e) { return null; }
}
// the database as the signed-in person (their rules apply)
async function db(p, path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
  const txt = await r.text(); if (!r.ok) throw Object.assign(new Error('db: ' + txt.slice(0, 300)), { status: r.status });
  return txt ? JSON.parse(txt) : null;
}
async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = req.body;
  if (!raw) { const chunks = []; for await (const c of req) chunks.push(c); raw = Buffer.concat(chunks); }
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
}
function send(res, status, obj) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }

/* an email's text as a page (the same rules as js/model.js) */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fullName = p => [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
const fill = (text, p) => String(text || '').replace(/\{\{\s*first_name\s*\}\}/gi, (p && p.first_name) || 'there').replace(/\{\{\s*name\s*\}\}/gi, (p && fullName(p)) || 'there');
const bodyHtml = (text, p) => fill(text, p).trim().split(/\n\s*\n/).map(par => '<p style="margin:0 0 16px">' + esc(par).replace(/\n/g, '<br>').replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}">${u}</a>`) + '</p>').join('');
function page(text, p, foot) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff"><div style="max-width:560px;margin:0 auto;font:16px/1.55 Georgia,'Times New Roman',serif;color:#222">${bodyHtml(text, p)}${foot ? `<div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:#888;border-top:1px solid #eee;padding-top:14px;margin-top:28px">${foot}</div>` : ''}</div></body></html>`;
}

module.exports = { SUPABASE_URL, SUPABASE_KEY, rpc, person, db, readJson, send, esc, fill, page };
