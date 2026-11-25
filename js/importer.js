// Import: bring a spreadsheet of people in. Choose a CSV file (or paste one), say what each column is, and it adds
// the new people and fills in the ones already here (matched by email, then by phone). Nothing is ever removed.
import { state, create, savePeople } from './db.js';
import { $, $$, esc, toast, busy } from './ui.js';
import { tagBox } from './people.js';
import * as M from './model.js';

export function importPage(main) {
  main.innerHTML = `
    <div class="head"><div><h1>Import</h1><p>Add people from a spreadsheet: a Shopify customer export, an event sign-up sheet, a newsletter list. Save it as CSV first.</p></div></div>
    <div class="panel" id="step1"><h3>1. The file</h3><div class="stack">
      <div class="row"><input type="file" id="file" accept=".csv,.tsv,.txt,text/csv"><span class="muted small">or paste the rows below</span></div>
      <textarea class="input" id="paste" rows="5" placeholder="First name,Last name,Email,Phone&#10;Ines,Moreau,ines@example.com,917 555 0101"></textarea>
      <div class="row end"><button class="btn primary" id="read">Read it</button></div></div></div>
    <div id="rest"></div>`;
  $('#file', main).onchange = async e => { const f = e.target.files[0]; if (f) { $('#paste', main).value = await f.text(); $('#read', main).click(); } };
  $('#read', main).onclick = () => { const rows = M.parseCsv($('#paste', main).value);
    if (rows.length < 2) return toast('That needs a heading row and at least one person.', 'error'); mapStep(main, rows); };
}

