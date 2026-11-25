// POST /api/send  {id, test?}   sends one of FT Comms' emails (a row of ftc_emails) through Resend.
// GET  /api/send                says whether the email service's key is set.
//
// Who gets it is decided here again, not taken from the page: marketing goes only to people who agreed and haven't
// unsubscribed, and only an admin may send it; direct goes to 25 people at most. Each person it reaches gets an entry
// on their timeline, and a second try of the same email skips everyone who already has one, so nobody gets it twice.
const { person, db, rpc, readJson, send, esc, fill, page } = require('./_lib');
const DIRECT_MAX = 25, ALL_MAX = 5000;
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

async function resend(path, body, idem) {
  const r = await fetch('https://api.resend.com' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) }, body: JSON.stringify(body) });
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) throw new Error('The email service refused it: ' + (j.message || txt.slice(0, 200) || r.status));
  return j;
}

module.exports = async (req, res) => {
  const p = await person(req);
  if (!p) return send(res, 401, { error: 'Sign in again.' });
  const key = process.env.RESEND_API_KEY;
  if (req.method === 'GET') return send(res, 200, { ready: !!key });
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  try {
    const { id, test } = await readJson(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return send(res, 400, { error: 'Which email?' });
    const email = (await db(p, `ftc_emails?id=eq.${id}&select=*`))[0];
    if (!email) return send(res, 404, { error: 'That email is gone.' });
    const sender = ((await db(p, 'ftc_settings?key=eq.sender&select=value'))[0] || {}).value || {};
    if (!key) return send(res, 400, { error: 'The email service isn’t connected yet. See Settings.' });
    if (!sender.from_email) return send(res, 400, { error: 'Add a from address in Settings first.' });
    const marketing = email.kind === 'marketing';
    if (marketing && !sender.address) return send(res, 400, { error: 'Add your postal address in Settings first. Marketing email has to show one.' });
    if (!email.subject.trim() || !email.body.trim()) return send(res, 400, { error: 'The email needs a subject and a message.' });
    const from = `${(sender.from_name || 'Foreign Tongues').replace(/[<>"]/g, '')} <${sender.from_email}>`, reply = sender.reply_to || undefined;
    const origin = 'https://' + req.headers.host;

    if (test) {
      const me = { first_name: String(p.name || '').split(' ')[0] || '', last_name: '' };
      const foot = marketing ? `${esc(sender.address)}<br><span style="text-decoration:underline">Unsubscribe</span> (works in the real email)` : '';
      await resend('/emails', { from, to: [p.email], reply_to: reply, subject: '[Test] ' + fill(email.subject, me), html: page(email.body, me, foot) });
      return send(res, 200, { ok: true, to: p.email });
    }

    if (marketing && p.role !== 'admin') return send(res, 403, { error: 'Only admins can send marketing email.' });
    if (email.status === 'sent') return send(res, 409, { error: 'This email has already been sent.' });
    const ids = [...new Set(email.to_ids || [])].slice(0, ALL_MAX);
    if (!ids.length) return send(res, 400, { error: 'Nobody is picked to get this.' });
    // one sender at a time: only a draft (or a failed try) can start
    const took = await db(p, `ftc_emails?id=eq.${id}&status=in.(draft,failed)`, { method: 'PATCH', body: JSON.stringify({ status: 'sending' }) });
    if (!took || !took.length) return send(res, 409, { error: 'This email is already being sent.' });

    let sent = 0, skipped = 0, error = '', sentIds = [];
    try {
      const people = []; for (const part of chunks(ids, 120)) people.push(...await db(p, `ftc_people?id=in.(${part.join(',')})&select=id,first_name,last_name,emails,email_ok,unsubscribed_at`));
      const had = new Set((await db(p, `ftc_timeline?kind=eq.email_out&meta->>email_id=eq.${id}&select=person_id`)).map(r => r.person_id));
      const to = people.filter(q => (q.emails || []).length && !had.has(q.id) && (!marketing || (q.email_ok && !q.unsubscribed_at)));
      skipped = ids.length - to.length - had.size;
      if (!marketing && to.length > DIRECT_MAX) {   // more than that only when it's an event's own list: everyone getting it is on that event
        const seg = email.segment_id ? (await db(p, `ftc_segments?id=eq.${email.segment_id}&select=rules`))[0] : null, evId = seg && seg.rules && seg.rules.event && seg.rules.event.id;
        const on = evId && /^[0-9a-f-]{36}$/i.test(evId) ? new Set((await db(p, `ftc_event_people?event_id=eq.${evId}&select=person_id`)).map(r => r.person_id)) : null;
        if (!on || !to.every(q => on.has(q.id))) throw new Error(`A direct email goes to ${DIRECT_MAX} people at most. Send this one as Marketing.`);
      }
      const sigs = marketing && to.length ? await rpc('ftc_sigs', { ids: to.map(q => q.id) }, p.token) : {};
      const parts = chunks(to, 100);
      for (let n = 0; n < parts.length; n++) {
        const batch = parts[n].map(q => { const un = `${origin}/api/unsub?p=${q.id}&s=${sigs[q.id]}`;
          return { from, to: [q.emails[0]], reply_to: reply, subject: fill(email.subject, q),
            html: page(email.body, q, marketing ? `${esc(sender.address)}<br>You’re getting this because you agreed to hear from Foreign Tongues. <a href="${un}" style="color:#888">Unsubscribe</a>` : ''),
            ...(marketing ? { headers: { 'List-Unsubscribe': `<${un}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }; });
        await resend('/emails/batch', batch, `${id}-${had.size}-${n}`);
        await db(p, 'ftc_timeline', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(parts[n].map(q => ({ person_id: q.id, kind: 'email_out', summary: fill(email.subject, q), body: fill(email.body, q).slice(0, 4000), meta: { email_id: id, to: q.emails[0], marketing }, by_user: p.user_id }))) });
        sent += parts[n].length; sentIds.push(...parts[n].map(q => q.id));
      }
      sent += had.size;   // (those an earlier try already reached)
    } catch (e) { error = e.message || String(e); }
    const stats = { sent, skipped, ...(error ? { error } : {}) };
    await db(p, `ftc_emails?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: error ? 'failed' : 'sent', stats, ...(error ? {} : { sent_at: new Date().toISOString() }) }) });
    if (error) return send(res, 502, { error: (sent ? `Sent to ${sent}, then stopped: ` : '') + error });
    return send(res, 200, { ok: true, sent, skipped, sent_ids: sentIds });
  } catch (e) { return send(res, e.status === 401 ? 401 : 500, { error: e.message || String(e) }); }
};
