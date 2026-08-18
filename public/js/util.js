/* CircuitTecture — shared utilities */
window.CS = window.CS || {};
(function () {
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (n = 8) => Math.random().toString(36).slice(2, 2 + n) + Date.now().toString(36).slice(-3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = ts => {
    const d = new Date(ts), nowD = new Date();
    const diff = Date.now() - ts;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + 'm ago';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + 'h ago';
    if (d.getFullYear() === nowD.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString();
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const throttle = (fn, ms) => { let last = 0, t = null; return (...a) => { const now = Date.now(); const run = () => { last = Date.now(); t = null; fn(...a); }; if (now - last >= ms) run(); else if (!t) t = setTimeout(run, ms - (now - last)); }; };
  const modalOpenHistory = []; // Stack to store elements that were focused before a modal opened

  /* api */
  let csrfToken = null;
  async function fetchCsrf() {
    try {
      const res = await fetch('/api/csrf', { credentials: 'same-origin' });
      const data = await res.json();
      csrfToken = data.csrf || null;
    } catch { /* not auth'd */ }
  }
  async function api(path, method, body) {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (body) headers['Content-Type'] = 'application/json';
    if (method && method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(path, {
      method: method || 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) { const err = new Error((data && data.error) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    // Update CSRF token from response if provided
    if (data && data.csrf) csrfToken = data.csrf;
    return data;
  }

  /* toasts */
  function toast(msg, kind = 'ok', ms = 3200) {
    const root = $('#toast-root');
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    const spanIcon = document.createElement('span');
    spanIcon.textContent = kind === 'err' ? '⚠️' : kind === 'warn' ? '🟡' : '✅';
    t.prepend(spanIcon);
    root.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
    return t;
  }

  /* modals */
  function modal({ title, body, wide, onClose }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
     back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
       <div class="modal-head"><h3></h3><button class="modal-x" title="Close" aria-label="Close dialog">✕</button></div>
       <div class="modal-body"></div></div>`;
    back.querySelector('h3').textContent = title;
    const bodyEl = back.querySelector('.modal-body');
    if (typeof body === 'string') {
        const span = document.createElement('span');
        span.textContent = body;
        bodyEl.appendChild(span);
    } else if (body) {
        bodyEl.appendChild(body);
    }
       const close = () => {
         back.remove();
         document.removeEventListener('keydown', escH);
         onClose && onClose();
         // Restore focus to the element that had focus before the modal opened
         if (modalOpenHistory.length > 0) {
           modalOpenHistory.pop().focus();
         }
       };
     back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
     back.querySelector('.modal-x').addEventListener('click', close);
     const escH = e => { if (e.key === 'Escape') close(); };
     document.addEventListener('keydown', escH);
     $('#modal-root').appendChild(back);
     // Store the currently focused element to restore focus later
     modalOpenHistory.push(document.activeElement);
     back.querySelector('.modal').focus(); // Focus the modal for keyboard accessibility
    return { close, el: back, body: bodyEl };
  }

  /* context menu */
  function menu(x, y, items) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'menu-pop'; m.id = 'ctx-menu';
    m.setAttribute('role', 'menu');
    m.tabIndex = -1; // Make the menu focusable
    items.forEach(it => {
      if (it === '-') { m.appendChild(document.createElement('hr')); return; }
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.tabIndex = -1;
      b.innerHTML = `<span>${it.icon || ''}</span><span>${esc(it.label)}</span>`;
      if (it.danger) b.classList.add('danger');
      if (it.disabled) { b.disabled = true; b.classList.add('disabled'); }
      else b.addEventListener('click', () => { closeMenu(); it.fn && it.fn(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - Math.min(r.width, innerWidth - 16) - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y, innerHeight - Math.min(r.height, innerHeight - 16) - 8)) + 'px';
    const focusables = () => Array.from(m.querySelectorAll('button:not(:disabled)'));
    const keyH = e => {
      if (!$('#ctx-menu')) return document.removeEventListener('keydown', keyH);
      const fs = focusables();
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); document.removeEventListener('keydown', keyH); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && fs.length) {
        e.preventDefault();
        const i = fs.indexOf(document.activeElement);
        fs[(i + (e.key === 'ArrowDown' ? 1 : -1) + fs.length) % fs.length].focus();
      } else if (e.key === 'Home' && fs.length) { e.preventDefault(); fs[0].focus(); }
      else if (e.key === 'End' && fs.length) { e.preventDefault(); fs[fs.length - 1].focus(); }
    };
     document.addEventListener('keydown', keyH);
     setTimeout(() => {
       const fs = focusables();
       fs[0] && fs[0].focus();
       m.focus(); // Focus the menu itself for initial keyboard interaction
       const dismiss = (e) => { if (m.contains(e.target)) return; closeMenu(); document.removeEventListener('pointerdown', dismiss); };
       document.addEventListener('pointerdown', dismiss);
     }, 0);
  }
  function closeMenu() { const m = $('#ctx-menu'); if (m) m.remove(); }

  /* skeletons */
  function skeletons(container, n, cls) {
    container.innerHTML = '';
    for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'skel ' + (cls || 'skel-card'); container.appendChild(d); }
  }

  /* svg namespace helper */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  /* download helper */
  function download(name, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* tiny pub/sub */
  const bus = {
    m: {},
    on(ev, fn) { (this.m[ev] = this.m[ev] || []).push(fn); return fn; },
    emit(ev, ...a) { (this.m[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }); }
  };

  Object.assign(CS, { $, $$, esc, uid, clamp, fmtTime, debounce, throttle, api, toast, modal, menu, closeMenu, skeletons, svgEl, SVGNS, download, bus, fetchCsrf });
})();
