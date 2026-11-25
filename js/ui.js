// Small DOM helpers shared by all views.

/** Escape text for safe innerHTML interpolation. ALWAYS use for user-entered names. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

/** Format kcal / grams for display. */
export const kcal = n => (n === null || n === undefined) ? '—' : Math.round(n).toLocaleString('he-IL');
export const g = n => (n === null || n === undefined) ? '—' : (Math.round(n * 10) / 10).toLocaleString('he-IL');

/** Create an element from an HTML string (single root). */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(msg, ms = 2200) {
  const el = h(`<div class="toast">${esc(msg)}</div>`);
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/**
 * Bottom-sheet modal. `body` is an HTML string or Element.
 * Returns { el, close }. onClose is called once when closed (backdrop tap or close()).
 */
export function openModal(title, body, { onClose } = {}) {
  const root = document.getElementById('modal-root');
  const back = h(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div class="modal-body"></div></div></div>`);
  const bodyEl = back.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); onClose && onClose(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  root.appendChild(back);
  return { el: back.querySelector('.modal'), close };
}

/** Promise<boolean> confirmation dialog. */
export function confirmDialog(message, { okText = 'אישור', cancelText = 'ביטול', danger = false } = {}) {
  return new Promise(resolve => {
    let result = false;
    const { el, close } = openModal('אישור', `<p>${esc(message)}</p>
      <div class="actions"><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
      <button class="btn" data-cancel>${esc(cancelText)}</button></div>`, { onClose: () => resolve(result) });
    el.querySelector('[data-ok]').onclick = () => { result = true; close(); };
    el.querySelector('[data-cancel]').onclick = () => close();
  });
}

/** Numeric input HTML: text input with decimal keyboard (accepts comma). */
export function numInput(name, value = '', { placeholder = '', attrs = '' } = {}) {
  const v = value === null || value === undefined ? '' : value;
  return `<input name="${name}" inputmode="decimal" autocomplete="off" value="${esc(v)}" placeholder="${esc(placeholder)}" ${attrs}>`;
}

/** Progress bar HTML. */
export function progressBar(value, max, { color } = {}) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const over = max && value > max;
  return `<div class="progress ${over ? 'over' : ''}"><div style="width:${pct}%;${color && !over ? `background:${color}` : ''}"></div></div>`;
}
