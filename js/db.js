// FT Comms' connection to its database: FTS's sign-in (Foreign Tongues' own Supabase project and accounts) and its
// own ftc_* tables. Everything is loaded into memory once (people, organizations, segments, emails) and kept in step:
// saves go to the database and into `state`; other people's changes to people arrive live.
const SUPABASE_URL = 'https://ctmvkumkqlspyenbnnkn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_yyJg7u4i2MMe1Y7mWYVELQ_3MU9zXWo';   // publishable: safe in the page; the database rules limit access

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ftc.auth' } });
export const state = { me: null, people: [], orgs: [], segments: [], emails: [], settings: {}, events: [], links: [] };
const fail = e => { throw new Error((e && e.message) || String(e)); };

/* ---------- who's here ---------- */
// The FTS person signed in, if they may use this app; throws 'not_allowed' / 'not_set_up' otherwise.
export async function join() {
  const { data, error } = await sb.rpc('fts_join');
  if (error || !data || !data.user_id) throw new Error('not_allowed');
  const ok = await sb.rpc('ftc_allowed');
  if (ok.error) throw new Error(/ftc_allowed|schema cache|PGRST202/i.test(ok.error.message || ok.error.code || '') ? 'not_set_up' : ok.error.message);
  if (!ok.data) throw new Error('not_allowed');
  return (state.me = data);
}
export const isAdmin = () => !!state.me && state.me.role === 'admin';

/* ---------- saved / saving ---------- */
export const writes = { n: 0, err: '', on: null };
async function w(fn) {
  writes.n++; writes.on && writes.on();
  try { const r = await fn(); writes.err = ''; return r; } catch (e) { writes.err = (e && e.message) || String(e); throw e; } finally { writes.n--; writes.on && writes.on(); }
}

/* ---------- loading ---------- */
// every row of a table (the database hands out 1000 at a time)
async function all(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').order(order, { ascending: true }).range(from, from + 999);
    if (error) fail(error); out.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return out;
}
export async function loadAll() {
  const [people, orgs, segments, emails, settings] = await Promise.all([
    all('ftc_people', 'created_at'), all('ftc_orgs', 'name'), all('ftc_segments', 'name'), all('ftc_emails', 'created_at'), all('ftc_settings', 'key')]);
  Object.assign(state, { people, orgs, segments, emails, settings: Object.fromEntries(settings.map(s => [s.key, s.value])) });
  try { await loadEvents(); } catch (e) {}   // (FT Comms works without FT Events)
}
// FT Events' events and who was at each (ftc_event_people: one row per person per list, kept by the database)
let byPerson = new Map();
export async function loadEvents() {
  const [ev, ln] = await Promise.all([sb.from('fte_events').select('id,name,event_date').eq('is_template', false).order('event_date', { ascending: false }), sb.from('ftc_event_people').select('*').limit(10000)]);
  if (ev.error) fail(ev.error); if (ln.error) fail(ln.error);
  state.events = ev.data || []; state.links = ln.data || [];
  byPerson = new Map(); for (const l of state.links) { if (!byPerson.has(l.person_id)) byPerson.set(l.person_id, []); byPerson.get(l.person_id).push(l); }
}
export const eventsOf = pid => byPerson.get(pid) || [];
export const eventById = id => state.events.find(e => e.id === id) || null;
export const person = id => state.people.find(p => p.id === id) || null;
export const org = id => state.orgs.find(o => o.id === id) || null;
export const segment = id => state.segments.find(s => s.id === id) || null;
export const emailById = id => state.emails.find(e => e.id === id) || null;

function keep(list, row) { const i = state[list].findIndex(x => x.id === row.id); if (i < 0) state[list].push(row); else state[list][i] = row; return row; }
const drop = (list, id) => { state[list] = state[list].filter(x => x.id !== id); };
const TABLE = { people: 'ftc_people', orgs: 'ftc_orgs', segments: 'ftc_segments', emails: 'ftc_emails' };

// add, change or remove a row of 'people' | 'orgs' | 'segments' | 'emails'
export const create = (list, row) => w(async () => { const { data, error } = await sb.from(TABLE[list]).insert(row).select().single(); if (error) fail(error); return keep(list, data); });
export const update = (list, id, patch) => w(async () => { const { data, error } = await sb.from(TABLE[list]).update(patch).eq('id', id).select().single(); if (error) fail(error); return keep(list, data); });
export const remove = (list, id) => w(async () => { const { error } = await sb.from(TABLE[list]).delete().eq('id', id); if (error) fail(error); drop(list, id); });
// many people at once (the importer): rows without an id are added, rows with one are changed
export const savePeople = rows => w(async () => {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200), fresh = part.filter(r => !r.id), known = part.filter(r => r.id);
    if (fresh.length) { const { data, error } = await sb.from('ftc_people').insert(fresh).select(); if (error) fail(error); out.push(...data); }
    for (const r of known) { const { id, ...patch } = r; const { data, error } = await sb.from('ftc_people').update(patch).eq('id', id).select().single(); if (error) fail(error); out.push(data); }
  }
  for (const r of out) keep('people', r); return out;
});
export const saveSetting = (key, value) => w(async () => { const { error } = await sb.from('ftc_settings').upsert({ key, value, updated_at: new Date().toISOString() }); if (error) fail(error); state.settings[key] = value; });

/* ---------- timeline ---------- */
export async function timeline(personId) {
  const { data, error } = await sb.from('ftc_timeline').select('*').eq('person_id', personId).order('at', { ascending: false }).limit(500);
  if (error) fail(error); return data || [];
}
// the newest entries of some kinds, across everyone (the Messages page)
export async function recent(kinds, limit = 200) {
  const { data, error } = await sb.from('ftc_timeline').select('*').in('kind', kinds).order('at', { ascending: false }).limit(limit);
  if (error) fail(error); return data || [];
}
export const addEntry = row => w(async () => {
  const { data, error } = await sb.from('ftc_timeline').insert(row).select().single(); if (error) fail(error);
  const p = person(row.person_id);   // the database moves "last contact" along; do the same here
  if (p && row.kind !== 'note' && row.kind !== 'order' && (!p.last_contact_at || p.last_contact_at < data.at)) p.last_contact_at = data.at;
  return data;
});
export const removeEntry = id => w(async () => { const { error } = await sb.from('ftc_timeline').delete().eq('id', id); if (error) fail(error); });

/* ---------- other people's changes ---------- */
export function listen(on) {
  sb.channel('ftc-live').on('postgres_changes', { event: '*', schema: 'public', table: 'ftc_people' }, ev => {
    if (ev.eventType === 'DELETE') { if (person(ev.old.id)) { drop('people', ev.old.id); on(); } return; }
    const known = person(ev.new.id); if (known && known.updated_at === ev.new.updated_at) return;   // mine, already here
    keep('people', ev.new); on();
  }).subscribe();
}

/* ---------- the server (sending email) ---------- */
export async function api(path, body) {
  const { data } = await sb.auth.getSession(), token = data && data.session && data.session.access_token;
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || ('The server answered ' + r.status)); return j;
}
