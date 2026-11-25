// People: the list (search, filter by tag or saved segment, pick people to email or tag) and one person's page
// (their details, how to reach them, what they agreed to, and everything that has happened with them).
import { state, person, org, segment, create, update, remove, timeline, addEntry, removeEntry } from './db.js';
import { $, $$, esc, toast, modal, confirmBox, promptBox } from './ui.js';
import * as M from './model.js';

const orgOf = id => org(id);
// what the list was last filtered by (kept on this computer)
let view = { q: '', tag: '', seg: '' };
try { Object.assign(view, JSON.parse(localStorage.getItem('ftc.view') || '{}')); } catch (e) {}
const remember = () => { try { localStorage.setItem('ftc.view', JSON.stringify(view)); } catch (e) {} };
const picked = new Set();

/* a box of tags: chips with ×, type and press Enter (or pick a suggestion) to add */
export function tagBox(el, values, suggestions, onChange, placeholder = 'Add a tag') {
  const id = 'dl' + Math.random().toString(36).slice(2, 8);
  const draw = () => {
    el.innerHTML = `<div class="chips chipbox">${values.map((t, i) => `<span class="chip grey">${esc(t)}<button data-i="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}<input list="${id}" placeholder="${esc(placeholder)}"><datalist id="${id}">${suggestions.filter(s => !values.includes(s)).map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>`;
    const inp = $('input', el);
    const add = () => { const v = inp.value.trim().toLowerCase(); if (!v) return; inp.value = ''; if (!values.includes(v)) { values.push(v); onChange(values); } draw(); $('input', el).focus(); };
    inp.onkeydown = e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } if (e.key === 'Backspace' && !inp.value && values.length) { values.pop(); onChange(values); draw(); $('input', el).focus(); } };
    inp.onchange = add;
    $$('[data-i]', el).forEach(b => b.onclick = () => { values.splice(+b.dataset.i, 1); onChange(values); draw(); });
  };
  draw();
}

/* ---------------- the list ---------------- */
function shown() {
  const q = view.q.trim().toLowerCase(), seg = view.seg && segment(view.seg);
  return state.people.filter(p => {
    if (view.tag && !(p.tags || []).includes(view.tag)) return false;
    if (seg && !M.matches(p, seg.rules, orgOf)) return false;
    if (!q) return true;
    const o = org(p.org_id);
    return [M.fullName(p), p.title, p.city, o && o.name, ...(p.emails || []), ...(p.phones || []), ...(p.tags || [])].join(' ').toLowerCase().includes(q) || (/\d{4,}/.test(q.replace(/\D/g, '')) && (p.phones || []).some(n => n.includes(q.replace(/\D/g, ''))));
  }).sort((a, b) => M.fullName(a).localeCompare(M.fullName(b)));
}

