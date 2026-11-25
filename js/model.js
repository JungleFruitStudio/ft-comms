// What FT Comms knows about its own data, with no page or database in it: names, tidy emails and phone numbers,
// which people a segment's rules pick, reading a spreadsheet file, and turning an email's text into a page.
export const ROLES = ['customer', 'event guest', 'boutique owner', 'boutique staff', 'buyer', 'manufacturer', 'consultant', 'press', 'team'];
export const ORG_KINDS = [['boutique', 'Boutique'], ['manufacturer', 'Manufacturer'], ['consultancy', 'Consultancy'], ['press', 'Press'], ['venue', 'Venue'], ['other', 'Other']];
export const KINDS = { note: 'Note', email_out: 'Email sent', email_in: 'Email received', text_out: 'Text sent', text_in: 'Text received', call: 'Call', meeting: 'Met in person', event: 'Event', order: 'Order' };

export const fullName = p => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || (p.emails && p.emails[0]) || (p.phones && fmtPhone(p.phones[0])) || 'No name';
export const normEmail = s => String(s || '').trim().toLowerCase();
export const okEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// phone numbers are kept as + and digits; ten digits are taken to be a US number
export function normPhone(s) {
  const plus = /^\s*\+/.test(String(s || '')); let d = String(s || '').replace(/\D/g, '');
  if (!d || d.length < 7) return '';
  if (!plus && d.length === 10) d = '1' + d;
  return '+' + d;
}
export function fmtPhone(p) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ''); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || '');
}
// "a, b; c" -> ['a','b','c'], cleaned with fn, without repeats or blanks
export const list = (s, fn = x => x.trim()) => [...new Set(String(s || '').split(/[,;\n]+/).map(fn).filter(Boolean))];
export const allTags = people => [...new Set([...ROLES, ...people.flatMap(p => p.tags || [])])].sort((a, b) => a.localeCompare(b));

