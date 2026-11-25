// FT Comms' icons, drawn the way FTS's are: plain abstract shapes (not font characters), 16×16 in the text colour.
const svg = body => `<svg class="ico" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  people: svg('<circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 13.5c.6-2.6 2.6-4 5.2-4s4.6 1.4 5.2 4"/>'),
  orgs: svg('<rect x="2.5" y="2.5" width="5" height="11" rx=".8"/><rect x="9" y="6.5" width="4.5" height="7" rx=".8"/>'),
  segments: svg('<circle cx="6" cy="8" r="3.8"/><circle cx="10" cy="8" r="3.8"/>'),
  email: svg('<rect x="2" y="3.5" width="12" height="9" rx="1.2"/><path d="M2.5 4.5L8 9l5.5-4.5"/>'),
  messages: svg('<path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/>'),
  import: svg('<path d="M8 2.5V10M5 7.5l3 3 3-3M3 13.5h10"/>'),
  settings: svg('<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.6" fill="var(--paper, #fff)"/><circle cx="10" cy="11" r="1.6" fill="var(--paper, #fff)"/>'),
  make: svg('<path d="M8 3v10M3 8h10"/>'),
  back: svg('<path d="M9.5 3.5L5 8l4.5 4.5"/>'),
};
// put the icons into every <i data-ic="name"> inside root
export function drawIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(i => { if (ICONS[i.dataset.ic] && !i.firstElementChild) i.innerHTML = ICONS[i.dataset.ic]; });
}