function mapStep(main, rows) {
  const head = rows[0], body = rows.slice(1), map = head.map(M.guessField), tags = [], rest = $('#rest', main);
  let source = 'import', consent = false;
  rest.innerHTML = `
    <div class="panel"><h3>2. What each column is</h3><div id="map">${head.map((h, i) => `<div class="maprow"><strong>${esc(h || 'Column ' + (i + 1))}</strong><select class="input" data-i="${i}">${M.FIELDS.map(f => `<option value="${f[0]}" ${f[0] === map[i] ? 'selected' : ''}>${f[1]}</option>`).join('')}</select><span class="muted small">${esc(body.slice(0, 3).map(r => r[i]).filter(Boolean).join(' · ').slice(0, 90))}</span></div>`).join('')}</div></div>
    <div class="panel"><h3>3. For everyone in this file</h3><div class="stack">
      <div class="field"><span>Add these tags</span><div id="tags"></div></div>
      <label class="field"><span>Where the list came from</span><select class="input" id="src" style="max-width:260px"><option value="import">A spreadsheet</option><option value="shopify">Shopify</option><option value="event">An event</option><option value="newsletter">A newsletter list</option></select></label>
      <label class="check"><input type="checkbox" id="ok">Everyone in this file agreed to marketing email</label>
      <p class="small muted">Leave it unticked unless that’s true for the whole file. A column mapped to “Agreed to marketing email” is used per person either way.</p></div></div>
    <div class="panel"><div class="row between"><div><h3>4. Check and import</h3><div class="muted small" id="sum"></div></div><button class="btn primary" id="go">Import</button></div><div id="prev" style="margin-top:12px"></div></div>`;
  let redraw = () => {};
  tagBox($('#tags', rest), tags, M.allTags(state.people), () => redraw());
  // the rows as people, and which are already in the registry
  const build = () => {
    const byEmail = new Map(), byPhone = new Map();
    for (const p of state.people) { for (const e of p.emails || []) byEmail.set(e, p); for (const n of p.phones || []) byPhone.set(n, p); }
    const out = [], seen = new Map(); let blank = 0, bad = 0;
    for (const r of body) {
      const v = {}; map.forEach((f, i) => { if (f && String(r[i] || '').trim()) v[f] = (v[f] ? v[f] + ', ' : '') + String(r[i]).trim(); });
      if (v.name && !v.first_name && !v.last_name) { const parts = v.name.split(/\s+/); v.first_name = parts.shift(); v.last_name = parts.join(' '); }
      const emails = M.list(v.email, M.normEmail).filter(e => { if (M.okEmail(e)) return true; bad++; return false; }), phones = M.list(v.phone, M.normPhone);
      if (!emails.length && !phones.length && !v.first_name && !v.last_name) { blank++; continue; }
      const key = emails[0] || phones[0] || (v.first_name + '|' + v.last_name).toLowerCase();
      const known = emails.map(e => byEmail.get(e)).find(Boolean) || phones.map(n => byPhone.get(n)).find(Boolean) || null;
      const row = { v, emails, phones, known, tags: [...new Set([...M.list(v.tags, x => x.trim().toLowerCase()), ...tags])], email_ok: consent || M.yes(v.email_ok), sms_ok: M.yes(v.sms_ok) };
      if (seen.has(key)) { const a = seen.get(key); a.emails = [...new Set([...a.emails, ...emails])]; a.phones = [...new Set([...a.phones, ...phones])]; a.tags = [...new Set([...a.tags, ...row.tags])]; a.email_ok = a.email_ok || row.email_ok; continue; }
      seen.set(key, row); out.push(row);
    }
    return { out, blank, bad };
  };
  const draw = () => { const { out, blank, bad } = build(), fresh = out.filter(r => !r.known).length;
    $('#sum', rest).textContent = `${fresh} new, ${out.length - fresh} already here (they get filled in, never overwritten).` + (blank ? ` ${blank} empty rows skipped.` : '') + (bad ? ` ${bad} email addresses that don’t look right were left out.` : '');
    $('#go', rest).disabled = !out.length; $('#go', rest).textContent = out.length ? `Import ${out.length}` : 'Import';
    $('#prev', rest).innerHTML = out.length ? `<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Organization</th><th></th></tr></thead><tbody>${out.slice(0, 8).map(r => `<tr><td>${esc([r.v.first_name, r.v.last_name].filter(Boolean).join(' '))}</td><td>${esc(r.emails.join(', '))}</td><td>${esc(r.phones.map(M.fmtPhone).join(', '))}</td><td>${esc(r.v.org || '')}</td><td>${r.known ? '<span class="chip grey">Already here</span>' : '<span class="chip green">New</span>'}${r.email_ok ? ' <span class="chip blue">Marketing OK</span>' : ''}</td></tr>`).join('')}</tbody></table>${out.length > 8 ? `<p class="muted small">And ${out.length - 8} more.</p>` : ''}` : `<p class="muted small">Map at least a name, an email or a phone column.</p>`; };
  draw();
  $$('#map select', rest).forEach(s => s.onchange = () => { map[+s.dataset.i] = s.value; draw(); });
  $('#src', rest).onchange = e => { source = e.target.value; }; $('#ok', rest).onchange = e => { consent = e.target.checked; draw(); };
  redraw = draw;
  $('#go', rest).onclick = async ev => { const b = ev.currentTarget, { out } = build(), now = new Date().toISOString(); busy(b, true, 'Importing');
    try {
      const orgs = new Map(state.orgs.map(o => [o.name.trim().toLowerCase(), o]));
      for (const name of new Set(out.map(r => (r.v.org || '').trim()).filter(Boolean))) if (!orgs.has(name.toLowerCase())) orgs.set(name.toLowerCase(), await create('orgs', { name }));
      const rows = out.map(r => { const o = r.v.org ? orgs.get(r.v.org.trim().toLowerCase()) : null, k = r.known;
        if (!k) return { first_name: r.v.first_name || '', last_name: r.v.last_name || '', emails: r.emails, phones: r.phones, org_id: o ? o.id : null, title: r.v.title || '', city: r.v.city || '', notes: r.v.notes || '', tags: r.tags, source, email_ok: r.email_ok, email_ok_at: r.email_ok ? now : null, sms_ok: r.sms_ok, sms_ok_at: r.sms_ok ? now : null };
        // someone already here: add what's missing, keep what's there; never tick consent for a person who unsubscribed
        const give = r.email_ok && !k.email_ok && !k.unsubscribed_at;
        return { id: k.id, first_name: k.first_name || r.v.first_name || '', last_name: k.last_name || r.v.last_name || '', emails: [...new Set([...(k.emails || []), ...r.emails])], phones: [...new Set([...(k.phones || []), ...r.phones])], org_id: k.org_id || (o ? o.id : null), title: k.title || r.v.title || '', city: k.city || r.v.city || '', tags: [...new Set([...(k.tags || []), ...r.tags])], ...(give ? { email_ok: true, email_ok_at: now } : {}), ...(r.sms_ok && !k.sms_ok ? { sms_ok: true, sms_ok_at: now } : {}) }; });
      await savePeople(rows); toast(`Imported ${rows.length} ${rows.length === 1 ? 'person' : 'people'}.`); location.hash = '#/';
    } catch (er) { toast('The import stopped: ' + er.message + ' Run it again to pick up the rest; nobody is added twice.', 'error'); busy(b, false); }
  };
}
