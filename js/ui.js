// Small UI helpers (as in FTS): escaping, toasts, dialogs.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), kind === 'error' ? 7000 : 3200);
  setTimeout(() => t.remove(), kind === 'error' ? 7600 : 3800);
}

// a dialog; returns {el, close}. onClose runs when it's closed any way.
export function modal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="x modal-x" aria-label="Close">×</button>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('has-modal');
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); if (!$('.modal-wrap')) document.body.classList.remove('has-modal'); removeEventListener('keydown', key); onClose && onClose(); };
  const key = e => { if (e.key === 'Escape' && wrap === $$('.modal-wrap').at(-1)) close(); };
  addEventListener('keydown', key);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  $('.modal-x', wrap).onclick = close;
  return { el: $('.modal', wrap), close };
}
// A yes-or-no question, asked right where the mouse last pressed (so beside the thing being deleted, not across the
// screen): a small box by the pointer. Enter says yes, Esc or a click anywhere else says no.
let lastPress = null; addEventListener('pointerdown', e => { lastPress = { x: e.clientX, y: e.clientY }; }, true);
export function confirmBox(text, yes = 'OK', danger = false) {
  return new Promise(ok => { $$('.cfm').forEach(x => x.remove());
    const m = document.createElement('div'); m.className = 'cfm'; m.setAttribute('role', 'alertdialog');
    m.innerHTML = `<p>${esc(text)}</p><div class="row end"><button class="btn small ghost" data-no>Cancel</button><button class="btn small ${danger ? 'danger' : 'primary'}" data-yes>${esc(yes)}</button></div>`;
    document.body.appendChild(m);
    const at = lastPress || { x: innerWidth / 2, y: innerHeight / 2 }, r = m.getBoundingClientRect();
    let x = at.x + 12, y = at.y + 10; if (x + r.width > innerWidth - 8) x = at.x - r.width - 12; if (y + r.height > innerHeight - 8) y = at.y - r.height - 10;   // (to the other side when there's no room)
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    const done = v => { m.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); ok(v); };
    const away = e => { if (!m.contains(e.target)) done(false); }, key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } };
    setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); }, 0);
    $('[data-no]', m).onclick = () => done(false); $('[data-yes]', m).onclick = () => done(true); $('[data-yes]', m).focus({ preventScroll: true });
  });
}
// Rename where it stands: the text turns into a field in its place. Enter or clicking away keeps it, Esc leaves it as it
// was. Gives the new text, or null when it was left alone.
export function editInPlace(span, value) {
  return new Promise(ok => { if (!span || span.parentElement.querySelector('.inplace')) return ok(null);
    const inp = document.createElement('input'), drag = span.closest('[draggable="true"]'); let over = false;
    inp.className = 'inplace'; inp.value = value || ''; inp.spellcheck = false; if (drag) drag.draggable = false;   // (or the row is dragged instead of the text picked)
    const done = v => { if (over) return; over = true; inp.remove(); span.hidden = false; if (drag) drag.draggable = true; v = v == null ? null : v.trim(); ok(v && v !== (value || '').trim() ? v : null); };
    for (const n of ['click', 'dblclick', 'mousedown', 'pointerdown', 'contextmenu']) inp.addEventListener(n, e => e.stopPropagation());
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } if (e.key === 'Escape') { e.preventDefault(); done(null); } });
    inp.addEventListener('keyup', e => { e.stopPropagation(); if (e.key === ' ') e.preventDefault(); });   // (a space typed inside a button mustn't press the button)
    inp.addEventListener('blur', () => done(inp.value));
    span.hidden = true; span.after(inp); inp.focus(); inp.select(); });
}
export function promptBox(text, { value = '', placeholder = '', yes = 'OK', area = false } = {}) {
  return new Promise(ok => {
    let done = false;
    const m = modal(`<p class="confirm-text">${esc(text)}</p>${area ? `<textarea class="input" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}">`}<div class="row end"><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>${esc(yes)}</button></div>`, { onClose: () => { if (!done) ok(null); } });
    const inp = $('.input', m.el); setTimeout(() => inp.focus(), 30);
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-yes]', m.el).onclick = () => { done = true; ok(inp.value); m.close(); };
    if (!area) inp.onkeydown = e => { if (e.key === 'Enter') $('[data-yes]', m.el).click(); };
  });
}

export function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${text ? esc(text) : ''}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

// a right-click menu at (x, y): items are {label, hint, run, off (greyed), danger} or '-' for a line
export function menu(x, y, items) {
  $$('.ctx').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}"${it.off ? ' disabled' : ''}><span>${esc(it.label)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect(); m.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px'; m.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
  const close = () => { m.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key, true); removeEventListener('blur', close); };
  const away = e => { if (!m.contains(e.target)) close(); }, key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key, true); addEventListener('blur', close); }, 0);
  m.onclick = e => { const b = e.target.closest('[data-i]'); if (!b || b.disabled) return; close(); items[+b.dataset.i].run(); };
  m.oncontextmenu = e => e.preventDefault();
}
