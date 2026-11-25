// FT Comms: sign-in (the same accounts as Foreign Tongues Social), the sidebar, and which page is showing.
import { sb, join, state, loadAll, loadEvents, eventsOf, eventById, listen, writes } from './db.js';
import { useEvents } from './model.js';
import { drawIcons } from './icons.js';
import { BUILD } from './build.js';
import { $, $$ } from './ui.js';
import { peoplePage, personPage } from './people.js';
import { orgsPage, orgPage, segmentsPage, segmentPage, messagesPage, settingsPage } from './pages.js';
import { emailPage, composePage } from './email.js';
import { importPage } from './importer.js';

const main = $('#main');
drawIcons();
useEvents(eventsOf, id => { const e = eventById(id); return e ? e.name : 'a deleted event'; });

/* ---------------- sign-in ---------------- */
let started = false, starting = false, mode = 'in';   // 'in' | 'reset' | 'newpw'
function gate(note = '') { $('#app').hidden = true; $('#gate').hidden = false; setMode(mode); $('#gNote').textContent = note; }
function setMode(m) {
  mode = m;
  $('#gateLead').textContent = m === 'reset' ? 'Enter your email and we’ll send a link to set a new password.' : m === 'newpw' ? 'Choose a new password.' : 'Sign in with your Foreign Tongues Social email and password.';
  $('#gEmailRow').hidden = m === 'newpw'; $('#gPwRow').hidden = m === 'reset';
  $('#gGo').textContent = m === 'reset' ? 'Send the link' : m === 'newpw' ? 'Save password' : 'Sign in';
  $('#gForgot').textContent = m === 'in' ? 'Forgot password' : 'Back to sign in';
}
$('#gForgot').onclick = e => { e.preventDefault(); setMode(mode === 'in' ? 'reset' : 'in'); $('#gNote').textContent = ''; };
$('#gateForm').onsubmit = async e => {
  e.preventDefault(); const email = $('#gEmail').value.trim(), pw = $('#gPw').value, btn = $('#gGo'); btn.disabled = true; $('#gNote').textContent = '';
  try {
    if (mode === 'in') { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; await start(); }
    else if (mode === 'reset') { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); if (error) throw error; $('#gNote').textContent = 'Check your email for the link.'; }
    else { if (pw.length < 8) throw new Error('Use at least 8 characters.'); const { error } = await sb.auth.updateUser({ password: pw }); if (error) throw error; mode = 'in'; await start(); }
  } catch (er) { $('#gNote').textContent = /invalid login/i.test(er.message || '') ? 'That email and password don’t match.' : (er.message || String(er)); }
  btn.disabled = false;
};
$('#signOut').onclick = async () => { await sb.auth.signOut(); location.hash = '#/'; location.reload(); };

async function start() {
  if (started || starting) return; starting = true;
  try { await join(); await loadAll(); }
  catch (e) { starting = false; const m = e.message;
    if (m === 'not_set_up') return gate('FT Comms’ tables aren’t in the database yet.');
    if (m !== 'not_allowed') return gate(m);
    await sb.auth.signOut();
    return gate('This account can’t use FT Comms yet. Ask an FT Social admin to invite you.');
  }
  started = true;
  $('#gate').hidden = true; $('#app').hidden = false;
  $('#meName').textContent = state.me.name || state.me.email; $('#meRole').textContent = state.me.role === 'admin' ? 'Admin' : 'Creator'; $('#build').textContent = 'Build ' + BUILD;
  listen(other); route();
}
sb.auth.onAuthStateChange((evn, session) => {
  if (evn === 'PASSWORD_RECOVERY') { $('#app').hidden = true; $('#gate').hidden = false; setMode('newpw'); return; }
  if (evn === 'SIGNED_IN' && session && !started && mode !== 'newpw') setTimeout(start, 0);
});
const { data } = await sb.auth.getSession();
if (data && data.session && !/type=recovery/.test(location.hash)) start(); else if (!/type=recovery/.test(location.hash)) gate();

/* ---------------- saved / saving, in the sidebar ---------------- */
writes.on = () => { const n = $('#saveNote'); if (!n) return;
  n.className = 'save-note ' + (writes.n ? 'busy' : writes.err ? 'err' : 'ok'); n.textContent = writes.n ? 'Saving' : writes.err ? 'Not saved' : 'Saved'; n.title = writes.err || ''; };

/* ---------------- pages ---------------- */
let current = '';
const PAGES = [
  [/^$/, 'people', () => peoplePage(main)],
  [/^p\/([\w-]+)$/, 'people', m => personPage(main, m[1])],
  [/^orgs$/, 'orgs', () => orgsPage(main)],
  [/^o\/([\w-]+)$/, 'orgs', m => orgPage(main, m[1])],
  [/^segments$/, 'segments', () => segmentsPage(main)],
  [/^segments\/([\w-]+)$/, 'segments', m => segmentPage(main, m[1])],
  [/^email$/, 'email', () => emailPage(main)],
  [/^email\/([\w-]+)$/, 'email', m => composePage(main, m[1])],
  [/^messages$/, 'messages', () => messagesPage(main)],
  [/^import$/, 'people', () => importPage(main)],
  [/^settings$/, 'settings', () => settingsPage(main)],
];
export async function route() {
  if (!started) return;
  if (/^#\/(segments|email)/.test(location.hash)) { try { await loadEvents(); } catch (e) {} }   // (guest lists change in FT Events)
  const path = location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  document.body.classList.remove('drawer');
  for (const [re, name, draw] of PAGES) { const m = re.exec(path); if (!m) continue;
    current = name; $$('#nav a[data-r], #tabbar a[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === name));
    main.scrollTop = 0; scrollTo(0, 0); draw(m); drawIcons(main); return; }
  location.hash = '#/';
}
addEventListener('hashchange', route);
$('#mMenu').onclick = () => document.body.classList.toggle('drawer');
$('#scrim').onclick = () => document.body.classList.remove('drawer');

// someone else changed a person: draw the list again, unless something is being typed or a dialog is open
let againT = 0;
function other() {
  clearTimeout(againT);
  againT = setTimeout(() => { const a = document.activeElement; if ($('.modal-wrap, .ctx, .cfm') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return; if (/^#\/?$/.test(location.hash || '#/')) route(); }, 400);
}