export function peoplePage(main) {
  const tags = M.allTags(state.people);
  if (view.tag && !tags.includes(view.tag)) view.tag = ''; if (view.seg && !segment(view.seg)) view.seg = '';
  main.innerHTML = `
    <div class="head"><div><h1>People</h1><p>Everyone Foreign Tongues knows: customers, guests, boutiques, buyers, makers and consultants.</p></div>
      <div class="row"><a class="btn" href="#/import">Import a list</a><button class="btn primary" id="add"><i data-ic="make"></i>Add a person</button></div></div>
    <div class="toolbar">
      <input class="input" id="q" type="search" placeholder="Search name, email, phone, organization" value="${esc(view.q)}">
      <select class="input" id="tag"><option value="">All tags</option>${tags.map(t => `<option ${t === view.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select class="input" id="seg"><option value="">No segment</option>${state.segments.map(s => `<option value="${s.id}" ${s.id === view.seg ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <span class="count grow" id="count"></span>
      <span class="row" id="bulk" hidden><button class="btn small" id="bTag">Add a tag</button><button class="btn small" id="bMail">Email them</button><button class="btn small ghost" id="bNone">Clear</button></span>
    </div>
    <div id="list"></div>`;
  const draw = () => {
    const rows = shown();
    for (const id of [...picked]) if (!rows.some(p => p.id === id)) picked.delete(id);
    $('#count', main).textContent = picked.size ? `${picked.size} selected of ${rows.length}` : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`;
    $('#bulk', main).hidden = !picked.size;
    $('#list', main).innerHTML = !state.people.length
      ? `<div class="empty">Nobody here yet. Add a person, or <a href="#/import">import a list</a> from a spreadsheet.</div>`
      : !rows.length ? `<div class="empty">Nobody matches. Change the search or the filters.</div>`
      : `<table class="table ptable"><thead><tr><th class="sel"><input type="checkbox" id="allBox" aria-label="Select everyone shown" ${rows.every(p => picked.has(p.id)) ? 'checked' : ''}></th><th>Name</th><th class="opt">Organization</th><th class="opt">Tags</th><th>Email</th><th class="opt">Phone</th><th class="opt">Last contact</th></tr></thead><tbody>${rows.slice(0, 500).map(p => { const o = org(p.org_id);
          return `<tr data-id="${p.id}"><td class="sel"><input type="checkbox" data-pick ${picked.has(p.id) ? 'checked' : ''} aria-label="Select"></td><td class="name">${esc(M.fullName(p))}</td><td class="opt">${esc(o ? o.name : '')}${p.title ? `<div class="detail">${esc(p.title)}</div>` : ''}</td><td class="opt">${(p.tags || []).map(t => `<span class="chip grey">${esc(t)}</span>`).join('')}</td><td>${esc((p.emails || [])[0] || '')}${p.unsubscribed_at ? ' <span class="chip red">Unsubscribed</span>' : p.email_ok ? ' <span class="chip green">Marketing OK</span>' : ''}</td><td class="opt">${esc(M.fmtPhone((p.phones || [])[0]))}</td><td class="opt when">${esc(M.ago(p.last_contact_at))}</td></tr>`; }).join('')}</tbody></table>${rows.length > 500 ? `<p class="muted small">Showing the first 500. Search or filter to narrow it down.</p>` : ''}`;
    const allBox = $('#allBox', main); if (allBox) allBox.onchange = () => { for (const p of rows) allBox.checked ? picked.add(p.id) : picked.delete(p.id); draw(); };
  };
  draw();
  $('#q', main).oninput = e => { view.q = e.target.value; remember(); draw(); };
  $('#tag', main).onchange = e => { view.tag = e.target.value; remember(); draw(); };
  $('#seg', main).onchange = e => { view.seg = e.target.value; remember(); draw(); };
  $('#list', main).onclick = e => { const box = e.target.closest('[data-pick]'), tr = e.target.closest('tr[data-id]'); if (!tr) return;
    if (box || e.target.closest('td.sel')) { const on = box ? box.checked : !picked.has(tr.dataset.id); on ? picked.add(tr.dataset.id) : picked.delete(tr.dataset.id); draw(); return; }
    location.hash = '#/p/' + tr.dataset.id; };
  $('#bNone', main).onclick = () => { picked.clear(); draw(); };
  $('#bTag', main).onclick = async () => {
    const m = modal(`<h3>Add a tag to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}</h3><div id="tb"></div><div class="row end" style="margin-top:16px"><button class="btn primary" id="go">Add</button></div>`);
    const add = []; tagBox($('#tb', m.el), add, tags, () => {});
    $('#go', m.el).onclick = async () => { if (!add.length) return m.close();
      try { for (const id of picked) { const p = person(id); await update('people', id, { tags: [...new Set([...(p.tags || []), ...add])] }); } toast('Tagged.'); } catch (er) { toast('Couldn’t tag everyone: ' + er.message, 'error'); }
      m.close(); peoplePage(main); };
  };
  $('#bMail', main).onclick = async () => {
    try { const em = await create('emails', { kind: 'direct', to_ids: [...picked] }); picked.clear(); location.hash = '#/email/' + em.id; } catch (er) { toast('Couldn’t start the email: ' + er.message, 'error'); }
  };
  $('#add', main).onclick = () => newPerson();
}

export function newPerson(orgId) {
  const m = modal(`<h3>Add a person</h3><div class="stack">
    <div class="grid2"><label class="field"><span>First name</span><input class="input" id="f"></label><label class="field"><span>Last name</span><input class="input" id="l"></label></div>
    <label class="field"><span>Email</span><input class="input" id="e" type="email"></label>
    <label class="field"><span>Phone</span><input class="input" id="ph" type="tel"></label>
    <div class="row end"><button class="btn primary" id="go">Add</button></div></div>`);
  setTimeout(() => $('#f', m.el).focus(), 30);
  const go = async () => {
    const email = M.normEmail($('#e', m.el).value), phone = M.normPhone($('#ph', m.el).value), first = $('#f', m.el).value.trim(), last = $('#l', m.el).value.trim();
    if (!first && !last && !email && !phone) return toast('Enter a name, an email or a phone number.', 'error');
    if (email && !M.okEmail(email)) return toast('That email doesn’t look right.', 'error');
    const dup = state.people.find(p => (email && (p.emails || []).includes(email)) || (phone && (p.phones || []).includes(phone)));
    if (dup) { m.close(); toast(`${M.fullName(dup)} already has that ${email && (dup.emails || []).includes(email) ? 'email' : 'phone number'}.`); location.hash = '#/p/' + dup.id; return; }
    try { const p = await create('people', { first_name: first, last_name: last, emails: email ? [email] : [], phones: phone ? [phone] : [], org_id: orgId || null }); m.close(); location.hash = '#/p/' + p.id; }
    catch (er) { toast('Couldn’t add them: ' + er.message, 'error'); }
  };
  $('#go', m.el).onclick = go; m.el.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); };
}

/* what came with a person from another system (kept as it was exported), as a small panel */
function came(p) {
  const s = p.ext && p.ext.squarespace; if (!s) return '';
  const day = v => v ? new Date(v).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const rows = [['Added there', day(s.created_on)], ['Email subscriber since', day(s.email_subscriber_since)], ['How they subscribed', s.email_subscriber_source], ['Mailing lists', (s.mailing_lists || []).join(', ')],
    ['Orders', s.orders ? `${s.orders}, $${Number(s.total).toFixed(2)} in total` : ''], ['Had a store account', s.has_account ? 'Yes' : '']].filter(r => r[1]);
  return rows.length ? `<div class="panel"><h3>From Squarespace</h3><table class="table"><tbody>${rows.map(r => `<tr><td class="when">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></div>` : '';
}

/* ---------------- one person ---------------- */
export async function personPage(main, id) {
  const p = person(id);
  if (!p) { main.innerHTML = `<a class="backlink" href="#/"><i data-ic="back"></i>People</a><div class="empty">This person isn’t in the registry any more.</div>`; return; }
  const save = async patch => { try { await update('people', id, patch); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } };
  main.innerHTML = `
    <a class="backlink" href="#/"><i data-ic="back"></i>People</a>
    <div class="head"><div class="grow"><h1 id="nm">${esc(M.fullName(p))}</h1><p id="sub"></p></div>
      <div class="row"><button class="btn" id="mail">Write an email</button><button class="btn danger" id="del">Delete</button></div></div>
    <div class="two-col">
      <div>
        <div class="panel"><h3>Details</h3><div class="stack">
          <div class="grid2"><label class="field"><span>First name</span><input class="input" data-f="first_name" value="${esc(p.first_name)}"></label><label class="field"><span>Last name</span><input class="input" data-f="last_name" value="${esc(p.last_name)}"></label></div>
          <div class="grid2"><label class="field"><span>Organization</span><select class="input" id="org"><option value="">None</option>${state.orgs.map(o => `<option value="${o.id}" ${o.id === p.org_id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}<option value="+">New organization…</option></select><a class="link small" id="orgLink" hidden>Open its page</a></label>
            <label class="field"><span>Job title</span><input class="input" data-f="title" value="${esc(p.title)}"></label></div>
          <label class="field"><span>Emails</span><input class="input" id="emails" value="${esc((p.emails || []).join(', '))}" placeholder="Separate several with commas"></label>
          <label class="field"><span>Phone numbers</span><input class="input" id="phones" value="${esc((p.phones || []).map(M.fmtPhone).join(', '))}" placeholder="Separate several with commas"></label>
          <label class="field"><span>City</span><input class="input" data-f="city" value="${esc(p.city)}"></label>
          <label class="field"><span>Address</span><textarea class="input" data-f="address" rows="3" style="min-height:0">${esc(p.address || '')}</textarea></label>
          <div class="field"><span>Tags</span><div id="tags"></div></div>
          <label class="field"><span>Notes</span><textarea class="input" data-f="notes" rows="3">${esc(p.notes)}</textarea></label>
        </div></div>
        <div class="panel"><h3>Marketing</h3><p class="small muted">Only tick these when the person has agreed. Marketing email is sent only to people with the first box ticked.</p>
          <div class="stack"><label class="check"><input type="checkbox" id="eok" ${p.email_ok && !p.unsubscribed_at ? 'checked' : ''}>Agreed to marketing email</label>
          <label class="check"><input type="checkbox" id="sok" ${p.sms_ok ? 'checked' : ''}>Agreed to marketing texts</label>
          <span class="small muted" id="cnote"></span></div></div>
        ${came(p)}
      </div>
      <div class="panel"><div class="row between"><h3>Timeline</h3><span class="row"><button class="btn small" data-add="note">Add a note</button><button class="btn small" data-add="call">Log a call</button><button class="btn small" data-add="meeting">Log a meeting</button><button class="btn small" data-add="text_out">Log a text</button></span></div><div class="tl" id="tl"><p class="muted small">Loading</p></div></div>
    </div>`;
  const head = () => { const q = person(id), o = org(q.org_id); $('#nm', main).textContent = M.fullName(q); const ol = $('#orgLink', main); ol.hidden = !o; if (o) ol.href = '#/o/' + o.id;
    $('#sub', main).textContent = [q.title, o && o.name, q.city, 'Last contact: ' + M.ago(q.last_contact_at).toLowerCase(), q.source !== 'manual' ? 'Source: ' + q.source : ''].filter(Boolean).join(' · ');
    $('#cnote', main).textContent = q.unsubscribed_at ? `Unsubscribed on ${new Date(q.unsubscribed_at).toLocaleDateString()}.` : q.email_ok && q.email_ok_at ? `Agreed to email on ${new Date(q.email_ok_at).toLocaleDateString()}.` : ''; };
  head();
  $$('[data-f]', main).forEach(inp => inp.onchange = async () => { await save({ [inp.dataset.f]: inp.value.trim() }); head(); });
  $('#emails', main).onchange = async e => { const l = M.list(e.target.value, M.normEmail), bad = l.find(x => !M.okEmail(x));
    if (bad) return toast(`“${bad}” doesn’t look like an email address.`, 'error');
    const dup = state.people.find(x => x.id !== id && l.some(a => (x.emails || []).includes(a))); if (dup) toast(`${M.fullName(dup)} has the same email. They may be the same person.`);
    await save({ emails: l }); head(); };
  $('#phones', main).onchange = async e => { const l = M.list(e.target.value, M.normPhone); await save({ phones: l }); e.target.value = l.map(M.fmtPhone).join(', '); head(); };
  $('#org', main).onchange = async e => { let v = e.target.value;
    if (v === '+') { const name = await promptBox('Name of the organization', { yes: 'Add' }); if (!name || !name.trim()) { e.target.value = p.org_id || ''; return; }
      try { const o = await create('orgs', { name: name.trim() }); v = o.id; e.target.insertBefore(new Option(o.name, o.id), e.target.lastElementChild); e.target.value = v; } catch (er) { return toast('Couldn’t add it: ' + er.message, 'error'); } }
    await save({ org_id: v || null }); head(); };
  tagBox($('#tags', main), [...(p.tags || [])], M.allTags(state.people), v => save({ tags: [...v] }));
  $('#eok', main).onchange = async e => { await save(e.target.checked ? { email_ok: true, email_ok_at: new Date().toISOString(), unsubscribed_at: null } : { email_ok: false }); head(); };
  $('#sok', main).onchange = async e => { await save({ sms_ok: e.target.checked, sms_ok_at: e.target.checked ? new Date().toISOString() : null }); };
  $('#mail', main).onclick = async () => { if (!(person(id).emails || []).length) return toast('Add an email address first.', 'error');
    try { const em = await create('emails', { kind: 'direct', to_ids: [id] }); location.hash = '#/email/' + em.id; } catch (er) { toast('Couldn’t start the email: ' + er.message, 'error'); } };
  $('#del', main).onclick = async () => { if (!await confirmBox(`Delete ${M.fullName(person(id))} and their whole timeline? This can’t be undone.`, 'Delete', true)) return;
    try { await remove('people', id); location.hash = '#/'; } catch (er) { toast('Couldn’t delete: ' + er.message, 'error'); } };

  const tl = $('#tl', main);
  const drawTl = async () => {
    let rows; try { rows = await timeline(id); } catch (er) { tl.innerHTML = `<p class="muted small">Couldn’t load the timeline: ${esc(er.message)}</p>`; return; }
    if (!tl.isConnected) return;
    tl.innerHTML = rows.length ? rows.map(r => `<div class="tl-item"><div class="tl-when">${esc(M.when(r.at))}</div><div><span class="chip ${/_in$/.test(r.kind) ? 'blue' : /_out$/.test(r.kind) ? 'green' : r.kind === 'note' ? 'grey' : 'amber'}">${esc(M.KINDS[r.kind] || r.kind)}</span> <strong>${esc(r.summary)}</strong>${r.body ? `<div class="tl-body">${esc(r.body)}</div>` : ''}</div><button class="x" data-rm="${r.id}" aria-label="Remove this entry">×</button></div>`).join('') : `<p class="muted small">Nothing yet. Emails sent from FT Comms show up here by themselves; add notes, calls and texts with the buttons above.</p>`;
  };
  drawTl();
  tl.onclick = async e => { const b = e.target.closest('[data-rm]'); if (!b) return; if (!await confirmBox('Remove this entry from the timeline?', 'Remove', true)) return;
    try { await removeEntry(+b.dataset.rm); drawTl(); } catch (er) { toast('Couldn’t remove it: ' + er.message, 'error'); } };
  $$('[data-add]', main).forEach(b => b.onclick = () => {
    const kind = b.dataset.add, label = { note: 'Add a note', call: 'Log a call', meeting: 'Log a meeting', text_out: 'Log a text' }[kind];
    const m = modal(`<h3>${label}</h3><div class="stack">${kind === 'text_out' ? `<div class="seg" id="dir"><button class="on" data-k="text_out">I sent it</button><button data-k="text_in">They sent it</button></div>` : ''}
      <label class="field"><span>${kind === 'note' ? 'Note' : 'What was said'}</span><textarea class="input" id="body" rows="5"></textarea></label><div class="row end"><button class="btn primary" id="go">Save</button></div></div>`);
    let k = kind; setTimeout(() => $('#body', m.el).focus(), 30);
    $$('#dir button', m.el).forEach(x => x.onclick = () => { k = x.dataset.k; $$('#dir button', m.el).forEach(y => y.classList.toggle('on', y === x)); });
    $('#go', m.el).onclick = async () => { const body = $('#body', m.el).value.trim(); if (!body) return m.close();
      try { await addEntry({ person_id: id, kind: k, summary: body.split('\n')[0].slice(0, 90), body: body.length > 90 || body.includes('\n') ? body : '' }); m.close(); drawTl(); head(); } catch (er) { toast('Couldn’t save: ' + er.message, 'error'); } };
  });
}