export function when(iso) {
  if (!iso) return ''; const d = new Date(iso), now = new Date(), days = Math.floor((now - d) / 864e5);
  if (days < 1 && d.getDate() === now.getDate()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
export const ago = iso => { if (!iso) return 'Never'; const days = Math.floor((Date.now() - new Date(iso)) / 864e5); return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : days < 60 ? days + ' days ago' : Math.round(days / 30) + ' months ago'; };

/* ---------- segments ---------- */
// rules: { any: [tags], all: [tags], none: [tags], orgKinds: [], reach: ''|'email'|'phone', consent: ''|'email'|'sms',
//          source: '', quietDays: n (no contact for at least n days, or never), activeDays: n (contact within n days) }
//          event: { id, as: ''|'guest'|'team', status: ''|'came'|'booked'|'noshow'|'cancel' } (on an FT Events event's guest list or team)
export const emptyRules = () => ({ any: [], all: [], none: [], orgKinds: [], reach: '', consent: '', source: '', quietDays: '', activeDays: '', event: { id: '', as: '', status: '' } });
// who was at which event, and what an event is called: handed in by the app (db.js knows; this file doesn't)
let eventsOf = () => [], eventName = () => 'an event';
export const useEvents = (of, name) => { eventsOf = of; eventName = name; };
export function matches(p, rules, orgOf) {
  const r = { ...emptyRules(), ...(rules || {}) }, tags = p.tags || [];
  const ev = r.event || {};
  if (ev.id && !eventsOf(p.id).some(l => l.event_id === ev.id && (!ev.as || l.as_kind === ev.as) && (!ev.status || (l.as_kind === 'guest' && (l.status || 'booked') === ev.status)))) return false;
  if (r.any.length && !r.any.some(t => tags.includes(t))) return false;
  if (r.all.length && !r.all.every(t => tags.includes(t))) return false;
  if (r.none.length && r.none.some(t => tags.includes(t))) return false;
  if (r.orgKinds.length) { const o = orgOf(p.org_id); if (!o || !r.orgKinds.includes(o.kind)) return false; }
  if (r.reach === 'email' && !(p.emails || []).length) return false;
  if (r.reach === 'phone' && !(p.phones || []).length) return false;
  if (r.consent === 'email' && !(p.email_ok && !p.unsubscribed_at)) return false;
  if (r.consent === 'sms' && !p.sms_ok) return false;
  if (r.source && p.source !== r.source) return false;
  const days = p.last_contact_at ? (Date.now() - new Date(p.last_contact_at)) / 864e5 : Infinity;
  if (r.quietDays !== '' && r.quietDays != null && !(days >= +r.quietDays)) return false;
  if (r.activeDays !== '' && r.activeDays != null && !(days <= +r.activeDays)) return false;
  return true;
}
export function describe(rules) {
  const r = { ...emptyRules(), ...(rules || {}) }, out = [];
  const ev = r.event || {};
  if (ev.id) out.push((ev.as === 'team' ? 'team of ' : ev.as === 'guest' ? ({ came: 'guests who came to ', noshow: 'no-shows at ', cancel: 'cancellations for ', booked: 'booked guests of ' }[ev.status] || 'guests of ') : 'everyone at ') + eventName(ev.id));
  if (r.any.length) out.push('tagged ' + r.any.join(' or '));
  if (r.all.length) out.push('with all of ' + r.all.join(', '));
  if (r.none.length) out.push('not ' + r.none.join(', '));
  if (r.orgKinds.length) out.push('at a ' + r.orgKinds.join(' or '));
  if (r.reach) out.push('has ' + (r.reach === 'email' ? 'an email' : 'a phone number'));
  if (r.consent) out.push('agreed to marketing ' + (r.consent === 'email' ? 'email' : 'texts'));
  if (r.source) out.push('from ' + r.source);
  if (r.quietDays !== '' && r.quietDays != null) out.push(`no contact for ${r.quietDays}+ days`);
  if (r.activeDays !== '' && r.activeDays != null) out.push(`contact in the last ${r.activeDays} days`);
  return out.length ? out.join(' · ') : 'Everyone';
}

/* ---------- reading a spreadsheet file (CSV) ---------- */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false; text = String(text || '').replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cell += c; }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
// what each column of an imported file is, guessed from its heading
export const FIELDS = [['', 'Skip'], ['name', 'Full name'], ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['org', 'Organization'], ['title', 'Job title'], ['city', 'City'], ['tags', 'Tags'], ['notes', 'Notes'], ['email_ok', 'Agreed to marketing email (yes/no)'], ['sms_ok', 'Agreed to marketing texts (yes/no)']];
export function guessField(h) {
  h = String(h || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (/first/.test(h)) return 'first_name'; if (/last|surname/.test(h)) return 'last_name';
  if (/sms/.test(h) && /market|accept|consent|opt/.test(h)) return 'sms_ok';
  if (/(email|e mail)/.test(h) && /market|accept|consent|opt|subscri/.test(h)) return 'email_ok';
  if (/^(accepts marketing|subscribed|opt in)$/.test(h)) return 'email_ok';
  if (/e ?mail/.test(h)) return 'email'; if (/phone|mobile|cell|tel/.test(h)) return 'phone';
  if (/company|organi[sz]ation|business|boutique|store/.test(h)) return 'org'; if (/title|role|position/.test(h)) return 'title';
  if (/city|town/.test(h)) return 'city'; if (/tag|label|group/.test(h)) return 'tags'; if (/note|comment/.test(h)) return 'notes';
  if (/^(name|full name|contact|customer)$/.test(h)) return 'name';
  return '';
}
export const yes = v => /^(y|yes|true|1|subscribed|x)$/i.test(String(v || '').trim());

/* ---------- an email's text as a page ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// {{first_name}} and {{name}} are filled in per person; a blank line starts a new paragraph; links become links
export const fill = (text, p) => String(text || '').replace(/\{\{\s*first_name\s*\}\}/gi, (p && p.first_name) || 'there').replace(/\{\{\s*name\s*\}\}/gi, p ? fullName(p) : 'there');
export function bodyHtml(text, p) {
  return fill(text, p).trim().split(/\n\s*\n/).map(par => '<p>' + esc(par).replace(/\n/g, '<br>').replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}">${u}</a>`) + '</p>').join('');
}
