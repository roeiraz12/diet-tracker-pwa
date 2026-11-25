// Tiny dependency-free SVG charts. Charts read left-to-right (time axis), even in RTL pages.

import { esc } from './ui.js';

/**
 * Bar chart.
 * bars: [{ label, value, color? }]
 * opts: { target?: number (dashed line), height?: 160, unit?: '' }
 * Bars above target are red.
 */
export function barChart(bars, { target = null, height = 160 } = {}) {
  const W = 320, H = height, padB = 22, padT = 14, padX = 6;
  const max = Math.max(1, target || 0, ...bars.map(b => b.value || 0)) * 1.1;
  const bw = (W - padX * 2) / Math.max(1, bars.length);
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  let s = '';
  bars.forEach((b, i) => {
    const x = padX + i * bw + bw * 0.18, w = bw * 0.64, v = b.value || 0;
    const color = b.color || (target && v > target ? 'var(--danger)' : 'var(--primary)');
    s += `<rect x="${x}" y="${y(v)}" width="${w}" height="${Math.max(0, H - padB - y(v))}" rx="4" fill="${color}"/>`;
    if (v) s += `<text x="${x + w / 2}" y="${y(v) - 3}" text-anchor="middle">${Math.round(v)}</text>`;
    s += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  if (target) s += `<line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  return `<div class="chart" dir="ltr"><svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg></div>`;
}

/**
 * Line chart over dates.
 * points: [{ x: 'YYYY-MM-DD', y: number }] sorted asc
 * opts: { goal?: number (horizontal dashed line), height?: 180 }
 */
export function lineChart(points, { goal = null, height = 180 } = {}) {
  if (!points.length) return '';
  const W = 320, H = height, padL = 34, padR = 8, padT = 12, padB = 22;
  const ys = points.map(p => p.y).concat(goal !== null ? [goal] : []);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1) { min -= 1; max += 1; }
  const span = max - min; min -= span * 0.08; max += span * 0.08;
  const t0 = Date.parse(points[0].x), t1 = Date.parse(points[points.length - 1].x);
  const xs = t => points.length === 1 ? (padL + W - padR) / 2 : padL + (W - padL - padR) * (t - t0) / (t1 - t0);
  const yv = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  let s = '';
  for (let i = 0; i <= 3; i++) {
    const v = min + (max - min) * i / 3;
    s += `<line x1="${padL}" x2="${W - padR}" y1="${yv(v)}" y2="${yv(v)}" stroke="var(--border)"/>`;
    s += `<text x="${padL - 4}" y="${yv(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  if (goal !== null) s += `<line x1="${padL}" x2="${W - padR}" y1="${yv(goal)}" y2="${yv(goal)}" stroke="var(--primary)" stroke-dasharray="5 4"/>`;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs(Date.parse(p.x))},${yv(p.y)}`).join(' ');
  s += `<path d="${path}" fill="none" stroke="var(--protein)" stroke-width="2.2" stroke-linejoin="round"/>`;
  points.forEach(p => { s += `<circle cx="${xs(Date.parse(p.x))}" cy="${yv(p.y)}" r="3.2" fill="var(--protein)"/>`; });
  const lbl = k => { const [, m, d] = k.split('-'); return `${+d}/${+m}`; };
  s += `<text x="${padL}" y="${H - 6}" text-anchor="start">${lbl(points[0].x)}</text>`;
  if (points.length > 1) s += `<text x="${W - padR}" y="${H - 6}" text-anchor="end">${lbl(points[points.length - 1].x)}</text>`;
  return `<div class="chart" dir="ltr"><svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg></div>`;
}

/** Circular progress ring (for daily kcal). */
export function ring(value, max, { size = 140, label = '', sub = '' } = {}) {
  const r = 56, c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  const over = max && value > max;
  return `<div class="chart" style="width:${size}px;margin:0 auto"><svg viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--border)" stroke-width="12"/>
    ${pct > 0 ? `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${over ? 'var(--danger)' : 'var(--primary)'}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${c * pct} ${c}" transform="rotate(-90 70 70)"/>` : ''}
    <text x="70" y="70" text-anchor="middle" style="font-size:22px;font-weight:700;fill:var(--text)">${esc(label)}</text>
    <text x="70" y="90" text-anchor="middle" style="font-size:11px">${esc(sub)}</text>
  </svg></div>`;
}
