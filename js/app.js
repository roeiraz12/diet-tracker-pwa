// Router + app bootstrap. Hash routes: #home, #summary?date=2026-11-19, ...

import * as home from './views/home.js';
import * as summary from './views/summary.js';
import * as dictionary from './views/dictionary.js';
import * as weight from './views/weight.js';
import * as settings from './views/settings.js';
import { renderBanners } from './banners.js';
import { registerSW } from './pwa.js';
import { requestPersist, onExternalChange } from './store.js';

/*
View module contract (js/views/*.js):
  export const title = 'כותרת';
  export function render(container, params, ctx) -> optional cleanup fn
    container: <main> element, already emptied
    params:   object parsed from the hash query (?date=...)
    ctx.navigate(route, params?) – switch view
    ctx.refresh()                – re-render current view (e.g. after a modal saved data)
  Views do NOT auto-re-render on store changes; call ctx.refresh() or update the DOM yourself.
*/
const VIEWS = { home, summary, dictionary, weight, settings };

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
let cleanup = null;

function parseHash() {
  const [route, q] = location.hash.replace(/^#/, '').split('?');
  return { route: VIEWS[route] ? route : 'home', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

export function navigate(route, params = {}) {
  const q = new URLSearchParams(params).toString();
  const hash = `#${route}${q ? '?' + q : ''}`;
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  const { route, params } = parseHash();
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const view = VIEWS[route];
  titleEl.textContent = view.title || 'יומן דיאטה';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  viewEl.innerHTML = '';
  window.scrollTo(0, 0);
  const ret = view.render(viewEl, params, ctx);
  if (typeof ret === 'function') cleanup = ret;
  renderBanners(document.getElementById('banner-area'), ctx);
}

const ctx = { navigate, refresh: render };

document.getElementById('nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-route]');
  if (b) navigate(b.dataset.route);
});
window.addEventListener('hashchange', render);

render();
onExternalChange(() => { document.getElementById('modal-root').innerHTML = ''; render(); });
requestPersist();
registerSW();
