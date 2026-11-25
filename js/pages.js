// The smaller pages: organizations, segments (saved filters), messages, and settings.
import { state, org, segment, create, update, remove, recent, person, saveSetting, isAdmin, api } from './db.js';
import { $, $$, esc, toast, modal, confirmBox } from './ui.js';
import { tagBox, newPerson } from './people.js';
import * as M from './model.js';

const orgOf = id => org(id);

/* ---------------- organizations ---------------- */
export function orgsPage(main) {
  const count = id => state.people.filter(p => p.org_id === id).length;
  main.innerHTML = `
    <div class="head"><div><h1>Organizations</h1><p>Boutiques, manufacturers, consultancies and other businesses. People are linked to them from their own page.</p></div>
      <button class="btn primary" id="add"><i data-ic="make"></i>Add an organization</button></div>
    ${state.orgs.length ? `<table class="table ptable"><thead><tr><th>Name</th><th>Kind</th><th class="opt">City</th><th class="opt">Website</th><th>People</th></tr></thead><tbody>${[...state.orgs].sort((a, b) => a.name.localeCompare(b.name)).map(o => `<tr data-id="${o.id}"><td class="name">${esc(o.name || 'No name')}</td><td><span class="chip type">${esc((M.ORG_KINDS.find(k => k[0] === o.kind) || [])[1] || o.kind)}</span></td><td class="opt">${esc(o.city)}</td><td class="opt">${esc(o.website)}</td><td>${count(o.id)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No organizations yet.</div>`}`;
  $('#add', main).onclick = () => editOrg(main, null);
  const t = $('tbody', main); if (t) t.onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) editOrg(main, org(tr.dataset.id)); };
}
function editOrg(main, o) {
  const people = o ? state.people.filter(p => p.org_id === o.id) : [];
  const m = modal(`<h3>${o ? 'Organization' : 'Add an organization'}</h3><div class="stack">
    <label class="field"><span>Name</span><input class="input" id="n" value="${esc(o ? o.name : '')}"></label>
    <div class="grid2"><label class="field"><span>Kind</span><select class="input" id="k">${M.ORG_KINDS.map(k => `<option value="${k[0]}" ${o && o.kind === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select></label>
      <label class="field"><span>City</span><input class="input" id="c" value="${esc(o ? o.city : '')}"></label></div>
    <label class="field"><span>Website</span><input class="input" id="w" value="${esc(o ? o.website : '')}"></label>
    <label class="field"><span>Notes</span><textarea class="input" id="t" rows="3">${esc(o ? o.notes : '')}</textarea></label>
    ${o ? `<div class="field"><span>People here</span><div>${people.length ? people.map(p => `<a class="chip grey" href="#/p/${p.id}" data-go>${esc(M.fullName(p))}</a>`).join(' ') : '<span class="muted small">Nobody linked yet.</span>'} <button class="link small" id="np">Add a person here</button></div></div>` : ''}
    <div class="row between">${o ? `<button class="btn danger" id="del">Delete</button>` : '<span></span>'}<button class="btn primary" id="go">${o ? 'Save' : 'Add'}</button></div></div>`);
  if (!o) setTimeout(() => $('#n', m.el).focus(), 30);
  $$('[data-go]', m.el).forEach(a => a.onclick = () => m.close());
  if (o) { $('#np', m.el).onclick = () => { m.close(); newPerson(o.id); };
    $('#del', m.el).onclick = async () => { if (!await confirmBox(`Delete ${o.name}? Its people stay in the registry, without an organization.`, 'Delete', true)) return;
      try { await remove('orgs', o.id); for (const p of state.people) if (p.org_id === o.id) p.org_id = null; m.close(); orgsPage(main); } catch (er) { toast('Couldn’t delete: ' + er.message, 'error'); } }; }
  $('#go', m.el).onclick = async () => { const row = { name: $('#n', m.el).value.trim(), kind: $('#k', m.el).value, city: $('#c', m.el).value.trim(), website: $('#w', m.el).value.trim(), notes: $('#t', m.el).value.trim() };
    if (!row.name) return toast('Give it a name.', 'error');
    try { o ? await update('orgs', o.id, row) : await create('orgs', row); m.close(); orgsPage(main); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } };
}

/* ---------------- segments ---------------- */
export function segmentsPage(main) {
  main.innerHTML = `
    <div class="head"><div><h1>Segments</h1><p>Saved filters over the registry. A segment always shows who matches right now, so it stays current as people are added and contacted.</p></div>
      <button class="btn primary" id="add"><i data-ic="make"></i>New segment</button></div>
    ${state.segments.length ? `<div class="cards">${state.segments.map(s => `<a class="card" href="#/segments/${s.id}"><h3>${esc(s.name)}</h3><div class="muted small">${esc(M.describe(s.rules))}</div><div style="margin-top:10px"><span class="chip ink">${state.people.filter(p => M.matches(p, s.rules, orgOf)).length} people</span></div></a>`).join('')}</div>` : `<div class="empty">No segments yet. Try “Buyers with no contact for 6 weeks” or “Event guests who agreed to email”.</div>`}`;
  $('#add', main).onclick = async () => { try { const s = await create('segments', { name: 'New segment', rules: M.emptyRules() }); location.hash = '#/segments/' + s.id; } catch (er) { toast('Couldn’t add it: ' + er.message, 'error'); } };
}
export function segmentPage(main, id) {
  const s = segment(id);
  if (!s) { main.innerHTML = `<a class="backlink" href="#/segments"><i data-ic="back"></i>Segments</a><div class="empty">This segment has been deleted.</div>`; return; }
  const r = { ...M.emptyRules(), ...(s.rules || {}) }, tags = M.allTags(state.people), sources = [...new Set(state.people.map(p => p.source))].sort();
  let t = 0; const save = patch => { clearTimeout(t); t = setTimeout(async () => { try { await update('segments', id, patch || { rules: r }); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } }, 350); };
  main.innerHTML = `
    <a class="backlink" href="#/segments"><i data-ic="back"></i>Segments</a>
    <div class="head"><input class="title-input" id="name" value="${esc(s.name)}" aria-label="Segment name">
      <div class="row"><button class="btn" id="mail">Email this segment</button><button class="btn danger" id="del">Delete</button></div></div>
    <div class="two-col even">
      <div class="panel"><h3>Who’s in it</h3><div class="stack">
        <div class="field"><span>Has any of these tags</span><div id="any"></div></div>
        <div class="field"><span>Has all of these tags</span><div id="all"></div></div>
        <div class="field"><span>Has none of these tags</span><div id="none"></div></div>
        <div class="field"><span>Works at</span><div class="row">${M.ORG_KINDS.map(k => `<label class="check"><input type="checkbox" data-ok="${k[0]}" ${r.orgKinds.includes(k[0]) ? 'checked' : ''}>${k[1]}</label>`).join('')}</div></div>
        <div class="grid2"><label class="field"><span>Can be reached by</span><select class="input" id="reach"><option value="">Anything</option><option value="email" ${r.reach === 'email' ? 'selected' : ''}>Email</option><option value="phone" ${r.reach === 'phone' ? 'selected' : ''}>Phone</option></select></label>
          <label class="field"><span>Agreed to</span><select class="input" id="consent"><option value="">Doesn’t matter</option><option value="email" ${r.consent === 'email' ? 'selected' : ''}>Marketing email</option><option value="sms" ${r.consent === 'sms' ? 'selected' : ''}>Marketing texts</option></select></label></div>
        <div class="grid2"><label class="field"><span>No contact for at least (days)</span><input class="input" id="quiet" type="number" min="0" value="${esc(r.quietDays)}" placeholder="Any"></label>
          <label class="field"><span>Contact within the last (days)</span><input class="input" id="active" type="number" min="0" value="${esc(r.activeDays)}" placeholder="Any"></label></div>
        <label class="field"><span>Came from</span><select class="input" id="source"><option value="">Anywhere</option>${sources.map(x => `<option ${x === r.source ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      </div></div>
      <div class="panel"><div class="row between"><h3>Matches now</h3><span class="chip ink" id="n"></span></div><div id="who"></div></div>
    </div>`;
  const draw = () => { const hit = state.people.filter(p => M.matches(p, r, orgOf)).sort((a, b) => M.fullName(a).localeCompare(M.fullName(b)));
    $('#n', main).textContent = hit.length + (hit.length === 1 ? ' person' : ' people');
    $('#who', main).innerHTML = hit.length ? `<table class="table ptable"><tbody>${hit.slice(0, 200).map(p => `<tr data-id="${p.id}"><td class="name">${esc(M.fullName(p))}</td><td>${esc((p.emails || [])[0] || M.fmtPhone((p.phones || [])[0]))}</td><td class="when">${esc(M.ago(p.last_contact_at))}</td></tr>`).join('')}</tbody></table>${hit.length > 200 ? '<p class="muted small">Showing the first 200.</p>' : ''}` : `<p class="muted small">Nobody matches these rules.</p>`; };
  draw();
  const changed = () => { draw(); save(); };
  for (const k of ['any', 'all', 'none']) tagBox($('#' + k, main), r[k], tags, changed, 'Pick or type a tag');
  $$('[data-ok]', main).forEach(b => b.onchange = () => { r.orgKinds = $$('[data-ok]', main).filter(x => x.checked).map(x => x.dataset.ok); changed(); });
  $('#reach', main).onchange = e => { r.reach = e.target.value; changed(); }; $('#consent', main).onchange = e => { r.consent = e.target.value; changed(); };
  $('#quiet', main).oninput = e => { r.quietDays = e.target.value === '' ? '' : Math.max(0, +e.target.value); changed(); }; $('#active', main).oninput = e => { r.activeDays = e.target.value === '' ? '' : Math.max(0, +e.target.value); changed(); };
  $('#source', main).onchange = e => { r.source = e.target.value; changed(); };
  $('#name', main).onchange = e => save({ name: e.target.value.trim() || 'New segment', rules: r });
  $('#who', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/p/' + tr.dataset.id; };
  $('#del', main).onclick = async () => { if (!await confirmBox(`Delete the segment “${s.name}”? The people in it stay in the registry.`, 'Delete', true)) return;
    clearTimeout(t); try { await remove('segments', id); location.hash = '#/segments'; } catch (er) { toast('Couldn’t delete: ' + er.message, 'error'); } };
  $('#mail', main).onclick = async () => { try { clearTimeout(t); await update('segments', id, { rules: r }); const em = await create('emails', { kind: 'marketing', segment_id: id }); location.hash = '#/email/' + em.id; } catch (er) { toast('Couldn’t start the email: ' + er.message, 'error'); } };
}

/* ---------------- messages ---------------- */
export async function messagesPage(main) {
  main.innerHTML = `
    <div class="head"><div><h1>Messages</h1><p>Texts and iMessages with people in the registry.</p></div></div>
    <div class="notice">Texts aren’t connected yet. They will come in through a small helper on Adette’s laptop, which copies only the conversations with people in this registry. Until then, log a text by hand from a person’s page.</div>
    <div class="panel"><h3>Recent texts</h3><div class="tl" id="tl"><p class="muted small">Loading</p></div></div>`;
  let rows = []; try { rows = await recent(['text_in', 'text_out']); } catch (er) { $('#tl', main).innerHTML = `<p class="muted small">Couldn’t load: ${esc(er.message)}</p>`; return; }
  const tl = $('#tl', main); if (!tl) return;
  tl.innerHTML = rows.length ? rows.map(r => { const p = person(r.person_id); return `<div class="tl-item"><div class="tl-when">${esc(M.when(r.at))}</div><div><a href="#/p/${r.person_id}"><strong>${esc(p ? M.fullName(p) : 'Someone')}</strong></a> <span class="chip ${r.kind === 'text_in' ? 'blue' : 'green'}">${r.kind === 'text_in' ? 'Received' : 'Sent'}</span><div class="tl-body">${esc(r.body || r.summary)}</div></div><span></span></div>`; }).join('') : `<p class="muted small">No texts logged yet.</p>`;
}

/* ---------------- settings ---------------- */
export async function settingsPage(main) {
  const s = state.settings.sender || {}, admin = isAdmin();
  main.innerHTML = `
    <div class="head"><div><h1>Settings</h1><p>Who emails come from, and what goes at the bottom of marketing emails.</p></div></div>
    <div class="notice" id="status">Checking the email service</div>
    <div class="panel"><h3>Sender</h3>${admin ? '' : '<p class="small muted">Only admins can change these.</p>'}<div class="stack">
      <div class="grid2"><label class="field"><span>From name</span><input class="input" id="fn" value="${esc(s.from_name || 'Foreign Tongues')}" ${admin ? '' : 'disabled'}></label>
        <label class="field"><span>From address</span><input class="input" id="fe" type="email" value="${esc(s.from_email || '')}" placeholder="hello@yourdomain.com" ${admin ? '' : 'disabled'}></label></div>
      <label class="field"><span>Replies go to</span><input class="input" id="rt" type="email" value="${esc(s.reply_to || '')}" placeholder="Leave empty to use the from address" ${admin ? '' : 'disabled'}></label>
      <label class="field"><span>Postal address (shown at the bottom of marketing emails; US law requires one)</span><input class="input" id="ad" value="${esc(s.address || '')}" placeholder="Foreign Tongues, street, city, state, ZIP" ${admin ? '' : 'disabled'}></label>
      ${admin ? '<div class="row end"><button class="btn primary" id="go">Save</button></div>' : ''}</div></div>`;
  if (admin) $('#go', main).onclick = async () => { const v = { from_name: $('#fn', main).value.trim(), from_email: M.normEmail($('#fe', main).value), reply_to: M.normEmail($('#rt', main).value), address: $('#ad', main).value.trim() };
    if (v.from_email && !M.okEmail(v.from_email)) return toast('The from address doesn’t look right.', 'error');
    try { await saveSetting('sender', v); toast('Saved.'); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } };
  try { const st = await api('send'); const n = $('#status', main); if (!n) return;
    n.innerHTML = st.ready ? 'The email service (Resend) is connected.' + (s.from_email ? '' : ' Add a from address below to start sending.') : 'The email service isn’t connected yet. Add a Resend API key to the ft-comms project in Vercel, named <strong>RESEND_API_KEY</strong>, and verify the sending domain in Resend.'; }
  catch (er) { const n = $('#status', main); if (n) n.textContent = 'Couldn’t reach the email service check: ' + er.message; }
}
