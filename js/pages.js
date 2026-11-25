// The smaller pages: organizations, segments (saved filters), messages, and settings.
import { state, org, segment, create, update, remove, recent, timelineOf, person, saveSetting, isAdmin, api } from './db.js';
import { $, $$, esc, toast, confirmBox, promptBox } from './ui.js';
import { tagBox, newPerson } from './people.js';
import * as M from './model.js';

const orgOf = id => org(id);

/* ---------------- organizations ---------------- */
const kindName = k => (M.ORG_KINDS.find(x => x[0] === k) || [])[1] || k;
export function orgsPage(main) {
  const count = id => state.people.filter(p => p.org_id === id).length;
  main.innerHTML = `
    <div class="head"><div><h1>Organizations</h1><p>Boutiques, manufacturers, consultancies and other businesses. Open one to see its details, its people and what has happened with them.</p></div>
      <button class="btn primary" id="add"><i data-ic="make"></i>Add an organization</button></div>
    ${state.orgs.length ? `<table class="table ptable"><thead><tr><th>Name</th><th>Kind</th><th class="opt">City</th><th class="opt">Website</th><th>People</th></tr></thead><tbody>${[...state.orgs].sort((a, b) => a.name.localeCompare(b.name)).map(o => `<tr data-id="${o.id}"><td class="name">${esc(o.name || 'No name')}</td><td><span class="chip type">${esc(kindName(o.kind))}</span></td><td class="opt">${esc(o.city)}</td><td class="opt">${esc(o.website)}</td><td>${count(o.id)}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No organizations yet.</div>`}`;
  $('#add', main).onclick = async () => { const name = await promptBox('Name of the organization', { yes: 'Add' }); if (!name || !name.trim()) return;
    try { const o = await create('orgs', { name: name.trim() }); location.hash = '#/o/' + o.id; } catch (er) { toast('Couldn’t add it: ' + er.message, 'error'); } };
  const t = $('tbody', main); if (t) t.onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/o/' + tr.dataset.id; };
}

/* one organization: its details, the people there, and everything that has happened with any of them */
export async function orgPage(main, id) {
  const o = org(id);
  if (!o) { main.innerHTML = `<a class="backlink" href="#/orgs"><i data-ic="back"></i>Organizations</a><div class="empty">This organization isn’t in the registry any more.</div>`; return; }
  const here = () => state.people.filter(p => p.org_id === id).sort((a, b) => M.fullName(a).localeCompare(M.fullName(b)));
  const site = v => /^https?:\/\//i.test(v) ? v : 'https://' + v;
  main.innerHTML = `
    <a class="backlink" href="#/orgs"><i data-ic="back"></i>Organizations</a>
    <div class="head"><div class="grow"><h1 id="nm"></h1><p id="sub"></p></div>
      <div class="row"><button class="btn" id="mail">Email the people here</button><button class="btn danger" id="del">Delete</button></div></div>
    <div class="two-col even">
      <div>
        <div class="panel"><h3>Details</h3><div class="stack">
          <label class="field"><span>Name</span><input class="input" data-f="name" value="${esc(o.name)}"></label>
          <div class="grid2"><label class="field"><span>Kind</span><select class="input" data-f="kind">${M.ORG_KINDS.map(k => `<option value="${k[0]}" ${o.kind === k[0] ? 'selected' : ''}>${k[1]}</option>`).join('')}</select></label>
            <label class="field"><span>City</span><input class="input" data-f="city" value="${esc(o.city)}"></label></div>
          <label class="field"><span>Address</span><textarea class="input" data-f="address" rows="2" style="min-height:0">${esc(o.address || '')}</textarea></label>
          <label class="field"><span>Website</span><input class="input" data-f="website" value="${esc(o.website)}"></label>
          <div id="open"></div>
          <label class="field"><span>Notes</span><textarea class="input" data-f="notes" rows="14">${esc(o.notes)}</textarea></label>
        </div></div>
      </div>
      <div>
        <div class="panel"><div class="row between"><h3>People here</h3><button class="btn small" id="np">Add a person here</button></div><div id="who"></div></div>
        <div class="panel"><h3>What has happened</h3><div class="tl" id="tl"><p class="muted small">Loading</p></div></div>
      </div>
    </div>`;
  const head = () => { const q = org(id), n = here().length; $('#nm', main).textContent = q.name || 'No name';
    $('#sub', main).textContent = [kindName(q.kind), q.city, n + (n === 1 ? ' person' : ' people')].filter(Boolean).join(' · ');
    $('#open', main).innerHTML = q.website ? `<a class="link small" href="${esc(site(q.website))}" target="_blank" rel="noopener">Open the website</a>` : ''; };
  const who = () => { const l = here();
    $('#who', main).innerHTML = l.length ? `<table class="table ptable"><tbody>${l.map(p => `<tr data-id="${p.id}"><td class="name">${esc(M.fullName(p))}${p.title ? `<div class="detail">${esc(p.title)}</div>` : ''}</td><td>${esc((p.emails || [])[0] || M.fmtPhone((p.phones || [])[0]))}</td><td class="when">${esc(M.ago(p.last_contact_at))}</td></tr>`).join('')}</tbody></table>` : `<p class="muted small">Nobody is linked to this organization yet. Add a person here, or pick it as the organization on a person’s page.</p>`; };
  head(); who();
  $$('[data-f]', main).forEach(inp => inp.onchange = async () => { const v = inp.value.trim();
    if (inp.dataset.f === 'name' && !v) { inp.value = org(id).name; return toast('Give it a name.', 'error'); }
    try { await update('orgs', id, { [inp.dataset.f]: v }); head(); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } });
  $('#who', main).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/p/' + tr.dataset.id; };
  $('#np', main).onclick = () => newPerson(id);
  $('#mail', main).onclick = async () => { const ids = here().filter(p => (p.emails || []).length).map(p => p.id);
    if (!ids.length) return toast('Nobody here has an email address yet.', 'error');
    try { const em = await create('emails', { kind: 'direct', to_ids: ids }); location.hash = '#/email/' + em.id; } catch (er) { toast('Couldn’t start the email: ' + er.message, 'error'); } };
  $('#del', main).onclick = async () => { if (!await confirmBox(`Delete ${org(id).name}? Its people stay in the registry, without an organization.`, 'Delete', true)) return;
    try { await remove('orgs', id); for (const p of state.people) if (p.org_id === id) p.org_id = null; location.hash = '#/orgs'; } catch (er) { toast('Couldn’t delete: ' + er.message, 'error'); } };

  const tl = $('#tl', main), ids = here().map(p => p.id);
  if (!ids.length) { tl.innerHTML = `<p class="muted small">Notes, calls, meetings, emails and orders of the people here will show up in this list.</p>`; return; }
  let rows; try { rows = await timelineOf(ids); } catch (er) { if (tl.isConnected) tl.innerHTML = `<p class="muted small">Couldn’t load: ${esc(er.message)}</p>`; return; }
  if (!tl.isConnected) return;
  tl.innerHTML = rows.length ? rows.map(r => { const p = person(r.person_id);
    return `<div class="tl-item"><div class="tl-when">${esc(M.when(r.at))}</div><div><span class="chip ${/_in$/.test(r.kind) ? 'blue' : /_out$/.test(r.kind) ? 'green' : r.kind === 'note' ? 'grey' : 'amber'}">${esc(M.KINDS[r.kind] || r.kind)}</span> <a href="#/p/${r.person_id}">${esc(p ? M.fullName(p) : 'Someone')}</a> <strong>${esc(r.summary)}</strong>${r.body ? `<div class="tl-body">${esc(r.body)}</div>` : ''}</div><span></span></div>`; }).join('')
    : `<p class="muted small">Nothing yet. Add notes, calls and meetings from a person’s page.</p>`;
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
  const r = { ...M.emptyRules(), ...(s.rules || {}) }; r.event = { id: '', as: '', status: '', ...(r.event || {}) };
  const tags = M.allTags(state.people), sources = [...new Set(state.people.map(p => p.source))].sort();
  let t = 0; const save = patch => { clearTimeout(t); t = setTimeout(async () => { try { await update('segments', id, patch || { rules: r }); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } }, 350); };
  main.innerHTML = `
    <a class="backlink" href="#/segments"><i data-ic="back"></i>Segments</a>
    <div class="head"><input class="title-input" id="name" value="${esc(s.name)}" aria-label="Segment name">
      <div class="row"><button class="btn" id="mail">Email this segment</button><button class="btn danger" id="del">Delete</button></div></div>
    <div class="two-col even">
      <div class="panel"><h3>Who’s in it</h3><div class="stack">
        <div class="field"><span>Was at an event</span><div class="grid3"><select class="input" id="evId"><option value="">Any or none</option>${state.events.map(e => `<option value="${e.id}" ${e.id === r.event.id ? 'selected' : ''}>${esc(e.name)}${e.event_date ? ' · ' + esc(e.event_date) : ''}</option>`).join('')}</select>
          <select class="input" id="evAs"><option value="">Guests and team</option><option value="guest" ${r.event.as === 'guest' ? 'selected' : ''}>Guests</option><option value="team" ${r.event.as === 'team' ? 'selected' : ''}>Team</option></select>
          <select class="input" id="evSt"><option value="">Any status</option><option value="came" ${r.event.status === 'came' ? 'selected' : ''}>Came</option><option value="booked" ${r.event.status === 'booked' ? 'selected' : ''}>Booked</option><option value="noshow" ${r.event.status === 'noshow' ? 'selected' : ''}>No-show</option><option value="cancel" ${r.event.status === 'cancel' ? 'selected' : ''}>Cancelled</option></select></div>
          <span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:400">Guest lists and teams come from FT Events and stay up to date. Status applies to guests.</span></div>
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
  $('#evId', main).onchange = e => { r.event.id = e.target.value; changed(); }; $('#evAs', main).onchange = e => { r.event.as = e.target.value; changed(); }; $('#evSt', main).onchange = e => { r.event.status = e.target.value; changed(); };
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
      ${admin ? '<div class="row end"><button class="btn primary" id="go">Save</button></div>' : ''}</div></div>
    <div class="panel"><div class="row between"><h3>Shopify</h3>${admin ? '<button class="btn small" id="sync" hidden>Sync now</button>' : ''}</div>
      <p class="muted" id="shop">Checking Shopify</p>
      <p class="small muted">Customers become people here and their orders land on their timelines, every 15 minutes. Someone who unsubscribes here is unsubscribed in Shopify too; nothing else is changed there.</p></div>`;
  if (admin) $('#go', main).onclick = async () => { const v = { from_name: $('#fn', main).value.trim(), from_email: M.normEmail($('#fe', main).value), reply_to: M.normEmail($('#rt', main).value), address: $('#ad', main).value.trim() };
    if (v.from_email && !M.okEmail(v.from_email)) return toast('The from address doesn’t look right.', 'error');
    try { await saveSetting('sender', v); toast('Saved.'); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } };
  try { const st = await api('send'); const n = $('#status', main); if (!n) return;
    n.innerHTML = st.ready ? 'The email service (Resend) is connected.' + (s.from_email ? '' : ' Add a from address below to start sending.') : 'The email service isn’t connected yet. Add a Resend API key to the ft-comms project in Vercel, named <strong>RESEND_API_KEY</strong>, and verify the sending domain in Resend.'; }
  catch (er) { const n = $('#status', main); if (n) n.textContent = 'Couldn’t reach the email service check: ' + er.message; }
  const shop = async () => { const n = $('#shop', main); if (!n) return;
    try { const st = await api('shopify'), r = st.last_result;
      n.textContent = !st.ready ? `Not connected yet. Add FT_SHOPIFY_CLIENT_ID and FT_SHOPIFY_CLIENT_SECRET in Vercel and link them to the ft-comms project (an app installed on ${st.shop}).`
        : st.last_error ? `Connected to ${st.shop}, but the last run stopped: ${st.last_error}`
        : st.last_run ? `Connected to ${st.shop}. Last ran ${M.when(st.last_run)}: ${r ? `${r.customers} customers and ${r.orders} orders read, ${r.new_people} new people.` : ''}` : `Connected to ${st.shop}. It hasn’t run yet.`;
      const b = $('#sync', main); if (b) b.hidden = !st.ready; } catch (er) { n.textContent = 'Couldn’t check Shopify: ' + er.message; } };
  shop();
  const sb_ = $('#sync', main); if (sb_) sb_.onclick = async () => { sb_.disabled = true; sb_.textContent = 'Syncing';
    try { const r = await api('shopify', {}); toast(r.ready === false ? 'Shopify isn’t connected yet.' : `Read ${r.customers} customers and ${r.orders} orders.`); } catch (er) { toast(er.message, 'error'); }
    sb_.disabled = false; sb_.textContent = 'Sync now'; shop(); };
}
