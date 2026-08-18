/* CircuitTecture — circuit canvas: pan/zoom grid, drag & drop, pin-to-pin wiring,
   selection, alignment guides, snap-to-grid, undo/redo, clipboard, live interactivity. */
(function () {
  const CS = window.CS;
  const { svgEl, clamp, uid } = CS;

  const WIRE_HIT_RADIUS = 18;
  const WIRE_SNAP_RADIUS = 20;
  const isFiniteNum = v => Number.isFinite(+v);
  const toFinite = (v, fallback = 0) => Number.isFinite(+v) ? +v : fallback;

  function kindBase(pin) { return ((pin && pin.kind) || 'special').split(' ')[0]; }
  function compDef(comp) { return comp && CS.defs[comp.type]; }
  function pinDef(comp, pinId) { const d = compDef(comp); return d && d.pins.find(p => p.id === pinId); }
  function pinWorldInDoc(doc, comp, pinId) {
    const def = compDef(comp); const p = def && def.pins.find(x => x.id === pinId); if (!def || !p) return null;
    const cx = def.w / 2, cy = def.h / 2, a = (toFinite(comp.r, 0)) * Math.PI / 180;
    const dx = (p.x - cx) * (comp.flipX ? -1 : 1), dy = (p.y - cy) * (comp.flipY ? -1 : 1);
    return { x: toFinite(comp.x, 0) + cx + dx * Math.cos(a) - dy * Math.sin(a), y: toFinite(comp.y, 0) + cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function allPins(doc) {
    const out = [];
    (doc.components || []).forEach(c => {
      const def = compDef(c); if (!def) return;
      def.pins.forEach(p => { const pt = pinWorldInDoc(doc, c, p.id); if (pt) out.push({ c, p, def, pt, ref: { c: c.id, p: p.id } }); });
    });
    return out;
  }
  function sameRef(a, b) { return a && b && a.c === b.c && a.p === b.p; }
  function voltageOf(comp, pin) {
    if (!pin) return null;
    const id = String(pin.id || pin.label || '').toUpperCase();
    if (kindBase(pin) === 'ground' || /^GND|GNDB|GND\d*$|-$/.test(id)) return 0;
    if (id.includes('3V3') || id.includes('3.3')) return 3.3;
    if (id === '5V' || id.includes('5V')) return 5;
    if (id === '+' && comp && comp.type === 'battery') return +(comp.props && comp.props.voltage) || 9;
    if (id === 'VIN' && comp && comp.type === 'psu') return 9;
    return null;
  }
  function pinRole(comp, pin) {
    const k = kindBase(pin), id = String(pin.id || '').toUpperCase();
    if (k === 'ground') return 'ground';
    if (k === 'power') return voltageOf(comp, pin) != null ? 'power-source' : 'power';
    if (compDef(comp) && compDef(comp).mcu) return 'io';
    if (/^(OUT|DO|AO|TX|ECHO|MISO|SIGOUT)$/.test(id)) return 'output';
    return 'io';
  }
  function connectionMessage(doc, from, to, ignoreWireId) {
    if (!from || !to) return 'Missing pin reference.';
    if (sameRef(from, to)) return 'Pick a different pin to finish this wire.';
    const ca = (doc.components || []).find(c => c.id === from.c), cb = (doc.components || []).find(c => c.id === to.c);
    const pa = pinDef(ca, from.p), pb = pinDef(cb, to.p);
    if (!ca || !cb || !pa || !pb) return 'That pin no longer exists.';
    if ((doc.wires || []).some(w => w.id !== ignoreWireId && ((sameRef(w.a, from) && sameRef(w.b, to)) || (sameRef(w.b, from) && sameRef(w.a, to))))) return 'Those two pins are already connected.';
    const ka = kindBase(pa), kb = kindBase(pb);
    if ((ka === 'power' && kb === 'ground') || (ka === 'ground' && kb === 'power')) return 'Invalid wire: power and GND cannot be directly shorted.';
    const va = voltageOf(ca, pa), vb = voltageOf(cb, pb);
    if (va != null && vb != null && Math.abs(va - vb) > 0.35) return `Invalid wire: ${va} V and ${vb} V rails are not compatible.`;
    const ra = pinRole(ca, pa), rb = pinRole(cb, pb);
    if (ra === 'output' && rb === 'output') return 'Invalid wire: two output pins would fight each other.';
    return '';
  }
  function validateConnection(doc, from, to, ignoreWireId) { const message = connectionMessage(doc, from, to, ignoreWireId); return { ok: !message, message }; }
  function findPinNear(doc, x, y, opts = {}) {
    const radius = opts.radius == null ? WIRE_SNAP_RADIUS : opts.radius;
    const includeInvalid = !!opts.includeInvalid;
    let best = null;
    for (const pin of allPins(doc)) {
      if (opts.from && sameRef(opts.from, pin.ref)) continue;
      const dist = Math.hypot(pin.pt.x - x, pin.pt.y - y);
      if (dist > radius) continue;
      const verdict = opts.from ? validateConnection(doc, opts.from, pin.ref, opts.ignoreWireId) : { ok: true, message: '' };
      if (!includeInvalid && !verdict.ok) continue;
      if (!best || dist < best.dist) best = Object.assign({}, pin, { dist, valid: verdict.ok, message: verdict.message });
    }
    return best;
  }

  function snapToBreadboard(doc, comp, x, y) {
    const def = compDef(comp);
    if (!def || !def.pins || !def.pins.length) return { x, y };
    const bb = (doc.components || []).find(c => compDef(c) && compDef(c).breadboard);
    if (!bb) return { x, y };
    const bbDef = compDef(bb);
    if (!bbDef || !bbDef.pins) return { x, y };
    const threshold = 18;
    let bestDist = Infinity, bestDx = 0, bestDy = 0;
    for (const pin of def.pins) {
      const wx = x + pin.x, wy = y + pin.y;
      for (const bbPin of bbDef.pins) {
        const bx = bb.x + bbPin.x, by = bb.y + bbPin.y;
        const dist = Math.hypot(wx - bx, wy - by);
        if (dist < threshold && dist < bestDist) { bestDist = dist; bestDx = bx - wx; bestDy = by - wy; }
      }
    }
    if (bestDist < threshold) return { x: x + bestDx, y: y + bestDy };
    return { x, y };
  }

  CS.Wiring = Object.assign(CS.Wiring || {}, { WIRE_HIT_RADIUS, WIRE_SNAP_RADIUS, kindBase, pinWorld: pinWorldInDoc, allPins, findPinNear, snapToBreadboard, validateConnection });

  class CircuitCanvas {
    constructor(svg) {
      this.svg = svg;
      this.view = { x: 60, y: 40, z: 1 };
      this.doc = { components: [], wires: [] };
      this.selection = new Set();      // comp ids
      this.selWires = new Set();       // wire ids
      this.undoStack = []; this.redoStack = [];
      this.clipboard = null;
      this.snapGrid = true;
      this.gridOn = true;
      this.wireStyle = 'smooth';
      this.pinHitRadius = WIRE_HIT_RADIUS;
      this.snapRadius = WIRE_SNAP_RADIUS;
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        this.pinHitRadius = 28;
        this.snapRadius = 30;
      }
      this._drcProblems = [];
      this._miniMapDragging = false;
      this.spaceHeld = false;
      this.hoverPin = null;
      this.snapPin = null;
      this.touchPointers = new Map();
      this.longPressTimer = null;
      this.readOnly = false;
      this.buildDom();
      this.bindEvents();
    }

    /* ---------- dom scaffold ---------- */
    buildDom() {
      const s = this.svg;
      s.innerHTML = '';
      const defs = svgEl('defs', {}, s);
      const pat = svgEl('pattern', { id: 'cf-grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
      svgEl('path', { d: 'M20 0 H0 V20', fill: 'none', 'stroke-width': 0.7, class: 'grid-ln' }, pat);
      const pat2 = svgEl('pattern', { id: 'cf-grid-dots', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
      svgEl('circle', { cx: 1.6, cy: 1.6, r: 1.1, class: 'grid-dot' }, pat2);
      const style = svgEl('style', {}, defs);
      style.textContent = `.grid-ln{stroke:var(--grid-line)} .grid-dot{fill:var(--grid-dot)}`;
      this.gridRect = svgEl('rect', { x: -40000, y: -40000, width: 80000, height: 80000, fill: 'url(#cf-grid-dots)' }, s);
      this.world = svgEl('g', {}, s);
      this.wiresLayer = svgEl('g', {}, this.world);
      this.compsLayer = svgEl('g', {}, this.world);
      this.fxLayer = svgEl('g', { 'pointer-events': 'none' }, this.world);
      this.applyView();
    }
    applyView() {
      const { x, y, z } = this.view;
      this.world.setAttribute('transform', `translate(${x},${y}) scale(${z})`);
      const pat = this.svg.querySelector('#cf-grid-dots');
      if (pat) pat.setAttribute('patternTransform', `translate(${x},${y}) scale(${z})`);
    }
    viewportCenter() {
      const r = this.svg.getBoundingClientRect();
      const w = r.width || 800, h = r.height || 520, z = this.view.z > 0 ? this.view.z : 1;
      return { x: (w / 2 - this.view.x) / z, y: (h / 2 - this.view.y) / z };
    }
    toWorld(cx, cy) {
      const r = this.svg.getBoundingClientRect();
      const z = this.view.z > 0 ? this.view.z : 1;
      if (!isFiniteNum(cx) || !isFiniteNum(cy) || !r.width || !r.height) return this.viewportCenter();
      const p = { x: (+cx - r.left - this.view.x) / z, y: (+cy - r.top - this.view.y) / z };
      return isFiniteNum(p.x) && isFiniteNum(p.y) ? p : this.viewportCenter();
    }
    toScreen(wx, wy) {
      const r = this.svg.getBoundingClientRect();
      return { x: wx * this.view.z + this.view.x + r.left, y: wy * this.view.z + this.view.y + r.top };
    }

    /* ---------- doc io ---------- */
    setDoc(doc) {
      this.disposeComponents(this.doc.components || []);
      this.doc = { components: doc.components || [], wires: doc.wires || [] };
      const fixed = this.sanitizeDoc(this.doc);
      this.selection.clear(); this.selWires.clear();
      this.undoStack = []; this.redoStack = [];
      this.renderAll();
      if (doc.viewport) {
        this.view = Object.assign({}, doc.viewport);
        if (!isFiniteNum(this.view.x) || !isFiniteNum(this.view.y) || !isFiniteNum(this.view.z) || this.view.z <= 0) this.view = { x: 60, y: 40, z: 1 };
        this.applyView();
      }
      if (fixed) CS.toast(`Fixed ${fixed} component${fixed > 1 ? 's' : ''} with an invalid position`, 'warn', 2600);
    }
    applyPropDefaults(c) { const d = CS.defs[c.type]; if (d && d.props) d.props.forEach(p => { if (c.props[p.key] === undefined) c.props[p.key] = p.def && p.def.slice ? p.def.slice() : p.def !== undefined ? p.def : (p.type === 'bool' ? false : 0); }); }
    disposeComponents(comps) {
      (comps || []).forEach(c => {
        try { const d = CS.defs[c.type]; if (d && d.dispose) d.dispose(c); } catch (e) { console.warn('dispose failed', e); }
        if (c && c.state && c.state.mockTimer) { clearInterval(c.state.mockTimer); c.state.mockTimer = null; }
      });
    }
    repairInvalidPositions(doc, resetState) {
      let fixed = 0; const ctr = this.viewportCenter();
      (doc.components || []).forEach((c, i) => {
        c.props = c.props || {}; if (resetState) c.state = {}; this.applyPropDefaults(c);
        if (!isFiniteNum(c.x) || !isFiniteNum(c.y)) { c.x = ctr.x + (i % 6) * 28; c.y = ctr.y + Math.floor(i / 6) * 28; fixed++; }
        else { c.x = +c.x; c.y = +c.y; }
        c.r = isFiniteNum(c.r) ? ((+c.r % 360) + 360) % 360 : 0;
        c.flipX = !!c.flipX; c.flipY = !!c.flipY; c.locked = !!c.locked;
        if (c.groupId != null) c.groupId = String(c.groupId);
      });
      return fixed;
    }
    sanitizeDoc(doc) {
      const fixed = this.repairInvalidPositions(doc, true);
      (doc.components || []).forEach(c => { c.state = c.state || {}; });
      (doc.wires || []).forEach(w => {
        if (!Array.isArray(w.points) && Array.isArray(w.waypoints)) w.points = w.waypoints;
        if (Array.isArray(w.points)) w.points = w.points.filter(p => isFiniteNum(p.x) && isFiniteNum(p.y)).map(p => ({ x: +p.x, y: +p.y }));
        else delete w.points;
        if (w.label == null) w.label = '';
        if (w.style && !['ortho', 'smooth'].includes(w.style)) delete w.style;
      });
      return fixed;
    }
    snapshot() {
      return JSON.parse(JSON.stringify({
        components: this.doc.components.map(c => ({ id: c.id, type: c.type, x: toFinite(c.x), y: toFinite(c.y), r: toFinite(c.r), props: c.props, label: c.label || '', locked: !!c.locked, groupId: c.groupId || '', flipX: !!c.flipX, flipY: !!c.flipY })).map(c => { if (!c.locked) delete c.locked; if (!c.groupId) delete c.groupId; if (!c.flipX) delete c.flipX; if (!c.flipY) delete c.flipY; return c; }),
        wires: this.doc.wires.map(w => ({ id: w.id, a: w.a, b: w.b, color: w.color, label: w.label || '', style: w.style || '', points: Array.isArray(w.points) ? w.points.map(p => ({ x: toFinite(p.x), y: toFinite(p.y) })) : undefined })).map(w => { if (!w.points) delete w.points; if (!w.style) delete w.style; if (!w.label) delete w.label; return w; })
      }));
    }
    getDoc() { return { components: this.snapshot().components, wires: this.snapshot().wires, viewport: Object.assign({}, this.view) }; }
    pushUndo() { this.undoStack.push(JSON.stringify(this.snapshot())); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack.length = 0; CS.bus.emit('undoState'); }
    undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.snapshot())); this.restore(this.undoStack.pop()); }
    redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.snapshot())); this.restore(this.redoStack.pop()); }
    restore(s) {
      this.disposeComponents(this.doc.components || []);
      const d = JSON.parse(s);
      this.doc = d;
      const fixed = this.sanitizeDoc(this.doc);
      this.selection.clear(); this.selWires.clear();
      this.renderAll(); this.changed(); CS.bus.emit('undoState');
      if (fixed) CS.toast(`Fixed ${fixed} component${fixed > 1 ? 's' : ''} with an invalid position`, 'warn', 2600);
    }
    changed() { this._drcProblems = this.scanDRCProblems(); CS.bus.emit('docChanged'); CS.bus.emit('drcUpdate', this._drcProblems); }
    emitSelection() { CS.bus.emit('selectionChanged'); }

    /* ---------- rendering ---------- */
    defOf(c) { return CS.defs[c.type] || null; }
    renderAll() {
      this.wiresLayer.innerHTML = '';
      this.compsLayer.innerHTML = '';
      this.doc.wires.forEach(w => this.renderWire(w));
      this.doc.components.forEach(c => this.renderComp(c));
      this.renderJunctions();
      CS.bus.emit('canvasRendered');
    }
    compById(id) { return this.doc.components.find(c => c.id === id); }
    wireById(id) { return this.doc.wires.find(w => w.id === id); }

    renderComp(c) {
      const def = this.defOf(c); if (!def) return null;
      let g = c._g && c._g.isConnected ? c._g : null;
      if (!g) {
        g = svgEl('g', { class: 'comp', 'data-id': c.id }, this.compsLayer);
        c._g = g;
        g.addEventListener('pointerdown', e => this.onCompDown(e, c));
        g.addEventListener('pointerenter', () => { if (!this.dragging && !this.wiring) g.classList.add('hover'); });
        g.addEventListener('pointerleave', () => g.classList.remove('hover'));
        g.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); this.compMenu(e, c); });
      }
      this.applyCompTransform(c, g);
      this.paintComp(c, def, g);
      return g;
    }
    applyCompTransform(c, g) {
      const def = this.defOf(c); if (!def || !g) return;
      const cx = def.w / 2, cy = def.h / 2, sx = c.flipX ? -1 : 1, sy = c.flipY ? -1 : 1;
      g.setAttribute('transform', `translate(${toFinite(c.x)},${toFinite(c.y)}) rotate(${toFinite(c.r)},${cx},${cy}) translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})`);
    }
    paintComp(c, def, g) {
      let html = '';
      html += `<rect class="sel-ring" x="-7" y="-7" width="${def.w + 14}" height="${def.h + 14}" rx="10"/>`;
      html += def.render(def, c);
      if (c.groupId) html += `<rect class="group-ring" x="-3" y="-3" width="${def.w + 6}" height="${def.h + 6}" rx="8"/>`;
      if (c.groupId) html += `<text class="group-glyph" x="8" y="12">⧉</text>`;
      if (c.locked) html += `<text class="lock-glyph" x="${def.w - 8}" y="12" text-anchor="end">🔒</text>`;
      g.innerHTML = html;
      // hooks for cheap partial updates
      c._k = {};
      g.querySelectorAll('[data-k]').forEach(el => { c._k[el.getAttribute('data-k')] = el; });
      // pins: small visible dots + large invisible hit/drop circles.
      for (const p of def.pins) {
        const t = this.pinLocal(c, p);
        const hit = svgEl('circle', { class: 'pin-hit', cx: t.x, cy: t.y, r: this.pinHitRadius, 'data-pin': p.id, 'data-comp': c.id }, g);
        const circle = svgEl('circle', { class: 'pin', cx: t.x, cy: t.y, r: 4, 'data-pin': p.id, 'data-comp': c.id, opacity: 0.92 }, g);
        const bind = el => {
          el.addEventListener('pointerdown', e => { e.stopPropagation(); if (this.probeMode) this.probePin(c, p); else this.wiring ? this.finishWireAt(e, c, p) : this.startWire(e, c, p); });
          el.addEventListener('pointerenter', e => this.showPinTip(e, c, p));
          el.addEventListener('pointerleave', () => this.hidePinTip());
          el.addEventListener('pointerup', e => { if (this.wiring) { e.stopPropagation(); this.finishWireAt(e, c, p); } });
        };
        bind(hit); bind(circle);
      }
      if (this.selection.has(c.id)) g.classList.add('selected');
      if (def.afterRender) def.afterRender(c, g);
    }
    updateComp(id) {
      const c = this.compById(id); if (!c || !c._g) return;
      const def = this.defOf(c);
      this.applyCompTransform(c, c._g);
      this.paintComp(c, def, c._g);
      if (this.selection.has(id)) c._g.classList.add('selected'); else c._g.classList.remove('selected');
    }
    // pin local position accounts for rotation? pins rotate WITH the group since they're drawn inside <g> with rotate().
    pinLocal(c, pin) { return { x: pin.x, y: pin.y }; }
    pinWorld(comp, pinId) {
      const def = this.defOf(comp); const p = def.pins.find(x => x.id === pinId); if (!p) return null;
      const cx = def.w / 2, cy = def.h / 2, a = (comp.r || 0) * Math.PI / 180;
      const dx = p.x - cx, dy = p.y - cy;
      return { x: comp.x + cx + dx * Math.cos(a) - dy * Math.sin(a), y: comp.y + cy + dx * Math.sin(a) + dy * Math.cos(a) };
    }

    renderWire(w) {
      const g = svgEl('g', { class: 'wire', 'data-id': w.id }, this.wiresLayer);
      const d = this.wirePath(w);
      const hit = svgEl('path', { class: 'wire-hit', d }, g);
      const pg = svgEl('path', { class: 'wire-path', d, stroke: w.color || '#64748b', 'stroke-width': 2.4 }, g);
      const flow = svgEl('path', { class: 'wire-flow hidden', d }, g);
      hit.addEventListener('pointerdown', e => { e.stopPropagation(); this.startWireBend(e, w); });
      hit.addEventListener('pointerenter', () => this.showWireEndpointHints(w));
      hit.addEventListener('pointerleave', () => this.hideWireEndpointHints());
      hit.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); this.wireMenu(e, w); });
      w._g = g; w._path = pg; w._flow = flow; w._hit = hit;
      this.renderWireLabel(w);
      if (this.selWires.has(w.id)) g.classList.add('selected');
      this.renderWireHandles(w, g);
      return g;
    }
    wirePoints(w, bOverride) {
      const a = this.pinWorld(this.compById(w.a.c), w.a.p);
      const b = bOverride || this.pinWorld(this.compById(w.b.c), w.b.p);
      if (!a || !b) return [];
      if (Array.isArray(w.points) && w.points.length && !bOverride) return [a, ...w.points.map(p => ({ x: p.x, y: p.y })), b];
      return pointsOf(a, b);
    }
    wirePath(w, bOverride) {
      const pts = this.wirePoints(w, bOverride);
      if (pts.length < 2) return '';
      const routed = bOverride ? pts : this.offsetWirePoints(w, pts);
      return (w.style || this.wireStyle) === 'smooth' ? smoothPath(routed) : roundedPath(routed);
    }
    offsetWirePoints(w, pts) {
      if (!pts || pts.length < 3) return pts;
      const sigs = pps => {
        const out = [];
        for (let i = 0; i < pps.length - 1; i++) {
          const a = pps[i], b = pps[i + 1];
          if (Math.abs(a.x - b.x) < 2) out.push('V:' + Math.round(a.x / 10) + ':' + Math.round(Math.min(a.y, b.y) / 10) + ':' + Math.round(Math.max(a.y, b.y) / 10));
          else if (Math.abs(a.y - b.y) < 2) out.push('H:' + Math.round(a.y / 10) + ':' + Math.round(Math.min(a.x, b.x) / 10) + ':' + Math.round(Math.max(a.x, b.x) / 10));
        }
        return out;
      };
      const mine = sigs(pts); if (!mine.length) return pts;
      const bundle = this.doc.wires.filter(x => {
        if (x === w) return true;
        const xp = this.wirePoints(x); const xs = sigs(xp);
        return xs.some(s => mine.includes(s));
      });
      if (bundle.length < 2) return pts;
      const idx = Math.max(0, bundle.findIndex(x => x === w));
      const off = (idx - (bundle.length - 1) / 2) * 5;
      if (Math.abs(off) < 0.1) return pts;
      const firstSeg = pts.find((p, i) => i < pts.length - 1 && (Math.abs(pts[i + 1].x - p.x) > 2 || Math.abs(pts[i + 1].y - p.y) > 2));
      const j = firstSeg ? pts.indexOf(firstSeg) : 0;
      const horizontal = Math.abs(pts[j + 1].x - pts[j].x) >= Math.abs(pts[j + 1].y - pts[j].y);
      return pts.map((p, i) => i === 0 || i === pts.length - 1 ? p : (horizontal ? { x: p.x, y: p.y + off } : { x: p.x + off, y: p.y }));
    }
    refreshWire(w) {
      const d = this.wirePath(w);
      if (w._path) {
        w._path.setAttribute('d', d); w._flow.setAttribute('d', d); w._hit.setAttribute('d', d);
        this.renderWireLabel(w); this.renderWireHandles(w, w._g);
      }
    }
    refreshAllWires() { this.doc.wires.forEach(w => this.refreshWire(w)); }
    renderWireLabel(w) {
      if (!w._g) return;
      if (w._label) { w._label.remove(); w._label = null; }
      if (!w.label) return;
      const pts = this.wirePoints(w); if (!pts.length) return;
      const p = pts[Math.floor(pts.length / 2)];
      const t = svgEl('text', { class: 'wire-label', x: p.x + 7, y: p.y - 7 }, w._g);
      t.textContent = w.label;
      w._label = t;
    }
    renderWireHandles(w, g) {
      if (!g) return;
      g.querySelectorAll('.wire-waypoint').forEach(el => el.remove());
      if (!this.selWires.has(w.id) || !Array.isArray(w.points)) return;
      w.points.forEach((p, i) => {
        const h = svgEl('circle', { class: 'wire-waypoint', cx: p.x, cy: p.y, r: 5, 'data-wp': i }, g);
        h.addEventListener('pointerdown', e => { e.stopPropagation(); this.startWireBend(e, w, i); });
        h.addEventListener('dblclick', e => { e.stopPropagation(); this.pushUndo(); w.points.splice(i, 1); this.refreshWire(w); this.changed(); });
      });
    }
    refreshWiresFor(compId) { this.doc.wires.forEach(w => { if (w.a.c === compId || w.b.c === compId) this.refreshWire(w); }); }
    showWireEndpointHints(w) {
      this.hideWireEndpointHints();
      if (w._g) this.wiresLayer.appendChild(w._g);
      this.wiresLayer.querySelectorAll('.wire').forEach(g => g.classList.toggle('dim', g !== w._g));
      w._g && w._g.classList.add('hover');
      const mk = ref => {
        const c = this.compById(ref.c), pt = this.pinWorld(c, ref.p); if (!c || !pt) return;
        this.setPinSnapClass(ref.c, ref.p, true, false);
        const d = this.defOf(c);
        const g = svgEl('g', { class: 'wire-end-hint' }, this.fxLayer);
        svgEl('circle', { cx: pt.x, cy: pt.y, r: 8, fill: 'none', stroke: w.color || '#4ade80', 'stroke-width': 2 }, g);
        const t = svgEl('text', { x: pt.x + 10, y: pt.y - 8 }, g);
        t.textContent = `${c.label || d.name} · ${ref.p}`;
        this.wireHintEls.push(g);
      };
      this.wireHintEls = [];
      mk(w.a); mk(w.b);
    }
    hideWireEndpointHints() {
      (this.wireHintEls || []).forEach(el => el.remove()); this.wireHintEls = [];
      this.wiresLayer.querySelectorAll('.wire.dim,.wire.hover').forEach(g => g.classList.remove('dim', 'hover'));
      this.svg.querySelectorAll('.snap-ok,.hot').forEach(el => el.classList.remove('snap-ok', 'hot'));
    }

    /* ---------- selection ---------- */
    clearSelection() { this.selection.clear(); this.selWires.clear(); this.compsLayer.querySelectorAll('.comp.selected').forEach(g => g.classList.remove('selected')); this.wiresLayer.querySelectorAll('.wire.selected').forEach(g => g.classList.remove('selected')); this.wiresLayer.querySelectorAll('.wire-waypoint').forEach(g => g.remove()); this.emitSelection(); }
    select(e, c) {
      const ids = new Set([c.id]);
      if (c.groupId) this.doc.components.forEach(cc => { if (cc.groupId === c.groupId) ids.add(cc.id); });
      if (e.shiftKey) ids.forEach(id => this.selection.has(id) ? this.selection.delete(id) : this.selection.add(id));
      else { if (![...ids].some(id => this.selection.has(id))) { this.selection.clear(); this.selWires.clear(); this.wiresLayer.querySelectorAll('.wire.selected').forEach(g => g.classList.remove('selected')); this.wiresLayer.querySelectorAll('.wire-waypoint').forEach(g => g.remove()); } ids.forEach(id => this.selection.add(id)); }
      this.syncSelectionClasses();
    }
    selectWire(e, w) {
      if (e.shiftKey) { this.selWires.has(w.id) ? this.selWires.delete(w.id) : this.selWires.add(w.id); }
      else { this.selection.clear(); this.selWires.clear(); this.selWires.add(w.id); this.compsLayer.querySelectorAll('.comp.selected').forEach(g => g.classList.remove('selected')); }
      this.wiresLayer.querySelectorAll('.wire').forEach(g => g.classList.toggle('selected', this.selWires.has(g.getAttribute('data-id'))));
      this.doc.wires.forEach(x => this.renderWireHandles(x, x._g));
      this.emitSelection();
    }
    selectAll() { this.selection = new Set(this.doc.components.map(c => c.id)); this.selWires = new Set(this.doc.wires.map(w => w.id)); this.renderAll(); this.emitSelection(); }

    /* ---------- mutations ---------- */
    activeComponentIds(seed = this.selection) {
      const out = new Set(seed);
      [...seed].forEach(id => {
        const c = this.compById(id);
        if (c && c.groupId) this.doc.components.forEach(cc => { if (cc.groupId === c.groupId) out.add(cc.id); });
      });
      return out;
    }
    unlockedIds(ids, action = 'edit') {
      const out = new Set(); let locked = 0;
      ids.forEach(id => { const c = this.compById(id); if (!c) return; if (c.locked) locked++; else out.add(id); });
      if (locked) CS.toast(`${locked} locked component${locked > 1 ? 's' : ''} skipped — unlock to ${action}`, 'warn', 1800);
      return out;
    }
    syncSelectionClasses() {
      this.compsLayer.querySelectorAll('.comp').forEach(g => g.classList.toggle('selected', this.selection.has(g.getAttribute('data-id'))));
      this.wiresLayer.querySelectorAll('.wire').forEach(g => g.classList.toggle('selected', this.selWires.has(g.getAttribute('data-id'))));
      this.doc.wires.forEach(w => this.renderWireHandles(w, w._g));
      this.emitSelection();
    }
    addComponent(type, x, y, silent) {
      const def = CS.defs[type]; if (!def) return null;
      if (!isFiniteNum(x) || !isFiniteNum(y)) {
        const ctr = this.viewportCenter(); x = ctr.x - def.w / 2; y = ctr.y - def.h / 2;
        CS.toast('Component dropped at the canvas center because the pointer position was invalid', 'warn', 1800);
      }
      if (this.snapGrid) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
      const c = { id: uid(9), type, x, y, r: 0, props: {}, label: '', state: {} };
      this.applyPropDefaults(c);
      if (type === 'bb_full' || type === 'bb_half') { c.x = Math.round(x / 13) * 13; }
      this.pushUndo();
      this.doc.components.push(c);
      const g = this.renderComp(c);
      if (g && !silent) { g.classList.add('drop-bounce'); setTimeout(() => g.classList.remove('drop-bounce'), 500); }
      this.clearSelection(); this.selection.add(c.id);
      c._g && c._g.classList.add('selected');
      this.changed(); this.emitSelection();
      return c;
    }
    clearCanvas() {
      if (!this.doc.components.length && !this.doc.wires.length) return;
      if (!confirm('Clear the entire canvas? This cannot be undone except with Undo.')) return;
      this.pushUndo(); this.disposeComponents(this.doc.components);
      this.doc.components = []; this.doc.wires = []; this.selection.clear(); this.selWires.clear();
      this.renderAll(); this.changed(); this.emitSelection();
    }
    deleteSelection() {
      if (!this.selection.size && !this.selWires.size) return;
      this.pushUndo();
      const ids = this.unlockedIds(this.activeComponentIds(), 'delete');
      if (ids.size > 3 && !confirm(`Delete ${ids.size} components${[...ids].some(id => (this.compById(id) || {}).groupId) ? ' (grouped)' : ''}?`)) return;
      const removed = this.doc.components.filter(c => ids.has(c.id));
      this.disposeComponents(removed);
      this.doc.components = this.doc.components.filter(c => !ids.has(c.id));
      this.doc.wires = this.doc.wires.filter(w => !ids.has(w.a.c) && !ids.has(w.b.c) && !this.selWires.has(w.id));
      this.selection.clear(); this.selWires.clear();
      this.renderAll(); this.changed(); this.emitSelection();
    }
    rotateSelection(delta = 90) {
      const ids = this.unlockedIds(this.activeComponentIds(), 'rotate');
      if (!ids.size) return;
      this.pushUndo();
      ids.forEach(id => { const c = this.compById(id); c.r = (((c.r || 0) + delta) % 360 + 360) % 360; this.applyCompTransform(c, c._g); this.refreshWiresFor(id); });
      this.changed();
    }
    flipSelection(axis) {
      const ids = this.unlockedIds(this.activeComponentIds(), 'flip'); if (!ids.size) return;
      this.pushUndo();
      ids.forEach(id => { const c = this.compById(id); if (axis === 'x') c.flipX = !c.flipX; else c.flipY = !c.flipY; this.applyCompTransform(c, c._g); this.refreshWiresFor(id); });
      this.changed();
    }
    setLockedSelection(on) {
      const ids = this.activeComponentIds(); if (!ids.size) return;
      this.pushUndo(); ids.forEach(id => { const c = this.compById(id); if (c) { c.locked = !!on; this.updateComp(id); } });
      this.changed(); this.emitSelection();
    }
    groupSelection() {
      if (this.selection.size < 2) return CS.toast('Select at least 2 components to group', 'warn');
      this.pushUndo(); const gid = 'grp_' + uid(6); this.activeComponentIds().forEach(id => { const c = this.compById(id); if (c) c.groupId = gid; });
      this.changed(); CS.toast('Grouped selection', 'ok', 1200);
    }
    ungroupSelection() {
      const ids = this.activeComponentIds(); if (!ids.size) return;
      this.pushUndo(); ids.forEach(id => { const c = this.compById(id); if (c) delete c.groupId; });
      this.changed(); CS.toast('Ungrouped selection', 'ok', 1200);
    }
    selectAllOfType(type) {
      this.selection = new Set(this.doc.components.filter(c => c.type === type).map(c => c.id));
      this.selWires.clear(); this.syncSelectionClasses();
    }
    copySelection(cut) {
      if (!this.selection.size && !this.selWires.size) { CS.toast('Nothing selected to copy', 'warn', 1200); return false; }
      const compIds = this.activeComponentIds();
      const comps = this.doc.components.filter(c => compIds.has(c.id));
      const wireIds = new Set(this.selWires);
      this.doc.wires.forEach(w => { if (compIds.has(w.a.c) && compIds.has(w.b.c)) wireIds.add(w.id); });
      const wires = this.doc.wires.filter(w => wireIds.has(w.id));
      this.clipboard = JSON.parse(JSON.stringify({
        components: comps.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, r: c.r, props: c.props, label: c.label, locked: false, groupId: c.groupId || '', flipX: !!c.flipX, flipY: !!c.flipY })),
        wires
      }));
      if (cut) this.deleteSelection();
      else CS.toast(`${comps.length ? comps.length + ' component' + (comps.length > 1 ? 's' : '') : ''}${comps.length && wires.length ? ' + ' : ''}${wires.length ? wires.length + ' wire' + (wires.length > 1 ? 's' : '') : ''} copied`, 'ok', 1500);
      return true;
    }
    paste() {
      if (!this.clipboard) return CS.toast('Clipboard is empty', 'warn', 1200);
      const ctr = this.viewportCenter(); return this.pasteAt(ctr.x + 26, ctr.y + 26);
    }
    duplicate() { const tmp = this.clipboard; if (!this.copySelection()) return; this.paste(); this.clipboard = tmp; }
    pasteAt(x, y) {
      if (!this.clipboard) return false;
      this.pushUndo();
      const comps0 = this.clipboard.components || [];
      const wires0 = this.clipboard.wires || [];
      const map = {}, added = [], addedWires = [];
      let dx = 26, dy = 26;
      if (comps0.length) {
        const minX = Math.min(...comps0.map(c => c.x)), minY = Math.min(...comps0.map(c => c.y));
        const maxX = Math.max(...comps0.map(c => c.x + ((CS.defs[c.type] || {}).w || 0))), maxY = Math.max(...comps0.map(c => c.y + ((CS.defs[c.type] || {}).h || 0)));
        dx = x - (minX + (maxX - minX) / 2); dy = y - (minY + (maxY - minY) / 2);
      }
      const groupMap = {};
      comps0.forEach(cc => {
        if (cc.groupId && !groupMap[cc.groupId]) groupMap[cc.groupId] = 'grp_' + uid(6);
        const c = { id: uid(9), type: cc.type, x: toFinite(cc.x) + dx, y: toFinite(cc.y) + dy, r: toFinite(cc.r), props: JSON.parse(JSON.stringify(cc.props || {})), label: cc.label || '', state: {}, flipX: !!cc.flipX, flipY: !!cc.flipY, groupId: cc.groupId ? groupMap[cc.groupId] : undefined };
        map[cc.id] = c.id; this.doc.components.push(c); added.push(c);
      });
      wires0.forEach(w => {
        const hasMapped = map[w.a.c] && map[w.b.c];
        const nw = { id: uid(9), a: { c: map[w.a.c] || w.a.c, p: w.a.p }, b: { c: map[w.b.c] || w.b.c, p: w.b.p }, color: w.color, label: w.label || '', style: w.style || '', points: Array.isArray(w.points) ? w.points.map(p => ({ x: toFinite(p.x) + (hasMapped ? dx : 26), y: toFinite(p.y) + (hasMapped ? dy : 26) })) : undefined };
        this.doc.wires.push(nw); addedWires.push(nw);
      });
      this.renderAll(); this.selection = new Set(added.map(c => c.id)); this.selWires = new Set(addedWires.map(w => w.id)); this.syncSelectionClasses();
      this.changed();
      return true;
    }
    boundsOf(c) { const d = this.defOf(c); return { x: c.x, y: c.y, w: d.w, h: d.h, cx: c.x + d.w / 2, cy: c.y + d.h / 2 }; }
    alignSelection(mode) {
      const ids = this.unlockedIds(this.activeComponentIds(), 'align');
      const items = [...ids].map(id => this.compById(id)).filter(Boolean); if (items.length < 2) return CS.toast('Select at least 2 components', 'warn');
      this.pushUndo(); const bs = items.map(c => this.boundsOf(c));
      const minX = Math.min(...bs.map(b => b.x)), maxR = Math.max(...bs.map(b => b.x + b.w)), minY = Math.min(...bs.map(b => b.y)), maxB = Math.max(...bs.map(b => b.y + b.h));
      const avgX = bs.reduce((a, b) => a + b.cx, 0) / bs.length, avgY = bs.reduce((a, b) => a + b.cy, 0) / bs.length;
      items.forEach(c => {
        const b = this.boundsOf(c);
        if (mode === 'left') c.x = minX;
        else if (mode === 'right') c.x = maxR - b.w;
        else if (mode === 'hcenter') c.x = avgX - b.w / 2;
        else if (mode === 'top') c.y = minY;
        else if (mode === 'bottom') c.y = maxB - b.h;
        else if (mode === 'vcenter') c.y = avgY - b.h / 2;
        this.applyCompTransform(c, c._g); this.refreshWiresFor(c.id);
      });
      this.changed(); CS.toast('Aligned selection', 'ok', 1000);
    }
    distributeSelection(axis) {
      const ids = this.unlockedIds(this.activeComponentIds(), 'distribute');
      const items = [...ids].map(id => this.compById(id)).filter(Boolean); if (items.length < 3) return CS.toast('Select at least 3 components', 'warn');
      this.pushUndo();
      const arr = items.map(c => ({ c, b: this.boundsOf(c) })).sort((a, b) => axis === 'x' ? a.b.cx - b.b.cx : a.b.cy - b.b.cy);
      const first = axis === 'x' ? arr[0].b.cx : arr[0].b.cy, last = axis === 'x' ? arr[arr.length - 1].b.cx : arr[arr.length - 1].b.cy;
      const step = (last - first) / (arr.length - 1);
      arr.forEach((it, i) => { if (axis === 'x') it.c.x = first + step * i - it.b.w / 2; else it.c.y = first + step * i - it.b.h / 2; this.applyCompTransform(it.c, it.c._g); this.refreshWiresFor(it.c.id); });
      this.changed(); CS.toast('Distributed selection', 'ok', 1000);
    }
    moveSelectionOrder(dir) {
      const ids = this.unlockedIds(this.activeComponentIds(), 'reorder');
      if (!ids.size) return;
      this.pushUndo();
      const arr = this.doc.components;
      if (dir === 'front' || dir === 'back') {
        const selected = [], other = [];
        arr.forEach(c => (ids.has(c.id) ? selected : other).push(c));
        this.doc.components = dir === 'front' ? other.concat(selected) : selected.concat(other);
      } else {
        const step = dir === 'forward' ? 1 : -1;
        const list = step > 0 ? [...arr.keys()].reverse() : [...arr.keys()];
        list.forEach(i => {
          const j = i + step;
          if (ids.has(arr[i].id) && arr[j] && !ids.has(arr[j].id)) [arr[i], arr[j]] = [arr[j], arr[i]];
        });
      }
      this.renderAll(); this.changed(); this.syncSelectionClasses();
    }
    clearWireBends() { if (!this.doc.wires.length) return; this.pushUndo(); this.doc.wires.forEach(w => { w.points = []; }); this.refreshAllWires(); this.changed(); CS.toast('Wire bend points cleared', 'ok', 1200); }

    /* ---------- touch gestures / long press ---------- */
    cancelLongPress() { if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; } }
    contextAtEvent(e) {
      const compEl = e.target.closest && e.target.closest('.comp');
      const wireEl = e.target.closest && e.target.closest('.wire');
      if (wireEl) { const w = this.wireById(wireEl.getAttribute('data-id')); if (w) return this.wireMenu(e, w); }
      if (compEl) { const c = this.compById(compEl.getAttribute('data-id')); if (c) return this.compMenu(e, c); }
      return this.canvasMenu(e);
    }
    touchDown(e) {
      if (e.pointerType === 'mouse') return;
      this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      if (this.touchPointers.size === 1) {
        this.cancelLongPress();
        this.longPressTimer = setTimeout(() => { this.cancelWire(); this.contextAtEvent(e); }, 560);
      } else if (this.touchPointers.size === 2) {
        this.cancelLongPress(); this.dragging = null; this.marquee && this.marqueeEl && this.marqueeEl.remove(); this.marquee = null;
        const pts = [...this.touchPointers.values()], c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        this.touchGesture = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, cx: c.x, cy: c.y, vx: this.view.x, vy: this.view.y, vz: this.view.z };
      }
    }
    touchMove(e) {
      if (e.pointerType === 'mouse' || !this.touchPointers.has(e.pointerId)) return;
      const p = this.touchPointers.get(e.pointerId); p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) this.cancelLongPress();
      if (this.touchPointers.size >= 2 && this.touchGesture) {
        e.preventDefault();
        const pts = [...this.touchPointers.values()].slice(0, 2), c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const z = clamp(this.touchGesture.vz * (dist / this.touchGesture.dist), 0.25, 3);
        const r = this.svg.getBoundingClientRect();
        const mx = c.x - r.left, my = c.y - r.top, mx0 = this.touchGesture.cx - r.left, my0 = this.touchGesture.cy - r.top;
        this.view.x = mx - (mx0 - this.touchGesture.vx) * (z / this.touchGesture.vz);
        this.view.y = my - (my0 - this.touchGesture.vy) * (z / this.touchGesture.vz);
        this.view.z = z; this.applyView(); CS.bus.emit('viewChanged');
      }
    }
    touchUp(e) { if (e.pointerType === 'mouse') return; this.touchPointers.delete(e.pointerId); if (this.touchPointers.size < 2) this.touchGesture = null; this.cancelLongPress(); }

    /* ---------- pointer interactions ---------- */
    bindEvents() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', e => this.touchDown(e), { capture: true });
      svg.addEventListener('pointermove', e => this.touchMove(e), { passive: false, capture: true });
      window.addEventListener('pointerup', e => this.touchUp(e), { capture: true });
      window.addEventListener('pointercancel', e => this.touchUp(e), { capture: true });
      svg.addEventListener('pointerdown', e => {
        if (this.touchGesture && e.pointerType !== 'mouse') return;
        if (this.readOnly) return;
        this.hidePinTip();
        if (this.wiring) return;
        if (e.target === svg || e.target === this.gridRect) {
          if (e.button === 2) return; // right-click opens the canvas menu via contextmenu
          if (e.button === 1 || this.spaceHeld) { this.startPan(e); }
          else { this.startMarquee(e); }
        }
      });
      let moveRAF = null;
      svg.addEventListener('pointermove', e => {
        if (moveRAF) return;
        moveRAF = requestAnimationFrame(() => {
          this.onMove(e);
          moveRAF = null;
        });
      });
      window.addEventListener('pointerup', e => this.onUp(e));
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd+scroll = zoom (trackpad pinch also reports ctrlKey) — anchored at cursor
          const factor = Math.exp(-e.deltaY * 0.0012);
          const z = clamp(this.view.z * factor, 0.25, 3);
          const mx = e.clientX - r.left, my = e.clientY - r.top;
          this.view.x = mx - (mx - this.view.x) * (z / this.view.z);
          this.view.y = my - (my - this.view.y) * (z / this.view.z);
          this.view.z = z;
        } else {
          // plain scroll = pan (two-finger trackpad scroll lands here); Shift+scroll pans sideways
          const step = e.deltaMode === 1 ? 16 : 1; // line-mode mice (Firefox) → px
          if (e.shiftKey) { this.view.x -= e.deltaY * step; this.view.y -= e.deltaX * step; }
          else { this.view.x -= e.deltaX * step; this.view.y -= e.deltaY * step; }
        }
        requestAnimationFrame(() => { this.applyView(); CS.bus.emit('viewChanged'); });
      }, { passive: false });
      svg.addEventListener('contextmenu', e => { e.preventDefault(); if (e.target === svg || e.target === this.gridRect) this.canvasMenu(e); });
      // drag & drop from library
      svg.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      svg.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('cf/type');
        if (!type) return;
        const p = this.toWorld(e.clientX, e.clientY);
        const def = CS.defs[type];
        this.addComponent(type, p.x - def.w / 2, p.y - def.h / 2);
      });
      // keyboard
      window.addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], .code-editor, .modal-back') && e.key !== 'Escape') return;
        const k = e.key;
        if (k === ' ') { this.spaceHeld = true; this.svg.style.cursor = 'grab'; if (e.target === this.svg || e.target === document.body) e.preventDefault(); }
        if (this.readOnly) return;
        if (k === 'Delete' || k === 'Backspace') { if (!e.target.matches('input,textarea')) this.deleteSelection(); }
        else if (k === 'r' || k === 'R') this.rotateSelection();
        else if (k === 'f' || k === 'F') this.zoomFit();
        else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
        else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'c') { this.copySelection(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'x') { this.copySelection(true); }
        else if ((e.ctrlKey || e.metaKey) && k === 'v') { this.paste(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); this.duplicate(); }
        else if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); this.selectAll(); }
        else if ((e.ctrlKey || e.metaKey) && (k === ']' || k === '[')) { e.preventDefault(); this.moveSelectionOrder(k === ']' ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward')); }
        else if (k === 'Escape') { this.cancelWire(); this.clearSelection(); this.emitSelection(); }
        else if (k.startsWith('Arrow') && this.selection.size) {
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          const ids = this.unlockedIds(this.activeComponentIds(), 'nudge'); if (!ids.size) return;
          this.pushUndo();
          const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0;
          const dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
          ids.forEach(id => { const c = this.compById(id); c.x += dx; c.y += dy; this.applyCompTransform(c, c._g); this.refreshWiresFor(id); });
          this.changed();
        } else if (k === '+' || k === '=') { this.zoomBy(1.2); } else if (k === '-') { this.zoomBy(1 / 1.2); }
      });
      window.addEventListener('keyup', e => { if (e.key === ' ') { this.spaceHeld = false; this.svg.style.cursor = ''; } });
      // pin hover while wiring: track element under pointer
      svg.addEventListener('pointerover', e => {
        if (this.wiring && e.target.classList && (e.target.classList.contains('pin') || e.target.classList.contains('pin-hit'))) this.setPinSnapClass(e.target.getAttribute('data-comp'), e.target.getAttribute('data-pin'), true);
      });
      svg.addEventListener('pointerout', e => { if (e.target.classList && (e.target.classList.contains('pin') || e.target.classList.contains('pin-hit'))) this.setPinSnapClass(e.target.getAttribute('data-comp'), e.target.getAttribute('data-pin'), false); });
    }
    zoomBy(f) {
      const r = this.svg.getBoundingClientRect();
      const mx = r.width / 2, my = r.height / 2;
      const z = clamp(this.view.z * f, 0.25, 3);
      this.view.x = mx - (mx - this.view.x) * (z / this.view.z);
      this.view.y = my - (my - this.view.y) * (z / this.view.z);
      this.view.z = z; this.applyView(); CS.bus.emit('viewChanged');
    }
    zoomFit() {
      if (!this.doc.components.length) { this.view = { x: 60, y: 40, z: 1 }; this.applyView(); CS.bus.emit('viewChanged'); return; }
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      this.doc.components.forEach(c => { const d = this.defOf(c); x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + d.w); y2 = Math.max(y2, c.y + d.h); });
      const r = this.svg.getBoundingClientRect();
      const z = clamp(Math.min((r.width - 80) / (x2 - x1), (r.height - 80) / (y2 - y1)), 0.25, 2.5);
      this.view.z = z;
      this.view.x = (r.width - (x2 - x1) * z) / 2 - x1 * z;
      this.view.y = (r.height - (y2 - y1) * z) / 2 - y1 * z;
      this.applyView(); CS.bus.emit('viewChanged');
    }

    startPan(e) { this.panning = { sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y }; this.svg.style.cursor = 'grabbing'; }
    startMarquee(e) {
      const p = this.toWorld(e.clientX, e.clientY);
      this.marquee = { x0: p.x, y0: p.y, additive: e.shiftKey };
      this.marqueeEl = svgEl('rect', { class: 'marquee' }, this.fxLayer);
      if (!e.shiftKey) this.clearSelection();
    }
    onCompDown(e, c) {
      e.stopPropagation();
      if (e.button === 2) return;
      // In read-only shared views, structural edits stay blocked but live controls
      // (buttons, switches, sliders, joysticks, RFID tap targets) still respond.
      const actEl = e.target.closest && e.target.closest('[data-act]');
      if (actEl) { this.handleAct(e, c, actEl); return; }
      if (this.readOnly) return;
      if (e.button === 1 || this.spaceHeld) { this.startPan(e); return; }
      if (this.wiring) return;
      this.select(e, c);
      // begin drag
      const p = this.toWorld(e.clientX, e.clientY);
      const ids = this.unlockedIds(this.activeComponentIds(), 'move');
      const items = [...ids].map(id => { const cc = this.compById(id); return { c: cc, ox: cc.x, oy: cc.y }; });
      if (!items.length) return;
      this.dragging = { start: p, items, moved: false, undoPushed: false };
      Array.from(this.selection).forEach(id => { const g = this.compById(id)._g; if (g) { g.classList.add('drag-ghost'); g.classList.add('dragging'); } });
    }
    handleAct(e, c, el) {
      const act = el.getAttribute('data-act');
      const dirty = () => { this.updateComp(c.id); };
      if (act === 'press') { c.state.pressed = true; dirty(); this.holdRelease = () => { c.state.pressed = false; dirty(); }; }
      else if (act === 'toggle') { c.props.on = !c.props.on; this.pushUndo(); dirty(); this.changed(); }
      else if (act === 'dip') { const i = +el.getAttribute('data-idx'); c.props.sw = c.props.sw || [false, false, false, false]; c.props.sw[i] = !c.props.sw[i]; this.pushUndo(); dirty(); this.changed(); }
      else if (act === 'key') { c.state.key = el.getAttribute('data-key'); dirty(); this.holdRelease = () => { c.state.key = null; dirty(); }; }
      else if (act === 'motion') { if (CS.sim) { c.state.motionUntil = CS.sim.now + 2000; dirty(); } }
      else if (act === 'tap') { c.state.uid = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'); dirty(); CS.toast('Card tapped: ' + c.state.uid, 'ok', 2000); }
      else if (act === 'knob') {
        c.state.knobDrag = { x0: e.clientX, v0: +(c.props.value ?? 0.5), p0: +(c.props.pos || 0), type: c.type };
        this.holdRelease = () => { c.state.knobDrag = null; };
      }
      else if (act === 'stick') { c.state.stickDrag = true; this.holdRelease = () => { c.state.stickDrag = false; }; this.updateStick(e, c); }
      else if (act === 'slider') { c.state.sliderDrag = true; this.holdRelease = () => { c.state.sliderDrag = false; }; this.updateSlider(e, c); }
      e.stopPropagation();
    }
    updateStick(e, c) {
      const g = c._g.getBoundingClientRect();
      const cx = g.left + (43) * this.view.z, cy = g.top + (42) * this.view.z;
      c.props.x = clamp((e.clientX - cx) / (18 * this.view.z) * 0.5 + 0.5, 0, 1);
      c.props.y = clamp((e.clientY - cy) / (18 * this.view.z) * 0.5 + 0.5, 0, 1);
      this.updateComp(c.id);
    }
    updateSlider(e, c) {
      const g = c._g.getBoundingClientRect();
      const localY = (e.clientY - g.top) / this.view.z;
      c.props.value = clamp(1 - (localY - 26) / 58, 0, 1);
      this.updateComp(c.id);
    }

    onMove(e) {
      if (this.touchGesture && e.pointerType !== 'mouse') return;
      if (this.panning) {
        this.view.x = this.panning.vx + e.clientX - this.panning.sx;
        this.view.y = this.panning.vy + e.clientY - this.panning.sy;
        this.applyView(); CS.bus.emit('viewChanged');
        return;
      }
      if (this.marquee) {
        const p = this.toWorld(e.clientX, e.clientY);
        const x = Math.min(p.x, this.marquee.x0), y = Math.min(p.y, this.marquee.y0);
        const w = Math.abs(p.x - this.marquee.x0), h = Math.abs(p.y - this.marquee.y0);
        this.marqueeEl.setAttribute('x', x); this.marqueeEl.setAttribute('y', y);
        this.marqueeEl.setAttribute('width', w); this.marqueeEl.setAttribute('height', h);
        return;
      }
      if (this.endpointDrag) {
        this.updateEndpointDrag(e);
        return;
      }
      if (this.wireDrag) {
        const p = this.toWorld(e.clientX, e.clientY);
        let x = p.x, y = p.y;
        if (this.snapGrid && !e.altKey) { x = Math.round(x / 10) * 10; y = Math.round(y / 10) * 10; }
        const dx = x - this.wireDrag.start.x, dy = y - this.wireDrag.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 2 && !this.wireDrag.undoPushed) { this.pushUndo(); this.wireDrag.undoPushed = true; this.wireDrag.moved = true; }
        this.wireDrag.w.points[this.wireDrag.index] = { x, y };
        this.refreshWire(this.wireDrag.w);
        return;
      }
      if (this.dragging) {
        const p = this.toWorld(e.clientX, e.clientY);
        let dx = p.x - this.dragging.start.x, dy = p.y - this.dragging.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 2 && !this.dragging.undoPushed) { this.pushUndo(); this.dragging.undoPushed = true; this.dragging.moved = true; }
        if (!this.dragging.moved) return;
        // alignment guides (primary = first item)
        this.clearGuides();
        if (!e.altKey) {
          const primItem = this.dragging.items[0];
          const prim = primItem.c;
          const pd = this.defOf(prim);
          const nx = primItem.ox + dx, ny = primItem.oy + dy;
          const edges = [[nx, 'x'], [nx + pd.w, 'x'], [nx + pd.w / 2, 'xc'], [ny, 'y'], [ny + pd.h, 'y'], [ny + pd.h / 2, 'yc']];
          const thresh = 6 / this.view.z;
          for (const oc of this.doc.components) {
            if (this.selection.has(oc.id)) continue;
            const od = this.defOf(oc);
            const cands = [[oc.x, 'x'], [oc.x + od.w, 'x'], [oc.x + od.w / 2, 'xc'], [oc.y, 'y'], [oc.y + od.h, 'y'], [oc.y + od.h / 2, 'yc']];
            for (let [ev, ek] of edges) for (const [cv, ck] of cands) {
              if (ek === ck && Math.abs(ev - cv) < thresh) {
                if (ek === 'x') dx += cv - ev; else if (ek === 'xc') dx += cv - ev;
                else if (ek === 'y') dy += cv - ev; else dy += cv - ev;
                this.showGuide(ek.includes('x') ? 'v' : 'h', cv);
                ev = cv;
              }
            }
          }
        }
        const primItem = this.dragging.items[0];
        if (this.snapGrid && !e.altKey) {
          dx += (Math.round((primItem.ox + dx) / 10) * 10) - (primItem.ox + dx);
          dy += (Math.round((primItem.oy + dy) / 10) * 10) - (primItem.oy + dy);
        }
        if (!e.altKey) {
          const snapped = snapToBreadboard(this.doc, primItem.c, primItem.ox + dx, primItem.oy + dy);
          dx += snapped.x - (primItem.ox + dx);
          dy += snapped.y - (primItem.oy + dy);
        }
        this.dragging.items.forEach(({ c, ox, oy }) => { c.x = ox + dx; c.y = oy + dy; this.applyCompTransform(c, c._g); this.refreshWiresFor(c.id); });
        return;
      }
      if (this.wiring) {
        const dx = e.clientX - this.wiring.startScreen.x, dy = e.clientY - this.wiring.startScreen.y;
        if (Math.hypot(dx, dy) > 3) this.wiring.moved = true;
        this.updateWirePreview(e);
        return;
      }
      // knob/stick/slider drags
      const kd = this.doc.components.find(c => c.state && (c.state.knobDrag || c.state.stickDrag || c.state.sliderDrag));
      if (kd) {
        if (kd.state.knobDrag) {
          const d0 = kd.state.knobDrag;
          if (d0.type === 'encoder') { kd.props.pos = Math.round((d0.p0 + (e.clientX - d0.x0) / 14) * 2) / 2; }
          else kd.props.value = clamp(d0.v0 - (e.clientX - d0.x0) / 220, 0, 1);
          this.updateComp(kd.id); this.changed();
        } else if (kd.state.stickDrag) this.updateStick(e, kd);
        else if (kd.state.sliderDrag) { this.updateSlider(e, kd); this.changed(); }
      }
    }
    onUp(e) {
      if (this.panning) { this.panning = null; this.svg.style.cursor = this.spaceHeld ? 'grab' : ''; }
      if (this.marquee) {
        const r = { x: +this.marqueeEl.getAttribute('x'), y: +this.marqueeEl.getAttribute('y'), w: +this.marqueeEl.getAttribute('width'), h: +this.marqueeEl.getAttribute('height') };
        this.marqueeEl.remove(); this.marquee = null;
        if (r.w > 4 || r.h > 4) {
          const inside = p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
          this.doc.components.forEach(c => { const d = this.defOf(c); const cx = c.x + d.w / 2, cy = c.y + d.h / 2; if (inside({ x: cx, y: cy })) this.selection.add(c.id); });
          this.doc.wires.forEach(w => {
            const pts = this.wirePoints(w); if (!pts.length) return;
            const mid = pts[Math.floor(pts.length / 2)];
            if (inside(mid) || pts.some(inside)) this.selWires.add(w.id);
          });
          this.syncSelectionClasses();
        }
      }
      if (this.dragging) {
        this.dragging.items.forEach(({ c }) => { const g = c._g; if (g) { g.classList.remove('drag-ghost'); g.classList.remove('dragging'); } });
        const fixed = this.repairInvalidPositions(this.doc, false);
        if (fixed) { this.dragging.items.forEach(({ c }) => { this.applyCompTransform(c, c._g); this.refreshWiresFor(c.id); }); CS.toast(`Fixed ${fixed} component${fixed > 1 ? 's' : ''} with an invalid position`, 'warn', 2200); }
        if (this.dragging.moved || fixed) this.changed();
        this.dragging = null; this.clearGuides();
      }
      if (this.endpointDrag) this.finishEndpointDrag(e);
      if (this.wireDrag) {
        if (this.wireDrag.moved) this.changed();
        this.wireDrag = null;
      }
      if (this.holdRelease) { this.holdRelease(); this.holdRelease = null; }
      if (this.wiring) this.dropWire(e);
    }
    showGuide(dir, v) {
      const el = svgEl('line', dir === 'v' ? { x1: v, y1: -10000, x2: v, y2: 10000 } : { x1: -10000, y1: v, x2: 10000, y2: v }, this.fxLayer);
      el.setAttribute('class', 'guide');
      this.guides = this.guides || [];
      this.guides.push(el);
    }
    clearGuides() { (this.guides || []).forEach(g => g.remove()); this.guides = []; }

    /* ---------- wiring ---------- */
    startWire(e, c, p) {
      if (this.readOnly) return;
      if (this.wiring) return this.finishWire(c, p);
      this.clearSelection();
      this.wiring = { from: { c: c.id, p: p.id }, color: CS.KIND_COLOR[kindBase(p)] || '#64748b', startScreen: { x: e.clientX, y: e.clientY }, moved: false, clickMode: false, snap: null };
      this.wirePreview = svgEl('path', { class: 'wire-path wire-preview', d: '', stroke: this.wiring.color, 'stroke-width': 2.4, 'stroke-dasharray': '6 4' }, this.fxLayer);
      this.setPinStartClass(c.id, p.id, true);
      this.updateWirePreview(e);
    }
    finishWire(c, p) { this.finishWireRef({ c: c.id, p: p.id }); }
    finishWireAt(e, c, p) {
      if (!this.wiring) return;
      const wpt = this.toWorld(e.clientX, e.clientY);
      const snap = findPinNear(this.doc, wpt.x, wpt.y, { radius: this.snapRadius, from: this.wiring.from, includeInvalid: true });
      if (snap && snap.valid) return this.finishWireRef(snap.ref);
      if (snap && !snap.valid) { this.warnWire(snap.message); return this.cancelWire(); }
      return this.finishWire(c, p);
    }
    finishWireRef(to) {
      if (!this.wiring) return;
      const from = this.wiring.from;
      const verdict = validateConnection(this.doc, from, to);
      if (!verdict.ok) { this.warnWire(verdict.message); this.cancelWire(); return; }
      this.pushUndo();
      const w = { id: uid(9), a: { c: from.c, p: from.p }, b: { c: to.c, p: to.p }, color: this.wiring.color, label: '', style: this.wireStyle === 'smooth' ? 'smooth' : '' };
      this.doc.wires.push(w);
      const g = this.renderWire(w);
      if (w._g) { w._g.classList.add('wire-new'); setTimeout(() => w._g.classList.remove('wire-new'), 500); }
      const end = this.pinWorld(this.compById(to.c), to.p);
      if (end) {
        const flash = svgEl('circle', { cx: end.x, cy: end.y, r: 4, fill: 'none', stroke: w.color, 'stroke-width': 2, class: 'snap-flash' }, this.fxLayer);
        flash.setAttribute('r', 10);
        setTimeout(() => flash.remove(), 350);
      }
      g._pathEl && 0;
      this.renderJunctions();
      this.cancelWire();
      this.changed();
      CS.bus.emit('wireAdded', w);
    }
    updateWirePreview(e) {
      if (!this.wiring || !this.wirePreview) return;
      const p = this.toWorld(e.clientX, e.clientY);
      const a = this.pinWorld(this.compById(this.wiring.from.c), this.wiring.from.p);
      const snap = findPinNear(this.doc, p.x, p.y, { radius: this.snapRadius, from: this.wiring.from, includeInvalid: true });
      this.highlightSnapPin(snap);
      this.wiring.snap = snap;
      if (!a) return;
      const end = snap ? snap.pt : p;
      this.wirePreview.classList.toggle('invalid', !!(snap && !snap.valid));
      this.wirePreview.setAttribute('stroke', snap && !snap.valid ? '#f87171' : this.wiring.color);
      const pts = pointsOf(a, end);
      const targetD = this.wireStyle === 'smooth' ? smoothPath(pts) : roundedPath(pts);
      if (this.wirePreview.getAttribute('d') !== targetD) this.wirePreview.setAttribute('d', targetD);
    }
    dropWire(e) {
      const dx = e.clientX - this.wiring.startScreen.x, dy = e.clientY - this.wiring.startScreen.y;
      if (Math.hypot(dx, dy) <= 3 && !this.wiring.clickMode) {
        this.wiring.clickMode = true;
        CS.toast('Wiring started — click another pin to finish', 'ok', 1400);
        return;
      }
      this.updateWirePreview(e);
      const snap = this.wiring.snap;
      if (snap && snap.valid) return this.finishWireRef(snap.ref);
      if (snap && !snap.valid) this.warnWire(snap.message);
      else this.warnWire('No pin found — drop closer to a pin');
      this.cancelWire();
    }
    cancelWire() {
      if (this.wirePreview) { this.wirePreview.remove(); this.wirePreview = null; }
      this.svg.querySelectorAll('.wiring-start,.hot,.snap-ok,.snap-bad').forEach(el => el.classList.remove('wiring-start', 'hot', 'snap-ok', 'snap-bad'));
      this.wiring = null; this.snapPin = null;
    }
    warnWire(msg) { CS.toast(msg || 'Cannot connect those pins', 'warn', 2600); }
    pinEls(compId, pinId) { return this.svg.querySelectorAll(`[data-comp="${compId}"][data-pin="${pinId}"]`); }
    setPinStartClass(compId, pinId, on) { this.pinEls(compId, pinId).forEach(el => el.classList.toggle('wiring-start', on)); }
    setPinSnapClass(compId, pinId, on, bad) { if (!compId || !pinId) return; this.pinEls(compId, pinId).forEach(el => { el.classList.toggle('hot', on); el.classList.toggle('snap-ok', on && !bad); el.classList.toggle('snap-bad', on && !!bad); }); }
    highlightSnapPin(snap) {
      if (this.snapPin && (!snap || this.snapPin.c !== snap.ref.c || this.snapPin.p !== snap.ref.p)) this.setPinSnapClass(this.snapPin.c, this.snapPin.p, false);
      if (snap) { this.setPinSnapClass(snap.ref.c, snap.ref.p, true, !snap.valid); this.snapPin = snap.ref; }
      else this.snapPin = null;
    }

    /* ---------- wire waypoints ---------- */
    startWireBend(e, w, forcedIndex) {
      this.selectWire(e, w);
      if (this.readOnly || e.button !== 0 || this.wiring) return;
      let p = this.toWorld(e.clientX, e.clientY);
      if (this.snapGrid && !e.altKey) p = { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 };
      const epA = this.pinWorld(this.compById(w.a.c), w.a.p), epB = this.pinWorld(this.compById(w.b.c), w.b.p);
      const epRadius = 14 / this.view.z;
      if (forcedIndex == null && epA && Math.hypot(p.x - epA.x, p.y - epA.y) < epRadius) return this.startEndpointDrag(e, w, 'a');
      if (forcedIndex == null && epB && Math.hypot(p.x - epB.x, p.y - epB.y) < epRadius) return this.startEndpointDrag(e, w, 'b');
      w.points = Array.isArray(w.points) ? w.points : [];
      let index = forcedIndex;
      if (index == null) {
        const near = w.points.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 12 / this.view.z);
        if (near >= 0) index = near;
        else {
          const seg = closestSegmentIndex(this.wirePoints(w), p);
          index = Math.max(0, seg);
          w.points.splice(index, 0, p);
          this.refreshWire(w);
        }
      }
      this.wireDrag = { w, index, start: p, moved: false, undoPushed: false };
    }
    startEndpointDrag(e, w, end) {
      const other = end === 'a' ? w.b : w.a;
      this.endpointDrag = { w, end, other, snap: null, color: w.color || '#64748b' };
      this.rewirePreview = svgEl('path', { class: 'wire-path wire-preview', d: '', stroke: this.endpointDrag.color, 'stroke-width': 2.6, 'stroke-dasharray': '5 4' }, this.fxLayer);
      this.updateEndpointDrag(e);
    }
    updateEndpointDrag(e) {
      const d = this.endpointDrag; if (!d) return;
      const p = this.toWorld(e.clientX, e.clientY);
      const otherPt = this.pinWorld(this.compById(d.other.c), d.other.p);
      const snap = findPinNear(this.doc, p.x, p.y, { radius: this.snapRadius, from: d.other, includeInvalid: true, ignoreWireId: d.w.id });
      this.highlightSnapPin(snap); d.snap = snap;
      const endPt = snap ? snap.pt : p;
      if (this.rewirePreview && otherPt) {
        this.rewirePreview.classList.toggle('invalid', !!(snap && !snap.valid));
        this.rewirePreview.setAttribute('stroke', snap && !snap.valid ? '#f87171' : d.color);
        const rePts = pointsOf(otherPt, endPt);
        this.rewirePreview.setAttribute('d', this.wireStyle === 'smooth' ? smoothPath(rePts) : roundedPath(rePts));
      }
    }
    finishEndpointDrag(e) {
      const d = this.endpointDrag; if (!d) return;
      this.updateEndpointDrag(e);
      const snap = d.snap;
      if (snap && snap.valid) {
        this.pushUndo();
        d.w[d.end] = { c: snap.ref.c, p: snap.ref.p };
        this.refreshWire(d.w); this.changed(); CS.toast('Wire endpoint reassigned', 'ok', 1200);
      } else CS.toast(snap && !snap.valid ? snap.message : 'No pin found — drop closer to a pin', 'warn', 2200);
      if (this.rewirePreview) { this.rewirePreview.remove(); this.rewirePreview = null; }
      this.highlightSnapPin(null); this.endpointDrag = null;
    }

    /* ---------- live probe / multimeter ---------- */
    setProbeMode(on) {
      this.probeMode = !!on;
      this.svg.classList.toggle('probe-mode', this.probeMode);
      if (this.probeMode) this.cancelWire();
    }
    probePin(c, p) {
      const node = c.id + '.' + p.id;
      let msg = `${(CS.defs[c.type] || {}).name || c.type} ${p.id}`;
      if (CS.sim && CS.sim.netRoot && CS.sim.netInfo) {
        const api = CS.sim.componentApi();
        const v = api.volts(node);
        const st = api.state(node);
        msg += `: ${v == null ? 'floating' : v.toFixed(2) + ' V'} (${st})`;
        const r = CS.sim.netRoot.get(node); const info = r && CS.sim.netInfo.get(r);
        if (info && info.short) msg += ' — SHORT';
      } else msg += ': run the simulation to read live voltage/state';
      CS.toast('🔎 ' + msg, 'ok', 2600);
      CS.bus.emit('pinProbed', { comp: c, pin: p, node });
    }

    /* ---------- pin tooltip ---------- */
    showPinTip(e, c, p) {
      const tip = document.getElementById('pin-tooltip');
      if (!tip) return;
      const def = this.defOf(c);
      const kind = (p.kind || 'special').split(' ')[0];
      const col = CS.KIND_COLOR[kind] || '#e2e8f0';
      const name = p.label || p.id;
      let desc = '';
      if (def.mcu && def.family === 'avr') desc = kind === 'digital' ? 'Digital I/O' + (/pwm/.test(p.kind) ? ' (PWM capable)' : '') : kind === 'analog' ? 'Analog input (10-bit ADC)' : kind === 'power' ? 'Power rail' : kind === 'ground' ? 'Ground' : '';
      else if (def.mcu) desc = kind === 'digital' ? 'GPIO (3.3 V)' : kind === 'analog' ? 'Analog input (12-bit ADC)' : kind === 'i2c' ? 'I2C bus' : kind === 'power' ? 'Power rail' : kind === 'ground' ? 'Ground' : 'GPIO';
      else if (p.bb) desc = 'Breadboard tie — ' + p.bb;
      else desc = (kind[0].toUpperCase() + kind.slice(1)) + ' pin';
      tip.innerHTML = `<span><b>${CS.esc(def.name)}</b> · ${CS.esc(p.id)}${name !== p.id ? ' (' + CS.esc(name) + ')' : ''}<span class="pt-type" style="background:${col}22;color:${col};border:1px solid ${col}66">${kind.toUpperCase()}</span></span><div class="pt-desc">${CS.esc(desc)} — drag to another pin to wire it.</div>`;
      tip.classList.remove('hidden');
      const wrap = this.svg.getBoundingClientRect();
      const sp = this.toScreen(...(() => { const w = this.pinWorld(c, p.id); return [w.x, w.y]; })());
      tip.style.left = clamp(sp.x - wrap.left + 14, 4, wrap.width - 260) + 'px';
      tip.style.top = clamp(sp.y - wrap.top - 12, 4, wrap.height - 70) + 'px';
    }
    hidePinTip() { const tip = document.getElementById('pin-tooltip'); if (tip) tip.classList.add('hidden'); }

    /* ---------- context menus ---------- */
    canvasMenu(e) {
      if (this.readOnly) return;
      const p = this.toWorld(e.clientX, e.clientY);
      CS.menu(e.clientX, e.clientY, [
        { icon: '📋', label: 'Paste', disabled: !this.clipboard, fn: () => this.pasteAt(p.x, p.y) },
        { icon: '☑', label: 'Select All', fn: () => this.selectAll() },
        '-',
        { icon: '⛶', label: 'Zoom to Fit', fn: () => this.zoomFit() },
        { icon: '100', label: 'Reset Zoom (100%)', fn: () => { this.view.z = 1; this.applyView(); CS.bus.emit('viewChanged'); } },
        '-',
        { icon: this.gridOn ? '▦' : '□', label: this.gridOn ? 'Hide Grid' : 'Show Grid', fn: () => { this.gridOn = !this.gridOn; this.gridRect.style.display = this.gridOn ? '' : 'none'; CS.bus.emit('viewChanged'); } },
        { icon: this.snapGrid ? '🧲' : '•', label: this.snapGrid ? 'Snap-to-grid Off' : 'Snap-to-grid On', fn: () => { this.snapGrid = !this.snapGrid; CS.toast(this.snapGrid ? 'Snap-to-grid on 🧲' : 'Snap-to-grid off', 'ok', 1200); } },
        '-',
        { icon: '➕', label: 'Add component here…', fn: () => this.quickAddAt(e.clientX, e.clientY, p) },
        { icon: '🧹', label: 'Clear all wire bends', fn: () => this.clearWireBends() },
        { icon: '🗑', label: 'Clear Canvas…', danger: true, fn: () => this.clearCanvas() }
      ]);
    }
    quickAddAt(sx, sy, worldPoint) {
      const root = document.createElement('div'); root.className = 'quick-add'; root.id = 'quick-add';
      const defs = Object.values(CS.defs).sort((a, b) => a.name.localeCompare(b.name));
      root.innerHTML = `<input placeholder="Search components…" autocomplete="off"><div class="qa-list"></div>`;
      document.body.appendChild(root);
      const rW = 260, rH = 320;
      root.style.left = Math.max(8, Math.min(sx, innerWidth - rW - 8)) + 'px';
      root.style.top = Math.max(8, Math.min(sy, innerHeight - rH - 8)) + 'px';
      const inp = root.querySelector('input'), list = root.querySelector('.qa-list');
      const render = () => {
        const q = inp.value.toLowerCase();
        list.innerHTML = defs.filter(d => !q || (d.name + ' ' + d.cat + ' ' + (d.desc || '')).toLowerCase().includes(q)).slice(0, 40)
          .map(d => `<button data-t="${d.type}"><span>${d.icon}</span><span><b>${CS.esc(d.name)}</b><small>${CS.esc(d.cat)} · ${d.pins.length} pins</small></span></button>`).join('') || '<div class="qa-empty">No parts found</div>';
        list.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { const d = CS.defs[b.getAttribute('data-t')]; this.addComponent(d.type, worldPoint.x - d.w / 2, worldPoint.y - d.h / 2); close(); }));
      };
      const close = () => { root.remove(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
      const outside = e => { if (!root.contains(e.target)) close(); };
      const esc = e => { if (e.key === 'Escape') close(); };
      inp.addEventListener('input', render); document.addEventListener('keydown', esc); setTimeout(() => document.addEventListener('pointerdown', outside), 0);
      render(); inp.focus();
    }
    compMenu(e, c) { if (this.wiring || this.readOnly) return;
      if (!this.selection.has(c.id)) this.select({ shiftKey: false }, c);
      const p = this.toWorld(e.clientX, e.clientY);
      const n = this.activeComponentIds().size;
      const hasGroup = [...this.activeComponentIds()].some(id => (this.compById(id) || {}).groupId);
      const allLocked = [...this.activeComponentIds()].every(id => (this.compById(id) || {}).locked);
      CS.menu(e.clientX, e.clientY, [
        { icon: '✏️', label: 'Rename / edit label', disabled: n !== 1, fn: () => { const v = prompt('Component label', c.label || ''); if (v != null) { this.pushUndo(); c.label = v.trim().slice(0, 32); this.updateComp(c.id); this.changed(); this.emitSelection(); } } },
        { icon: allLocked ? '🔓' : '🔒', label: allLocked ? 'Unlock' : 'Lock', fn: () => this.setLockedSelection(!allLocked) },
        { icon: '🎯', label: 'Select all of this type', fn: () => this.selectAllOfType(c.type) },
        '-',
        { icon: '🔄', label: 'Rotate 90°  (R)', fn: () => this.rotateSelection() },
        { icon: '⇋', label: 'Flip Horizontal', fn: () => this.flipSelection('x') },
        { icon: '⇅', label: 'Flip Vertical', fn: () => this.flipSelection('y') },
        { icon: '⧉', label: 'Duplicate  (Ctrl+D)', fn: () => this.duplicate() },
        { icon: '📋', label: 'Copy  (Ctrl+C)', fn: () => this.copySelection() },
        { icon: '✂️', label: 'Cut  (Ctrl+X)', fn: () => this.copySelection(true) },
        { icon: '📌', label: 'Paste here', disabled: !this.clipboard, fn: () => this.pasteAt(p.x, p.y) },
        '-',
        { icon: '⬆️', label: 'Bring to Front', fn: () => this.moveSelectionOrder('front') },
        { icon: '⇧', label: 'Bring Forward', fn: () => this.moveSelectionOrder('forward') },
        { icon: '⇩', label: 'Send Backward', fn: () => this.moveSelectionOrder('backward') },
        { icon: '⬇️', label: 'Send to Back', fn: () => this.moveSelectionOrder('back') },
        ...(n > 1 ? ['-',
          { icon: '⬅', label: 'Align Left', fn: () => this.alignSelection('left') },
          { icon: '↔', label: 'Align Horizontal Center', fn: () => this.alignSelection('hcenter') },
          { icon: '➡', label: 'Align Right', fn: () => this.alignSelection('right') },
          { icon: '⬆', label: 'Align Top', fn: () => this.alignSelection('top') },
          { icon: '↕', label: 'Align Vertical Center', fn: () => this.alignSelection('vcenter') },
          { icon: '⬇', label: 'Align Bottom', fn: () => this.alignSelection('bottom') }
        ] : []),
        ...(n > 2 ? [
          { icon: '⇔', label: 'Distribute Horizontally', fn: () => this.distributeSelection('x') },
          { icon: '⇕', label: 'Distribute Vertically', fn: () => this.distributeSelection('y') }
        ] : []),
        ...(n > 1 ? ['-', { icon: '🧩', label: 'Group', fn: () => this.groupSelection() }] : []),
        ...(hasGroup ? [{ icon: '🧩', label: 'Ungroup', fn: () => this.ungroupSelection() }] : []),
        '-',
        { icon: '🗑', label: n > 1 ? 'Delete Selected' : 'Delete', danger: true, fn: () => this.deleteSelection() }
      ]);
    }
    wireTargets(clicked) {
      if (this.selWires.size && this.selWires.has(clicked.id)) return this.doc.wires.filter(w => this.selWires.has(w.id));
      return [clicked];
    }
    wireMenu(e, w) {
      if (!this.selWires.has(w.id)) this.selectWire({ shiftKey: false }, w);
      const targets = () => this.wireTargets(w);
      const bulk = fn => { this.pushUndo(); targets().forEach(fn); targets().forEach(x => this.refreshWire(x)); this.changed(); };
      CS.menu(e.clientX, e.clientY, [
        { icon: '🏷️', label: targets().length > 1 ? 'Name selected nets' : 'Name this net', fn: () => { const v = prompt('Signal / net label', w.label || ''); if (v != null) bulk(x => { x.label = v.trim().slice(0, 24); }); } },
        { icon: '↱', label: 'Clear bend points', fn: () => bulk(x => { x.points = []; }) },
        { icon: (w.style || this.wireStyle) === 'smooth' ? '┐' : '〰️', label: (w.style || this.wireStyle) === 'smooth' ? 'Use orthogonal style' : 'Use smooth style', fn: () => bulk(x => { x.style = (w.style || this.wireStyle) === 'smooth' ? 'ortho' : 'smooth'; }) },
        { icon: '🎨', label: 'Custom color…', fn: () => this.colorPickerAt(e.clientX, e.clientY, w.color || '#64748b', col => bulk(x => { x.color = col; })) },
        '-',
        ...Object.entries(CS.KIND_COLOR).map(([k, col]) => ({ icon: '●', label: 'Signal color: ' + k, fn: () => bulk(x => { x.color = col; }) })),
        '-',
        { icon: '🔁', label: 'Reassign endpoint: drag near an endpoint', disabled: true },
        { icon: '🗑', label: targets().length > 1 ? 'Delete selected wires' : 'Delete wire', danger: true, fn: () => { const ids = new Set(targets().map(x => x.id)); this.pushUndo(); this.doc.wires = this.doc.wires.filter(x => !ids.has(x.id)); ids.forEach(id => this.selWires.delete(id)); this.renderAll(); this.changed(); this.emitSelection(); } }
      ]);
    }
    colorPickerAt(x, y, value, cb) {
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = value || '#64748b';
      inp.style.cssText = `position:fixed;left:${Math.max(8, Math.min(x, innerWidth - 48))}px;top:${Math.max(8, Math.min(y, innerHeight - 32))}px;z-index:300;width:42px;height:32px;opacity:.98`;
      document.body.appendChild(inp); inp.focus(); inp.click();
      const done = () => { cb(inp.value); inp.remove(); };
      inp.addEventListener('input', () => cb(inp.value));
      inp.addEventListener('change', done, { once: true }); inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 120), { once: true });
    }

    /* ---------- junction dots ---------- */
    renderJunctions() {
      if (this._juncG) { this._juncG.remove(); this._juncG = null; }
      const groups = {};
      for (const w of this.doc.wires) {
        for (const ref of [w.a, w.b]) {
          const key = ref.c + '|' + ref.p;
          groups[key] = (groups[key] || 0) + 1;
        }
      }
      const dots = [];
      for (const [key, n] of Object.entries(groups)) {
        if (n < 3) continue;
        const [compId, pinId] = key.split('|');
        const c = this.compById(compId);
        if (!c) continue;
        const pt = this.pinWorld(c, pinId);
        if (!pt) continue;
        dots.push(pt);
      }
      if (!dots.length) return;
      this._juncG = svgEl('g', { 'pointer-events': 'none' }, this.wiresLayer);
      dots.forEach(pt => svgEl('circle', { cx: pt.x, cy: pt.y, r: 3, fill: '#94a3b8', 'stroke': '#475569', 'stroke-width': 1 }, this._juncG));
    }

    /* ---------- Schematic View Toggle (Workstream D) ---------- */
    setSchematicMode(enabled) {
      this.schematicMode = !!enabled;
      if (this.svg && this.svg.parentElement) {
        this.svg.parentElement.classList.toggle('schematic-mode', this.schematicMode);
      }
      this.render();
    }
    toggleSchematicMode() {
      this.setSchematicMode(!this.schematicMode);
    }

    renderSchematicSymbol(comp, g) {
      const def = compDef(comp) || { w: 80, h: 60, name: comp.type };
      const w = def.w, h = def.h;
      g.innerHTML = '';

      svgEl('rect', {
        x: 0, y: 0, width: w, height: h,
        fill: '#ffffff', stroke: '#0f172a', 'stroke-width': 2, rx: 4
      }, g);

      const title = svgEl('text', {
        x: w / 2, y: 20,
        'text-anchor': 'middle', 'font-size': '11', 'font-weight': 'bold', fill: '#0f172a'
      }, g);
      title.textContent = (comp.label || def.name || comp.type).toUpperCase();

      // Render schematic pin stubs
      (def.pins || []).forEach(p => {
        const pinG = svgEl('g', { class: 'schematic-pin', 'data-pin': p.id }, g);
        svgEl('line', { x1: p.x, y1: p.y, x2: p.x + (p.x < w / 2 ? -8 : 8), y2: p.y, stroke: '#0f172a', 'stroke-width': 1.5 }, pinG);
        svgEl('circle', { cx: p.x, cy: p.y, r: 3, fill: '#3b82f6' }, pinG);
        const lbl = svgEl('text', {
          x: p.x + (p.x < w / 2 ? 10 : -10), y: p.y + 3,
          'text-anchor': p.x < w / 2 ? 'start' : 'end', 'font-size': '9', fill: '#475569'
        }, pinG);
        lbl.textContent = p.id;
      });
    }

    /* ---------- Advanced Wiring & Editor UX (Workstream C) ---------- */
    tidyLayout() {
      this.pushUndo();
      const comps = this.doc.components || [];
      if (comps.length <= 1) return;

      const mcu = comps.find(c => compDef(c) && compDef(c).mcu);
      const k = 140; // ideal distance

      for (let iter = 0; iter < 40; iter++) {
        const fx = new Map(), fy = new Map();
        comps.forEach(c => { fx.set(c.id, 0); fy.set(c.id, 0); });

        // Repulsion between components
        for (let i = 0; i < comps.length; i++) {
          for (let j = i + 1; j < comps.length; j++) {
            const c1 = comps[i], c2 = comps[j];
            let dx = c2.x - c1.x, dy = c2.y - c1.y;
            let dist = Math.hypot(dx, dy) || 1;
            if (dist < 220) {
              const force = (k * k) / dist;
              const fx1 = (dx / dist) * force, fy1 = (dy / dist) * force;
              fx.set(c1.id, fx.get(c1.id) - fx1);
              fy.set(c1.id, fy.get(c1.id) - fy1);
              fx.set(c2.id, fx.get(c2.id) + fx1);
              fy.set(c2.id, fy.get(c2.id) + fy1);
            }
          }
        }

        // Attraction along wires
        (this.doc.wires || []).forEach(w => {
          const c1 = this.compById(w.a.c), c2 = this.compById(w.b.c);
          if (c1 && c2 && c1.id !== c2.id) {
            let dx = c2.x - c1.x, dy = c2.y - c1.y;
            let dist = Math.hypot(dx, dy) || 1;
            const force = (dist * dist) / k;
            const fx1 = (dx / dist) * force * 0.1, fy1 = (dy / dist) * force * 0.1;
            fx.set(c1.id, fx.get(c1.id) + fx1);
            fy.set(c1.id, fy.get(c1.id) + fy1);
            fx.set(c2.id, fx.get(c2.id) - fx1);
            fy.set(c2.id, fy.get(c2.id) - fy1);
          }
        });

        // Apply forces (pin MCU in place)
        comps.forEach(c => {
          if (mcu && c.id === mcu.id) return;
          const maxStep = 15;
          const dx = clamp(fx.get(c.id), -maxStep, maxStep);
          const dy = clamp(fy.get(c.id), -maxStep, maxStep);
          c.x = Math.round((c.x + dx) / 10) * 10;
          c.y = Math.round((c.y + dy) / 10) * 10;
        });
      }

      this.render();
      this.changed();
    }

    getReservedPinWarning(comp, pinId) {
      if (!comp || !pinId) return null;
      const t = (comp.type || '').toLowerCase();
      const p = String(pinId).toUpperCase();
      if (t.includes('uno') || t.includes('nano')) {
        if (p === 'D0' || p === 'RX') return 'D0 / RX is shared with USB Serial RX.';
        if (p === 'D1' || p === 'TX') return 'D1 / TX is shared with USB Serial TX.';
      }
      if (t.includes('esp32')) {
        if (['GPIO0', 'GPIO2', 'GPIO15'].includes(p)) return `${p} is an ESP32 strapping pin (boot mode).`;
      }
      return null;
    }

    snapToNearestCompatiblePin(x, y, fromRef) {
      const pins = allPins(this.doc);
      if (!pins.length) return null;
      let best = null, bestDist = 45;

      const fromComp = fromRef ? this.compById(fromRef.c) : null;
      const fromPinDef = fromRef ? pinDef(fromComp, fromRef.p) : null;

      for (const p of pins) {
        if (fromRef && sameRef(fromRef, p.ref)) continue;
        const dist = Math.hypot(p.pt.x - x, p.pt.y - y);
        if (dist < bestDist) {
          if (fromRef && fromPinDef) {
            const v = validateConnection(this.doc, fromRef, p.ref);
            if (!v.ok) continue;
          }
          bestDist = dist;
          best = p;
        }
      }
      return best;
    }

    scanDRCProblems() {
      const problems = [];
      const comps = this.doc.components || [];
      const wires = this.doc.wires || [];

      // 1. Reversed capacitors
      comps.filter(c => c.type === 'capacitor').forEach(c => {
        if (c.state && c.state.reversed) {
          problems.push({
            type: 'warning',
            comp: c,
            message: `Capacitor '${c.label || c.id}' is wired with reversed polarity!`
          });
        }
      });

      // 2. LEDs without series resistors
      comps.filter(c => c.type === 'led').forEach(c => {
        const connectedWires = wires.filter(w => w.a.c === c.id || w.b.c === c.id);
        const hasResistor = connectedWires.some(w => {
          const otherCompId = w.a.c === c.id ? w.b.c : w.a.c;
          const otherComp = this.compById(otherCompId);
          return otherComp && (otherComp.type === 'resistor' || (otherComp.props && otherComp.props.resistance));
        });
        if (!hasResistor && connectedWires.length > 0) {
          problems.push({
            type: 'warning',
            comp: c,
            message: `LED '${c.label || c.id}' is missing a series resistor (risk of overcurrent).`
          });
        }
      });

      // 3. Floating MCU inputs
      const mcus = comps.filter(c => compDef(c) && compDef(c).mcu);
      mcus.forEach(m => {
        const pins = (compDef(m).pins || []).filter(p => kindBase(p) === 'digital' || kindBase(p) === 'analog');
        pins.forEach(p => {
          const connected = wires.some(w => (w.a.c === m.id && w.a.p === p.id) || (w.b.c === m.id && w.b.p === p.id));
          if (!connected && p.id.startsWith('A')) {
            problems.push({
              type: 'info',
              comp: m,
              message: `Analog input ${p.id} on '${m.label || m.type}' is floating.`
            });
          }
        });
      });

      // 4. Short circuits (GND & Power)
      wires.forEach(w => {
        const ca = this.compById(w.a.c), cb = this.compById(w.b.c);
        const pa = pinDef(ca, w.a.p), pb = pinDef(cb, w.b.p);
        if (ca && cb && pa && pb) {
          const ka = kindBase(pa), kb = kindBase(pb);
          if ((ka === 'power' && kb === 'ground') || (ka === 'ground' && kb === 'power')) {
            problems.push({
              type: 'error',
              comp: ca,
              message: `Short circuit detected between ${ca.label || ca.id} (${w.a.p}) and ${cb.label || cb.id} (${w.b.p})!`
            });
          }
        }
      });

      this._drcProblems = problems;
      return problems;
    }

    renderMinimap() {
      let miniSvg = this.svg.parentElement ? this.svg.parentElement.querySelector('.canvas-minimap') : null;
      if (!miniSvg) {
        miniSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        miniSvg.setAttribute('class', 'canvas-minimap');
        miniSvg.style.cssText = 'position:absolute; bottom:16px; right:16px; width:160px; height:120px; background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.2); border-radius:6px; z-index:100; overflow:hidden; cursor:pointer;';
        if (this.svg.parentElement) this.svg.parentElement.appendChild(miniSvg);
        this.bindMiniMapEvents(miniSvg);
      }

      miniSvg.innerHTML = '';
      const comps = this.doc.components || [];
      if (!comps.length) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      comps.forEach(c => {
        const d = compDef(c) || { w: 60, h: 60 };
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + d.w);
        maxY = Math.max(maxY, c.y + d.h);
      });

      const pad = 80;
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const bw = maxX - minX || 100, bh = maxY - minY || 100;
      const scaleX = 160 / bw, scaleY = 120 / bh;

      comps.forEach(c => {
        const d = compDef(c) || { w: 40, h: 40 };
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', (c.x - minX) * scaleX);
        rect.setAttribute('y', (c.y - minY) * scaleY);
        rect.setAttribute('width', Math.max(3, d.w * scaleX));
        rect.setAttribute('height', Math.max(3, d.h * scaleY));
        rect.setAttribute('fill', compDef(c) && compDef(c).mcu ? '#3b82f6' : '#64748b');
        rect.setAttribute('rx', '2');
        miniSvg.appendChild(rect);

        if (c.label) {
          const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          lbl.setAttribute('x', ((c.x - minX) + d.w / 2) * scaleX);
          lbl.setAttribute('y', ((c.y - minY) + d.h + 4) * scaleY);
          lbl.setAttribute('text-anchor', 'middle');
          lbl.setAttribute('font-size', Math.max(5, Math.min(8, 8 * scaleX)));
          lbl.setAttribute('fill', '#94a3b8');
          lbl.textContent = c.label.slice(0, 6);
          miniSvg.appendChild(lbl);
        }
      });

      const svgRect = this.svg.getBoundingClientRect();
      const svgW = svgRect.width || 800, svgH = svgRect.height || 600;
      const vp = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const vx = (-this.view.x - minX) * scaleX;
      const vy = (-this.view.y - minY) * scaleY;
      const vw = (svgW / (this.view.z || 1)) * scaleX;
      const vh = (svgH / (this.view.z || 1)) * scaleY;
      vp.setAttribute('x', vx); vp.setAttribute('y', vy);
      vp.setAttribute('width', vw); vp.setAttribute('height', vh);
      vp.setAttribute('fill', 'rgba(59,130,246,0.15)');
      vp.setAttribute('stroke', '#60a5fa');
      vp.setAttribute('stroke-width', '1.5');
      vp.setAttribute('filter', 'drop-shadow(0 0 3px rgba(59,130,246,0.5))');
      miniSvg.appendChild(vp);
    }

    bindMiniMapEvents(miniSvg) {
      if (!miniSvg) return;
      const getScale = () => {
        const comps = this.doc.components || [];
        if (!comps.length) return 1;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        comps.forEach(c => {
          const d = compDef(c) || { w: 60, h: 60 };
          minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x + d.w); maxY = Math.max(maxY, c.y + d.h);
        });
        const pad = 80, bw = maxX - minX + pad * 2 || 100, bh = maxY - minY + pad * 2 || 100;
        return { sx: 160 / bw, sy: 120 / bh, bminX: minX - pad, bminY: minY - pad };
      };
      miniSvg.addEventListener('pointerdown', e => {
        e.preventDefault();
        this._miniMapDragging = true;
        const s = getScale();
        if (!s) return;
        const r = miniSvg.getBoundingClientRect();
        const mx = (e.clientX - r.left) / s.sx + s.bminX;
        const my = (e.clientY - r.top) / s.sy + s.bminY;
        const svgR = this.svg.getBoundingClientRect();
        this.view.x = svgR.width / 2 - mx * this.view.z;
        this.view.y = svgR.height / 2 - my * this.view.z;
        this.applyView(); CS.bus.emit('viewChanged');
      });
      miniSvg.addEventListener('pointermove', e => {
        if (!this._miniMapDragging) return;
        e.preventDefault();
        const s = getScale();
        if (!s) return;
        const r = miniSvg.getBoundingClientRect();
        const mx = (e.clientX - r.left) / s.sx + s.bminX;
        const my = (e.clientY - r.top) / s.sy + s.bminY;
        const svgR = this.svg.getBoundingClientRect();
        this.view.x = svgR.width / 2 - mx * this.view.z;
        this.view.y = svgR.height / 2 - my * this.view.z;
        this.applyView(); CS.bus.emit('viewChanged');
      });
      const onUp = () => { this._miniMapDragging = false; };
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }

    /* ---------- live visuals from sim ---------- */
    updateFlows() {
      if (!CS.sim || CS.sim.state === 'idle') {
        this.wiresLayer.querySelectorAll('.wire-flow').forEach(f => {
          f.classList.add('hidden');
          f.style.animationDuration = '';
        });
        this.wiresLayer.querySelectorAll('.wire-path').forEach(p => {
          p.style.filter = '';
          p.classList.remove('ground');
        });
        return;
      }
      for (const w of this.doc.wires) {
        const info = CS.sim.wireNetInfo(w);
        if (!info) continue;
        const isGround = info.volts != null && info.volts <= 0.5 && info.driven === 'strong';
        const active = !info.short && !isGround && info.volts != null && info.volts > 1.5;
        w._flow.classList.toggle('hidden', !active);
        w._path.classList.toggle('ground', isGround);
        if (active) {
          w._flow.style.stroke = '#e6fffa';
          w._flow.style.animationDuration = Math.max(0.3, 1.5 - info.volts * 0.12) + 's';
        } else {
          w._flow.style.animationDuration = '';
        }
        const gndCol = '#78716c';
        const targetFilter = info.short ? 'drop-shadow(0 0 4px #f87171)' : active ? `drop-shadow(0 0 4px ${w.color || '#4ade80'})` : '';
        if (w._path.style.filter !== targetFilter) w._path.style.filter = targetFilter;
        const targetColor = info.short ? '#f87171' : isGround ? gndCol : (w.color || '#64748b');
        if (w._path.getAttribute('stroke') !== targetColor) w._path.setAttribute('stroke', targetColor);
      }
    }
  }

  /* Grid-based A* auto-routing */
  function pointsOfAStar(a, b, doc) {
    if (!a || !b) return [];
    const GRID = 20;
    const roundG = v => Math.round(v / GRID) * GRID;
    const start = { x: roundG(a.x), y: roundG(a.y) };
    const goal = { x: roundG(b.x), y: roundG(b.y) };

    const obstacles = (doc && doc.components || []).map(c => {
      const d = compDef(c) || { w: 80, h: 60 };
      const margin = 10;
      return {
        x1: c.x - margin,
        y1: c.y - margin,
        x2: c.x + d.w + margin,
        y2: c.y + d.h + margin
      };
    });

    function isBlocked(x, y) {
      if ((Math.abs(x - start.x) < GRID && Math.abs(y - start.y) < GRID) ||
          (Math.abs(x - goal.x) < GRID && Math.abs(y - goal.y) < GRID)) {
        return false;
      }
      return obstacles.some(o => x >= o.x1 && x <= o.x2 && y >= o.y1 && y <= o.y2);
    }

    const key = p => `${p.x},${p.y}`;
    const openSet = [start];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(key(start), 0);
    fScore.set(key(start), Math.hypot(goal.x - start.x, goal.y - start.y));

    let iterations = 0;
    while (openSet.length > 0 && iterations < 300) {
      iterations++;
      openSet.sort((u, v) => (fScore.get(key(u)) || Infinity) - (fScore.get(key(v)) || Infinity));
      const current = openSet.shift();
      const currentKey = key(current);

      if (Math.abs(current.x - goal.x) < GRID && Math.abs(current.y - goal.y) < GRID) {
        const path = [{ x: b.x, y: b.y }];
        let curr = currentKey;
        while (cameFrom.has(curr)) {
          const p = cameFrom.get(curr);
          path.unshift(p);
          curr = key(p);
        }
        path.unshift({ x: a.x, y: a.y });
        return path;
      }

      const neighbors = [
        { x: current.x + GRID, y: current.y },
        { x: current.x - GRID, y: current.y },
        { x: current.x, y: current.y + GRID },
        { x: current.x, y: current.y - GRID }
      ];

      for (const neighbor of neighbors) {
        if (isBlocked(neighbor.x, neighbor.y)) continue;
        const nKey = key(neighbor);
        const tentativeG = (gScore.get(currentKey) || 0) + GRID;

        if (tentativeG < (gScore.get(nKey) || Infinity)) {
          cameFrom.set(nKey, current);
          gScore.set(nKey, tentativeG);
          fScore.set(nKey, tentativeG + Math.hypot(goal.x - neighbor.x, goal.y - neighbor.y));
          if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    return pointsOf(a, b);
  }

  /* orthogonal rounded routing */
  function pointsOf(a, b) {
    const pts = [{ x: a.x, y: a.y }];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) < 2 || Math.abs(dy) < 2) { pts.push({ x: b.x, y: b.y }); return pts; }
    if (Math.abs(dx) >= Math.abs(dy)) {
      const mx = a.x + dx / 2;
      pts.push({ x: mx, y: a.y }, { x: mx, y: b.y });
    } else {
      const my = a.y + dy / 2;
      pts.push({ x: a.x, y: my }, { x: b.x, y: my });
    }
    pts.push({ x: b.x, y: b.y });
    return pts;
  }
  function roundedPath(pts) {
    if (!pts || pts.length < 2) return '';
    if (pts.length < 3) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;
    const R = 7;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const r = Math.min(R, l1 / 2, l2 / 2);
      const inX = p1.x - (p1.x - p0.x) / (l1 || 1) * r, inY = p1.y - (p1.y - p0.y) / (l1 || 1) * r;
      const outX = p1.x + (p2.x - p1.x) / (l2 || 1) * r, outY = p1.y + (p2.y - p1.y) / (l2 || 1) * r;
      d += ` L${inX} ${inY} Q${p1.x} ${p1.y} ${outX} ${outY}`;
    }
    d += ` L${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  }
  function smoothPath(pts) {
    if (!pts || pts.length < 2) return '';
    if (pts.length === 2) {
      const [a, b] = pts, mx = (a.x + b.x) / 2;
      return `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
    }
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
      d += ` Q${pts[i].x} ${pts[i].y} ${mid.x} ${mid.y}`;
    }
    const last = pts[pts.length - 1];
    d += ` T${last.x} ${last.y}`;
    return d;
  }
  function closestSegmentIndex(pts, p) {
    if (!pts || pts.length < 2) return 0;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / ((vx * vx + vy * vy) || 1), 0, 1);
      const qx = a.x + vx * t, qy = a.y + vy * t;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function wirePointsInDoc(doc, w) {
    const a = pinWorldInDoc(doc, (doc.components || []).find(c => c.id === w.a.c), w.a.p);
    const b = pinWorldInDoc(doc, (doc.components || []).find(c => c.id === w.b.c), w.b.p);
    if (!a || !b) return [];
    return Array.isArray(w.points) && w.points.length ? [a, ...w.points.map(p => ({ x: toFinite(p.x), y: toFinite(p.y) })), b] : pointsOf(a, b);
  }
  CS.Wiring = Object.assign(CS.Wiring || {}, { pointsOf, pointsOfAStar, roundedPath, smoothPath, closestSegmentIndex, wirePoints: wirePointsInDoc });
  CS.CircuitCanvas = CircuitCanvas;
})();
