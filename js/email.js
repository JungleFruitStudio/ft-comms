// Email: the list of drafts and sent emails, and the page where one is written, previewed, tested and sent.
// Two kinds. Marketing goes to a segment or a picked group, only to people who agreed to it, with an unsubscribe
// link. Direct is a personal note to a few people (25 at most), with no consent needed and no footer.
import { state, person, org, segment, emailById, eventById, create, update, remove, api, isAdmin, sb } from './db.js';
import { $, $$, esc, toast, confirmBox, busy } from './ui.js';
import * as M from './model.js';

const orgOf = id => org(id);
const DIRECT_MAX = 25;

export function emailPage(main) {
  const rows = [...state.emails].sort((a, b) => (b.sent_at || b.updated_at).localeCompare(a.sent_at || a.updated_at));
  main.innerHTML = `
    <div class="head"><div><h1>Email</h1><p>Write to a segment, to people picked from the list, or to one person. Everything sent lands on each person’s timeline.</p></div>
      <button class="btn primary" id="add"><i data-ic="make"></i>New email</button></div>
    ${rows.length ? `<table class="table ptable"><thead><tr><th>Subject</th><th>Kind</th><th>To</th><th>Status</th><th class="opt">When</th></tr></thead><tbody>${rows.map(e => `<tr data-id="${e.id}"><td class="name">${esc(e.subject || 'No subject')}</td><td><span class="chip type">${e.kind === 'marketing' ? 'Marketing' : 'Direct'}</span></td><td>${esc(toLabel(e))}</td><td>${e.status === 'sent' ? `<span class="chip green">Sent to ${(e.stats && e.stats.sent) || 0}</span>` : e.status === 'failed' ? '<span class="chip red">Failed</span>' : e.status === 'sending' ? '<span class="chip amber">Sending</span>' : '<span class="chip grey">Draft</span>'}</td><td class="opt when">${esc(M.when(e.sent_at || e.updated_at))}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No emails yet.</div>`}`;
  $('#add', main).onclick = async () => { try { const e = await create('emails', { kind: 'marketing' }); location.hash = '#/email/' + e.id; } catch (er) { toast('Couldn’t start one: ' + er.message, 'error'); } };
  const t = $('tbody', main); if (t) t.onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/email/' + tr.dataset.id; };
}
function toLabel(e) {
  const s = e.segment_id && segment(e.segment_id);
  if (s) return 'Segment: ' + s.name;
  const n = (e.to_ids || []).length; if (!n) return 'Nobody yet';
  if (n === 1) { const p = person(e.to_ids[0]); return p ? M.fullName(p) : '1 person'; }
  return n + ' people';
}
// who an email would go to right now, and who is left out and why
function audience(e) {
  const s = e.segment_id && segment(e.segment_id);
  const pool = s ? state.people.filter(p => M.matches(p, s.rules, orgOf)) : (e.to_ids || []).map(person).filter(Boolean);
  const out = { to: [], noEmail: 0, noConsent: 0 };
  for (const p of pool) {
    if (!(p.emails || []).length) out.noEmail++;
    else if (e.kind === 'marketing' && !(p.email_ok && !p.unsubscribed_at)) out.noConsent++;
    else out.to.push(p);
  }
  return out;
}

export function composePage(main, id) {
  const e = emailById(id);
  if (!e) { main.innerHTML = `<a class="backlink" href="#/email"><i data-ic="back"></i>Email</a><div class="empty">This email has been deleted.</div>`; return; }
  if (e.status === 'sent' || e.status === 'sending') return sentPage(main, e);
  const sender = state.settings.sender || {};
  let t = 0; const save = patch => { Object.assign(e, patch); clearTimeout(t); t = setTimeout(async () => { try { await update('emails', id, patch); } catch (er) { toast('Couldn’t save the draft: ' + er.message, 'error'); } }, 500); };
  const flush = async () => { clearTimeout(t); await update('emails', id, { subject: e.subject, body: e.body, kind: e.kind, segment_id: e.segment_id, to_ids: e.to_ids }); };
  main.innerHTML = `
    <a class="backlink" href="#/email"><i data-ic="back"></i>Email</a>
    <div class="head"><div><h1>${e.status === 'failed' ? 'Email <em>(not sent)</em>' : 'New email'}</h1></div><div class="row"><button class="btn danger" id="del">Delete draft</button></div></div>
    ${e.status === 'failed' ? `<div class="notice">The last try failed: ${esc((e.stats && e.stats.error) || 'unknown reason')}. Nothing was marked as sent beyond what the timeline shows.</div>` : ''}
    <div class="two-col even">
      <div class="panel"><div class="stack">
        <div class="field"><span>Kind</span><div><div class="seg" id="kind"><button data-k="marketing" class="${e.kind === 'marketing' ? 'on' : ''}">Marketing</button><button data-k="direct" class="${e.kind === 'direct' ? 'on' : ''}">Direct</button></div>
          <div class="small muted" id="kindNote" style="margin-top:7px"></div></div></div>
        <label class="field"><span>To</span><select class="input" id="to"><option value="">${(e.to_ids || []).length ? esc(toLabel({ ...e, segment_id: null })) + ' (picked)' : 'Choose a segment'}</option>${state.segments.map(s => `<option value="${s.id}" ${s.id === e.segment_id ? 'selected' : ''}>Segment: ${esc(s.name)}</option>`).join('')}${state.events.length ? `<optgroup label="From FT Events">${state.events.map(v => `<option value="ev:${v.id}:guest">Guests of ${esc(v.name)}</option><option value="ev:${v.id}:team">Team of ${esc(v.name)}</option>`).join('')}</optgroup>` : ''}</select></label>
        <div class="small muted" id="aud"></div>
        <label class="field"><span>Subject</span><input class="input" id="subj" value="${esc(e.subject)}"></label>
        <label class="field"><span>Message</span><textarea class="input" id="body" rows="14" placeholder="Hi {{first_name}},">${esc(e.body)}</textarea></label>
        <p class="small muted">Leave a blank line between paragraphs. <code>{{first_name}}</code> becomes each person’s first name. Web addresses turn into links.</p>
        <div class="row end"><button class="btn" id="test">Send a test to me</button><button class="btn primary" id="send">Send</button></div>
      </div></div>
      <div class="panel"><h3>Preview</h3><p class="small muted" id="pvNote"></p><div class="preview" id="pv"></div></div>
    </div>`;
  const draw = () => {
    const seg = e.segment_id && segment(e.segment_id), forEvent = !!(seg && seg.rules && seg.rules.event && seg.rules.event.id);
    const a = audience(e), first = a.to[0] || null, over = e.kind === 'direct' && a.to.length > DIRECT_MAX && !forEvent;
    $('#kindNote', main).textContent = e.kind === 'marketing' ? 'Goes only to people who agreed to marketing email. An unsubscribe link and your postal address are added at the bottom.' : (forEvent ? 'A note to the people on that event’s list, however many. No footer is added.' : `A personal note to up to ${DIRECT_MAX} people. No footer is added.`);
    $('#aud', main).innerHTML = `<strong>${a.to.length}</strong> ${a.to.length === 1 ? 'person' : 'people'} will get it.` + (a.noConsent ? ` ${a.noConsent} left out: they haven’t agreed to marketing email.` : '') + (a.noEmail ? ` ${a.noEmail} left out: no email address.` : '') + (over ? ` <span style="color:var(--red)">That’s more than ${DIRECT_MAX}; send it as Marketing.</span>` : '');
    $('#pvNote', main).textContent = first ? `As ${M.fullName(first)} will see it. From ${sender.from_name || 'Foreign Tongues'} <${sender.from_email || 'no from address yet'}>.` : 'Pick who it goes to and the preview fills in their name.';
    $('#pv', main).innerHTML = `<p style="font:600 15px var(--f-ui);margin-bottom:16px">${esc(M.fill(e.subject, first)) || '<span class="faint">No subject</span>'}</p>${M.bodyHtml(e.body, first) || '<p class="faint">Nothing written yet.</p>'}${e.kind === 'marketing' ? `<div class="foot">${esc(sender.address || 'Your postal address (add it in Settings)')}<br><u>Unsubscribe</u></div>` : ''}`;
    $('#send', main).textContent = a.to.length ? `Send to ${a.to.length} ${a.to.length === 1 ? 'person' : 'people'}` : 'Send';
    $('#send', main).disabled = !a.to.length || over;
  };
  draw();
  $$('#kind button', main).forEach(b => b.onclick = () => { $$('#kind button', main).forEach(x => x.classList.toggle('on', x === b)); save({ kind: b.dataset.k }); draw(); });
  // an event's guests or team: a segment for it is made (once) and used, and the email becomes a direct one
  $('#to', main).onchange = async ev => { const v = ev.target.value, m = /^ev:([\w-]+):(guest|team)$/.exec(v);
    if (!m) { save({ segment_id: v || null }); draw(); return; }
    const evn = eventById(m[1]), name = `${m[2] === 'team' ? 'Team' : 'Guests'} of ${evn ? evn.name : 'the event'}`;
    try { const seg = state.segments.find(s => s.rules && s.rules.event && s.rules.event.id === m[1] && s.rules.event.as === m[2] && !s.rules.event.status && M.describe({ event: s.rules.event }) === M.describe(s.rules))
        || await create('segments', { name, rules: { ...M.emptyRules(), event: { id: m[1], as: m[2], status: '' } } });
      clearTimeout(t); Object.assign(e, { segment_id: seg.id, kind: 'direct' }); await update('emails', id, { segment_id: seg.id, kind: 'direct' }); composePage(main, id);
    } catch (er) { toast('Couldn’t pick that list: ' + er.message, 'error'); } };
  $('#subj', main).oninput = ev => { save({ subject: ev.target.value }); draw(); };
  $('#body', main).oninput = ev => { save({ body: ev.target.value }); draw(); };
  $('#del', main).onclick = async () => { if (!await confirmBox('Delete this draft?', 'Delete', true)) return; clearTimeout(t); try { await remove('emails', id); location.hash = '#/email'; } catch (er) { toast('Couldn’t delete: ' + er.message, 'error'); } };
  const ready = () => { if (!e.subject.trim()) { toast('Add a subject first.', 'error'); return false; } if (!e.body.trim()) { toast('Write the message first.', 'error'); return false; } return true; };
  $('#test', main).onclick = async ev => { if (!ready()) return; const b = ev.currentTarget; busy(b, true, 'Sending');
    try { await flush(); const r = await api('send', { id, test: true }); toast('Test sent to ' + r.to + '.'); } catch (er) { toast(er.message, 'error'); } busy(b, false); };
  $('#send', main).onclick = async ev => { if (!ready()) return; const a = audience(e), b = ev.currentTarget;
    if (e.kind === 'marketing' && !isAdmin()) return toast('Only admins can send marketing email. Ask one to send it, or send a test.', 'error');
    if (!await confirmBox(`Send “${e.subject.trim()}” to ${a.to.length} ${a.to.length === 1 ? 'person' : 'people'} now? This can’t be undone.`, 'Send')) return;
    busy(b, true, 'Sending');
    try { e.to_ids = a.to.map(p => p.id); await flush(); const r = await api('send', { id });
      const { data } = await sb.from('ftc_emails').select('*').eq('id', id).single(); if (data) Object.assign(e, data);
      for (const pid of r.sent_ids || []) { const p = person(pid); if (p) p.last_contact_at = new Date().toISOString(); }
      toast(`Sent to ${r.sent}.` + (r.skipped ? ` ${r.skipped} skipped.` : '')); composePage(main, id); }
    catch (er) { toast(er.message, 'error'); busy(b, false); }
  };
}

function sentPage(main, e) {
  const st = e.stats || {}, sender = state.settings.sender || {};
  main.innerHTML = `
    <a class="backlink" href="#/email"><i data-ic="back"></i>Email</a>
    <div class="head"><div><h1>${esc(e.subject || 'No subject')}</h1><p>${e.kind === 'marketing' ? 'Marketing' : 'Direct'} · ${esc(toLabel(e))} · ${e.status === 'sending' ? 'Sending now' : 'Sent ' + esc(M.when(e.sent_at))}</p></div>
      <button class="btn" id="copy">Use as a new draft</button></div>
    <div class="two-col even">
      <div class="panel"><h3>Result</h3><div class="stack"><div><span class="chip green">Sent to ${st.sent || 0}</span>${st.skipped ? ` <span class="chip grey">${st.skipped} skipped</span>` : ''}${st.failed ? ` <span class="chip red">${st.failed} failed</span>` : ''}</div>
        ${st.error ? `<p class="small" style="color:var(--red)">${esc(st.error)}</p>` : ''}
        <p class="small muted">Each person who got it has it on their timeline. Opens and clicks aren’t tracked.</p></div></div>
      <div class="panel"><h3>What was sent</h3><div class="preview">${M.bodyHtml(e.body, null)}${e.kind === 'marketing' ? `<div class="foot">${esc(sender.address || '')}<br><u>Unsubscribe</u></div>` : ''}</div></div>
    </div>`;
  $('#copy', main).onclick = async () => { try { const n = await create('emails', { kind: e.kind, subject: e.subject, body: e.body, segment_id: e.segment_id, to_ids: e.segment_id ? [] : e.to_ids }); location.hash = '#/email/' + n.id; } catch (er) { toast('Couldn’t copy it: ' + er.message, 'error'); } };
}
