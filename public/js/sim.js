/* CircuitTecture — simulation engine.
   - Union-find net solver (digital-analog hybrid, strong/weak drivers)
   - Cooperative generator scheduler (delay/sleep suspend; statement markers
     enable pause-at-line, breakpoints, single-step)
   - Built-in library shims: Servo, LiquidCrystal, DHT, OLED, MATRIX, GPS,
     Camera, IMU, Stepper, RFID, MicroPython Pin/ADC/PWM, RPi.GPIO          */
(function () {
  const CS = window.CS;
  const { clamp } = CS;
  const RPI_BOARD_TO_BCM = { 3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25, 23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21 };

  /* ================= WebAudio ================= */
  CS.audio = {
    ctx: null, osc: {}, muted: false,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    set(key, hz, soft) {
      if (!this.ctx) return;
      const cur = this.osc[key];
      if (hz && !this.muted) {
        if (!cur) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = soft ? 'sine' : 'square'; g.gain.value = soft ? 0.06 : 0.035;
          o.frequency.value = clamp(hz, 20, 12000);
          o.connect(g).connect(this.ctx.destination); o.start();
          this.osc[key] = { o, g, hz };
        } else if (Math.abs(cur.hz - hz) > 2) { cur.o.frequency.setTargetAtTime(clamp(hz, 20, 12000), this.ctx.currentTime, 0.01); cur.hz = hz; }
      } else if (cur) { try { cur.o.stop(); } catch { } delete this.osc[key]; }
    },
    click() { if (!this.ctx || this.muted) return; try { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'square'; o.frequency.value = 2200; g.gain.setValueAtTime(0.05, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04); o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.05); } catch { } },
    stopAll() { for (const k in this.osc) { try { this.osc[k].o.stop(); } catch { } delete this.osc[k]; } }
  };

  /* UART pins per board family (primary UART0) */
  function uartPinsOf(type) {
    const d = CS.defs[type] || {};
    const ids = d.pins ? d.pins.map(p => p.id) : [];
    if (ids.includes('TX') && ids.includes('RX')) return { tx: 'TX', rx: 'RX' };
    if (ids.includes('GP0') && ids.includes('GP1')) return { tx: 'GP0', rx: 'GP1' }; // Pico family UART0
    if (type === 'esp32') return { tx: '1', rx: '3' }; // labeled TX0/RX0
    if (ids.includes('D1') && ids.includes('D0')) return { tx: 'D1', rx: 'D0' }; // AVR boards
    if (ids.includes('14') && ids.includes('15')) return { tx: '14', rx: '15' }; // RPi BCM
    return null;
  }
  CS.uartPinsOf = uartPinsOf;

  /* ================= engine ================= */
  class Engine {
    constructor() {
      this.state = 'idle'; // idle|running|paused|error
      this.speed = 1;
      this.now = 0;
      this.holdUntil = 0;
      this.line = 0;
      this.breakpoints = new Set();
      this.stepArmed = false;
      this.serialRx = '';
      this.serialEvents = [];
      this.scopeChannels = [];
      this.samples = new Map();
      this.listeners = {};
      this.frameReq = null;
      this.lastFrameTs = 0;
      this.gpioMode = 'BCM';
      this.mcus = [];
      this.mcu = null;
      this.boards = [];
      this.debugBoardId = null; // board that owns breakpoints/step/exec-line (active editor tab)
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }

    attach(doc) {
      this.doc = doc;
      this.mcus = doc.components.filter(c => (CS.defs[c.type] || {}).mcu);
      this.mcu = this.mcus[0] || null; // primary board (legacy callers)
      this.boards = this.boards || [];
      doc.components.forEach(c => { c.state = {}; });
    }

    // A display tag like "Uno R3 2" (index only when more than one board)
    boardTag(comp) {
      const name = (CS.defs[comp.type] || {}).name || comp.type;
      return this.mcus && this.mcus.length > 1 ? `${name} ${this.mcus.indexOf(comp) + 1}` : name;
    }
    boardNode(board, pin) {
      return board ? this.pinNode(board.comp, this.resolvePinId(pin, board)) : this.mcuNode(pin);
    }
    vccOf(board) {
      const def = board && CS.defs[board.comp.type];
      return def ? (def.vcc || 5) : (board ? 5 : this.vcc);
    }
    adcMaxOf(board) {
      const def = board && CS.defs[board.comp.type];
      return def ? ('esp,rp'.includes(def.family) ? 4095 : 1023) : this.adcMax;
    }
    rxFor(compId) { const b = (this.boards || []).find(x => x.comp.id === compId); return b || null; }
    exportsFor(compId) { const b = this.rxFor(compId); return b ? b.exports : this.exports; }
    // UART bridge — a serial byte stream from `fromBoard` lands in the RX buffer of any
    // other board whose RX pin shares the TX net (TX→RX across a wire).
    routeUart(fromBoard, text) {
      if (!fromBoard || !this.netRoot) return;
      const uart = uartPinsOf(fromBoard.comp.type);
      if (!uart) return;
      const root = this.netRoot.get(fromBoard.comp.id + '.' + uart.tx);
      if (!root) return;
      for (const b of this.boards) {
        if (b === fromBoard) continue;
        const u2 = uartPinsOf(b.comp.type);
        if (!u2 || this.netRoot.get(b.comp.id + '.' + u2.rx) !== root) continue;
        b.serialRx += text;
        if (fromBoard.baud && b.baud && fromBoard.baud !== b.baud && !b._baudWarned) {
          b._baudWarned = true;
          this.serialEvents.push({ t: this.now, text: `⚠️ UART baud mismatch: ${fromBoard.tag} @${fromBoard.baud} → ${b.tag} @${b.baud}`, sys: true });
          this.emit('serial');
        }
      }
    }

    resolvePinId(p, board) {
      if (p == null) return null;
      if (typeof p === 'string') {
        if (/^A\d/.test(p) || /^GP/.test(p)) return p;
        if (/^D\d/.test(p)) return p;
        p = parseInt(p, 10);
      }
      if (isNaN(p)) return null;
      const t = board ? board.comp.type : (this.mcu ? this.mcu.type : 'uno');
      if (t === 'esp8266') return (CS.defs.esp8266.gpioMap || {})[p] || 'D1';
      if (t === 'pico') return 'GP' + p;
      if (t === 'esp32') return String(p);
      if (t.startsWith('rpi')) { const gm = board ? board.gpioMode : this.gpioMode; return String(gm === 'BOARD' ? (RPI_BOARD_TO_BCM[p] ?? p) : p); }
      if (t === 'mega') return p < 54 ? 'D' + p : 'A' + (p - 54);
      return p < 14 ? 'D' + p : 'A' + (p - 14);
    }
    pinNode(comp, pinId) { return comp.id + '.' + pinId; }
    mcuNode(pin) { return this.mcu ? this.pinNode(this.mcu, this.resolvePinId(pin)) : null; }
    get vcc() { return this.mcu ? (CS.defs[this.mcu.type].vcc || 5) : 5; }
    get adcMax() { return (this.mcu && 'esp,rp'.includes(CS.defs[this.mcu.type].family)) ? 4095 : 1023; }
    channelOf(node) {
      // find an MCU output channel driving this node's net
      const root = this.netRoot.get(node); if (!root) return null;
      const members = this.netMembers.get(root) || [];
      for (const m of members) {
        const [cid, pid] = m.split('.');
        for (const b of (this.boards || [])) {
          if (b.channels && cid === b.comp.id) { const ch = b.channels[pid]; if (ch && ch.out) return ch; }
        }
        // channels of a board inspected before sim start (editor probes)
        if (!(this.boards && this.boards.length) && this.mcu && this.channels && cid === this.mcu.id) { const ch = this.channels[pid]; if (ch && ch.out) return ch; }
      }
      return null;
    }

    /* ---------- compile ---------- */
    compile(code, lang, board) {
      this.errors = [];
      const tr = CS.transpile(code, lang);
      if (!tr.ok) return { error: { line: 0, msg: tr.error.msg } };
      const RT = CS.runtime(this, board || null);
      const names = Object.keys(RT).join(',');
      const body =
        `const {${names}} = rt;\n` +
        `function __exports(){ return { setup: typeof setup!=='undefined'?setup:null, loop: typeof loop!=='undefined'?loop:null, __vars:(x)=>{ try { return eval(x); } catch(e){ return undefined; } } }; }\n` +
        tr.js +
        `\n;return __exports();`;
      try {
        const factory = new Function('rt', 'return (function*(){\n' + body + '\n})');
        if (board) { board.progFactory = factory; board.rt = RT; }
        else { this.progFactory = factory; this.rt = RT; } // legacy mirror
        return { ok: true };
      } catch (e) {
        let line = 0;
        const m = String(e.stack || e.message).match(/<anonymous>:(\d+)/);
        if (m) line = Math.max(1, parseInt(m[1]) - 3);
        return { error: { line, msg: e.message.replace(/<anonymous>:\d+:\d+\)?\s*/, '') } };
      }
    }

    /* Accepts either (code, lang) for the primary board, or a sketch map
       { [mcuCompId]: { code, lang } } spanning every board on the bench.
       Every board gets its own program, channels and serial buffers —
       they run in parallel over one shared net solver, and UART TX bytes
       route across wires into the RX buffer of any board listening there. */
    start(codeOrMap, lang) {
      const sketchMap = (codeOrMap && typeof codeOrMap === 'object') ? codeOrMap : null;
      if (this.frameReq) { cancelAnimationFrame(this.frameReq); this.frameReq = null; }
      this.attach(this.doc);
      if (!this.mcus.length) {
        this.emit('compileError', { line: 0, msg: 'Add a microcontroller board before running — your code needs a brain!' });
        return false;
      }
      // one runtime record per board (parallel engines sharing the nets)
      this.boards = this.mcus.map((comp, i) => {
        const sk = sketchMap ? (sketchMap[comp.id] || null) : (i === 0 ? { code: codeOrMap, lang } : null);
        return {
          comp, tag: this.boardTag(comp),
          lang: sk ? (sk.lang || 'cpp') : 'cpp',
          code: sk ? String(sk.code || '') : '',
          channels: {}, toneStop: {}, serialRx: '', interrupts: [], gpioMode: 'BCM',
          holdUntil: 0, line: 0, stage: 'setup', exports: {},
          cur: null, curDone: false, topLevel: false,
          progFactory: null, rt: null, prog: null, baud: 0, empty: false, _baudWarned: false
        };
      });
      // compile all sketches up-front — report the first error with its board tag
      this.errors = [];
      for (const b of this.boards) {
        if (!b.code.trim()) { b.empty = true; continue; }
        const r = this.compile(b.code, b.lang, b);
        if (r.error) {
          const hadMany = this.boards.length > 1;
          this.boards = [];
          this.emit('compileError', { line: r.error.line, comp: b.comp.id, board: b.tag, msg: (hadMany ? `[${b.tag}] ` : '') + r.error.msg });
          return false;
        }
      }
      this.state = 'running';
      this.now = 0; this.holdUntil = 0; this.line = 0;
      this.serialEvents = [{ t: 0, text: '— simulation started —', sys: true }];
      this.samples.clear();
      this.dynLinks = [];
      this.drives = [];
      this.marked = new Set();
      this.errorLine = 0;
      if (!this.debugBoardId || !this.boards.some(b => b.comp.id === this.debugBoardId)) {
        this.debugBoardId = this.boards[0].comp.id;
      }
      CS.audio.init();
      // boot each program — C++ sketches return {setup, loop} immediately;
      // MicroPython-style scripts run top-level: they BECOME the live program
      for (const b of this.boards) {
        if (b.empty) continue;
        try { this.bootBoard(b); } catch (e) { this.crash(e, b); return false; }
      }
      // legacy mirrors → primary board (single-board callers & probes)
      const primary = this.boards[0];
      this.channels = primary.channels;
      this.interrupts = primary.interrupts;
      this.toneStop = primary.toneStop;
      this.mirrorPrimary(primary);
      this.lastFrameTs = performance.now();
      const loop = () => { this.frameReq = requestAnimationFrame(loop); this.frame(); };
      loop();
      this.emit('state', this.state);
      return true;
    }

    bootBoard(b) {
      b.prog = b.progFactory(b.rt)();
      b.topLevel = false;
      let r = b.prog.next(), guard = 0;
      while (!r.done && guard++ < 200000) {
        const v = r.value;
        if (v && typeof v === 'object' && v.d != null) { // top-level sleep → script is the program
          b.topLevel = true;
          b.holdUntil = this.now + Math.max(0, +v.d || 0);
          break;
        }
        r = b.prog.next();
      }
      if (!b.topLevel) b.exports = r.done ? (r.value || {}) : {};
      if (guard >= 200000) { b.topLevel = true; b.holdUntil = this.now + 1; }
      b.stage = b.topLevel ? 'loop' : 'setup';
      b.cur = b.topLevel ? b.prog : (b.exports.setup ? b.exports.setup() : null);
      b.curDone = false;
    }

    // legacy single-board fields mirror one board (usually the primary)
    mirrorPrimary(b) {
      if (!b) return;
      this.prog = b.prog; this.rt = b.rt || this.rt; this.progFactory = b.progFactory || this.progFactory;
      this.topLevel = b.topLevel; this.stage = b.stage;
      this.cur = b.cur; this.curDone = b.curDone;
      this.holdUntil = b.holdUntil; this.line = b.line;
      this.exports = b.exports; this.serialRx = b.serialRx;
    }
    pause() { if (this.state === 'running') { this.state = 'paused'; this.emit('state', this.state); } }
    resume() { if (this.state === 'paused') { this.state = 'running'; this.lastFrameTs = performance.now(); this.emit('state', this.state); } }
    stop() {
      this.state = 'idle';
      if (this.frameReq) cancelAnimationFrame(this.frameReq);
      this.frameReq = null;
      this.boards = [];
      CS.audio.stopAll();
      if (this.doc) this.doc.components.forEach(c => { c.state = {}; });
      this.serialEvents && this.serialEvents.push({ t: this.now, text: '— simulation stopped —', sys: true });
      this.emit('serial');
      this.emit('state', this.state);
      this.emit('fullRefresh');
    }
    stepOnce() {
      if (this.state === 'idle' || this.state === 'error') return;
      this.stepArmed = true;
      if (this.state === 'paused') { this.state = 'running'; this.frame(true); this.state = 'paused'; this.emit('state', this.state); }
    }

    crash(e, board) {
      this.state = 'error';
      const line = board ? board.line : this.line;
      this.errorLine = line;
      this.emit('runtimeError', {
        line, msg: e.message,
        comp: board ? board.comp.id : (this.mcu ? this.mcu.id : null),
        board: board ? board.tag : undefined
      });
      console.error('sim crash @line', line, e);
    }

    /* ---------- scheduler ---------- */
    advanceBoard(b, budgetStmts) {
      let stmts = 0, restarts = 0;
      while (stmts < budgetStmts) {
        if (!b.cur || b.curDone) {
          if (b.stage === 'setup') { b.stage = 'loop'; restarts = 0; }
          if (b.stage === 'loop' && ((b.exports && b.exports.loop) || b.topLevel)) {
            if (++restarts > 400) { b.holdUntil = this.now + 1; return 'waiting'; } // empty loop() guard
            b.cur = b.topLevel ? b.progFactory(b.rt)() : b.exports.loop();
            b.curDone = false;
          }
          else return 'done';
        }
        let r;
        try { r = b.cur.next(); }
        catch (e) { this.crash(e, b); return 'error'; }
        if (r.done) { b.curDone = true; if (b.stage === 'setup') b.holdUntil = this.now; continue; }
        const v = r.value;
        if (v && typeof v === 'object') {
          if (v.d != null) {
            b.holdUntil = Math.max(b.holdUntil, this.now) + Math.max(0, +v.d || 0);
            return 'waiting';
          }
          if (v.l != null) {
            b.line = v.l; stmts++;
            const dbg = !this.debugBoardId || b.comp.id === this.debugBoardId;
            if (dbg) this.emit('line', v.l, b.comp.id);
            if (dbg && (this.breakpoints.has(v.l) || this.stepArmed)) {
              this.stepArmed = false;
              b.holdUntil = this.now;
              this.pause();
              return 'break';
            }
          }
        }
      }
      // ran out of budget without yielding delay → cooperative 1ms nap
      b.holdUntil = this.now + 1;
      return 'waiting';
    }

    // legacy single-board entry point (primary board)
    advanceGenerator(budgetStmts) {
      const b = (this.boards || [])[0];
      return b ? this.advanceBoard(b, budgetStmts) : 'done';
    }

    frame(single) {
      if (this.state !== 'running') return;
      const ts = performance.now();
      let dt = clamp(ts - this.lastFrameTs, 0, 80) * this.speed;
      this.lastFrameTs = ts;
      if (single) dt = 0.2;

      this.now += dt;

      // physics at frame boundary; resume each board whose delay (if any) has elapsed
      let guard = 0;
      do {
        this.pipeline();
        if (this.state !== 'running') break;
        const awake = (this.boards || []).filter(b => !b.empty && b.holdUntil <= this.now);
        if (!awake.length) break;                        // every board asleep in delay()
        let more = false;
        for (const b of awake) {
          this.advanceBoard(b, single ? 1 : 8000);
          if (this.state !== 'running') break;
          if (b === this.boards[0]) this.mirrorPrimary(b);
          if (b.holdUntil <= this.now) more = true;      // 0-length delay → keep cooperating
        }
        if (this.state !== 'running') break;
        if (!more) break;
        guard++;
      } while (guard < 40 && this.state === 'running');

      this.sampleScope();
      this.flushMarked();
      this.emit('tick');
      this.emit('clock', this.now);
    }

    /* ---------- electrical pipeline ---------- */
    pipeline() {
      const doc = this.doc; if (!doc) return;
      const comps = doc.components;
      this.drives = [];
      this.dynLinks = [];
      const api = this.componentApi(true);
      // MCU channels → drivers (every board on the bench)
      this.applyBoards();
      for (const c of comps) { const d = CS.defs[c.type]; if (d && d.tick) { try { d.tick(c, api, 1, this); } catch { /* tick resilience */ } } }
      this.solveNets(api);
      // sensors read nets
      for (const c of comps) { const d = CS.defs[c.type]; if (d && d.sense) { try { d.sense(c, api, 1); } catch { } } }
      this.checkInterrupts();
      // tone stop scheduling (per board)
      for (const b of (this.boards && this.boards.length ? this.boards : [{ toneStop: this.toneStop || {}, channels: this.channels || {} }])) {
        for (const pid in b.toneStop) { if (this.now >= b.toneStop[pid]) { delete b.toneStop[pid]; const ch = b.channels[pid]; if (ch && ch.type === 'tone') { ch.out = false; ch.dead = true; } } }
      }
    }

    applyBoards() {
      if (this.boards && this.boards.length) { for (const b of this.boards) this.applyBoardChannels(b); }
      else if (this.mcu) this.applyMcu(); // pre-start editor probes
    }

    applyBoardChannels(board) {
      const mcu = board.comp;
      const def = CS.defs[mcu.type];
      const channels = board.channels = board.channels || {};
      for (const p of def.pins) {
        const node = this.pinNode(mcu, p.id);
        if (p.kind === 'ground') { this.drives.push({ node, v: 0, strength: 'strong' }); continue; }
        if (p.kind === 'power') {
          const v = p.id.startsWith('3V3') || p.id.includes('3V3') ? 3.3 : p.id === 'VIN' ? 5 : p.id.startsWith('5V') ? 5 : p.id === 'VBUS' ? 5 : p.id === 'VSYS' ? 5 : p.id === 'EN' ? 3.3 : def.vcc;
          this.drives.push({ node, v, strength: 'strong' }); continue;
        }
        const ch = channels[p.id];
        if (!ch) continue;
        if (!ch.out) { // input
          if (ch.mode === 'pull') this.drives.push({ node, v: def.vcc, strength: 'weak' });
          continue;
        }
        if (ch.type === 'digital') this.drives.push({ node, v: ch.v ? def.vcc : 0, strength: 'strong' });
        else if (ch.type === 'pwm') this.drives.push({ node, v: ch.duty * def.vcc, strength: 'strong' });
        else if (ch.type === 'tone') this.drives.push({ node, v: def.vcc * 0.5, strength: 'strong' });
        else if (ch.type === 'servo') this.drives.push({ node, v: 0.2, strength: 'strong' });
      }
    }

    // legacy single-board path (probes before/without a run)
    applyMcu() {
      if (!this.mcu) return;
      this.channels = this.channels || {};
      this.applyBoardChannels({ comp: this.mcu, channels: this.channels });
    }

    solveNets() {
      const doc = this.doc;
      const parent = new Map();
      const find = x => { let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
      const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
      const allNodes = [];
      for (const c of doc.components) {
        const def = CS.defs[c.type]; if (!def) continue;
        for (const p of def.pins) { const n = c.id + '.' + p.id; if (!parent.has(n)) parent.set(n, n); allNodes.push(n); }
        if (def.links) for (const [a, b] of (typeof def.links === 'function' ? def.links() : def.links)) union(c.id + '.' + a, c.id + '.' + b);
        // two-terminal passives conduct (ideal part: logic flows, value tracked for current math)
        if (c.type === 'resistor') union(c.id + '.1', c.id + '.2');
      }
      for (const w of doc.wires) union(w.a.c + '.' + w.a.p, w.b.c + '.' + w.b.p);
      for (const [a, b] of this.dynLinks) union(a, b);

      // Implicit GND rail — all ground pins on MCUs and components share a common net
      if (doc.components) {
        let gndAnchor = null;
        for (const c of doc.components) {
          const def = CS.defs[c.type];
          if (!def || !def.pins) continue;
          for (const p of def.pins) {
            if (p.kind === 'ground') {
              const n = c.id + '.' + p.id;
              if (!gndAnchor) gndAnchor = n;
              else union(gndAnchor, n);
            }
          }
        }
      }

      this.netRoot = new Map();
      this.netMembers = new Map();
      for (const n of allNodes) {
        const r = find(n);
        this.netRoot.set(n, r);
        if (!this.netMembers.has(r)) this.netMembers.set(r, []);
        this.netMembers.get(r).push(n);
      }
      // resolve voltages
      this.netInfo = new Map();
      const byNet = new Map();
      for (const d of this.drives) {
        const r = find(d.node);
        if (!byNet.has(r)) byNet.set(r, []);
        byNet.get(r).push(d);
      }
      for (const [r] of this.netMembers) {
        const drives = byNet.get(r) || [];
        const strong = drives.filter(d => d.strength === 'strong').map(d => d.v);
        const weak = drives.filter(d => d.strength === 'weak').map(d => d.v);
        let volts = null, short = false, driven = 'float';
        if (strong.length) {
          let hi = 0, lo = 0, sum = 0;
          strong.forEach(v => { sum += v; if (v > 2) hi++; else if (v < 0.8) lo++; });
          if (hi && lo) { short = true; driven = 'short'; }
          else { volts = sum / strong.length; driven = 'strong'; }
        } else if (weak.length) { volts = weak.reduce((a, b) => a + b, 0) / weak.length; driven = 'weak'; }
        this.netInfo.set(r, { volts, short, driven });
      }
    }

    componentApi() {
      const eng = this;
      const api = {
        pin: (c, id) => c.id + '.' + id,
        drive: (node, v, strength) => { eng.drives.push({ node, v: +v || 0, strength: strength || 'strong' }); },
        connect: (a, b) => { eng.dynLinks.push([a, b]); },
        volts: node => { const r = eng.netRoot && eng.netRoot.get(node); if (!r) return null; const i = eng.netInfo && eng.netInfo.get(r); return i ? i.volts : null; },
        state: node => { const v = api.volts(node); const r = eng.netRoot && eng.netRoot.get(node); const info = r && eng.netInfo && eng.netInfo.get(r); if (info && info.short) return 'short'; if (v == null) return 'float'; return v >= 2 ? 'hi' : v <= 0.8 ? 'lo' : 'mid'; },
        channel: node => eng.channelOf(node),
        seriesResistor: (nA, nB) => eng.seriesResistor(nA, nB),
        markDirty: c => eng.marked.add(c.id),
        engine: eng
      };
      return api;
    }

    seriesResistor(nA, nB) {
      if (!this.netRoot) return null;
      const rA = this.netRoot.get(nA), rB = this.netRoot.get(nB);
      let best = null;
      for (const c of this.doc.components) {
        if (c.type !== 'resistor') continue;
        const r1 = this.netRoot.get(c.id + '.1');
        if (r1 === rA || r1 === rB) {
          const v = Math.max(1, +c.props.value || 220);
          if (best == null || v < best) best = v;
        }
      }
      return best;
    }

    markDirtyById(id) { this.marked.add(id); }
    flushMarked() {
      if (!this.marked || !this.marked.size) return;
      const ids = [...this.marked]; this.marked.clear();
      this.emit('dirty', ids);
    }

    checkInterrupts() {
      const boards = (this.boards && this.boards.length) ? this.boards
        : (this.interrupts && this.interrupts.length ? [{ comp: this.mcu, interrupts: this.interrupts }] : []);
      for (const b of boards) {
        if (!b.interrupts || !b.interrupts.length) continue;
        for (const inr of b.interrupts) {
          const node = this.boardNode(b.comp ? b : null, inr.pin);
          if (!node) continue;
          const st = this.componentApi().state(node);
          const hi = st === 'hi' ? 1 : 0;
          const fire = (inr.mode === 'CHANGE' && hi !== inr.last) || (inr.mode === 'RISING' && hi && !inr.last) || (inr.mode === 'FALLING' && !hi && inr.last);
          if (fire && inr.last != null) {
            try { const g = inr.fn(); let r = g.next(), g2 = 0; while (!r.done && g2++ < 20000) r = g.next(); } catch (e) { this.crash(e, b); }
          }
          inr.last = hi;
        }
      }
    }

    /* ---------- scope ---------- */
    sampleScope() {
      const api = this.componentApi();
      for (const ch of this.scopeChannels) {
        const node = ch.comp + '.' + ch.pin;
        let v;
        if (ch.mode === 'analog') v = (api.volts(node) || 0) / 5;
        else v = api.state(node) === 'hi' ? 1 : 0;
        if (!this.samples.has(node + ch.mode)) this.samples.set(node + ch.mode, []);
        const arr = this.samples.get(node + ch.mode);
        arr.push({ t: this.now, v });
        if (arr.length > 1600) arr.splice(0, 400);
      }
    }

    /* net voltage of every wire's net — for glow visuals */
    wireNetInfo(w) {
      if (!this.netRoot) return null;
      const r = this.netRoot.get(w.a.c + '.' + w.a.p);
      return r ? this.netInfo.get(r) : null;
    }
  }

  /* ================= runtime library ================= */
  CS.runtime = function (eng, board) {
    const B = board || null; // board this program runs on (null = legacy single-board)
    const chanMap = () => (B ? B.channels : (eng.channels = eng.channels || {}));
    const rxBuf = () => (B ? B.serialRx : eng.serialRx);
    const setRx = s => { if (B) B.serialRx = s; else eng.serialRx = s; };
    const vccOf = () => eng.vccOf(B);
    const adcMaxOf = () => eng.adcMaxOf(B);
    const serialLine = (args, nl) => {
      const text = args.map(a => a === undefined ? 'undefined' : (a === null ? 'null' : String(a))).join(' ');
      eng.serialEvents.push({ t: eng.now, text, nl: nl !== false, comp: B ? B.comp.id : undefined, board: B ? B.tag : undefined });
      if (B) eng.routeUart(B, text + (nl !== false ? '\n' : ''));
      eng.emit('serial');
    };
    const Serial = {
      begin(baud) { if (B) B.baud = baud || 9600; }, end() { },
      print: (...a) => serialLine(a, false),
      println: (...a) => serialLine(a, true),
      write: (...a) => serialLine(a, false),
      available: () => rxBuf().length,
      read: () => { const s = rxBuf(); const c = s.charCodeAt(0); setRx(s.slice(1)); return isNaN(c) ? -1 : c; },
      readString: () => { const s = rxBuf(); setRx(''); return s; },
      peek: () => { const s = rxBuf(); return s.length ? s.charCodeAt(0) : -1; },
      parseInt: () => { const s = rxBuf(); const m = s.match(/-?\d+/); if (m) { setRx(s.slice(m.index + m[0].length)); return parseInt(m[0]); } return 0; },
      flush() { }
    };

    const ch = pin => { const id = eng.resolvePinId(pin, B); if (!id) return null; const m = chanMap(); return m[id] = m[id] || { out: false, v: 0, duty: 0, mode: 'in', type: 'digital' }; };

    const firstOf = type => eng.doc.components.find(c => c.type === type);
    const pinMode = (pin, mode) => { const c = ch(pin); if (!c) return; c.out = mode === 'OUTPUT' || mode === 1; c.mode = mode === 'INPUT_PULLUP' || mode === 2 ? 'pull' : 'in'; if (c.out && c.type === 'digital') c.v = 0; };
    const digitalWrite = (pin, v) => { const c = ch(pin); if (!c) return; c.out = true; c.type = 'digital'; c.v = v ? 1 : 0; };
    const digitalRead = pin => {
      const c = ch(pin); if (c && c.out) return c.v ? 1 : 0;
      const node = eng.boardNode(B, pin); if (!node) return 0;
      const st = eng.componentApi().state(node);
      if (st === 'hi') return 1; if (st === 'lo') return 0;
      return c && c.mode === 'pull' ? 1 : 0;
    };
    const analogRead = pin => {
      const node = eng.boardNode(B, pin); if (!node) return 0;
      let v = eng.componentApi().volts(node);
      if (v == null) { v = 0; }
      return clamp(Math.round(v / vccOf() * adcMaxOf()), 0, adcMaxOf());
    };
    const analogWrite = (pin, duty) => { const c = ch(pin); if (!c) return; c.out = true; c.type = 'pwm'; c.duty = clamp(duty / 255, 0, 1); };
    const tone = (pin, freq, dur) => { const c = ch(pin); if (!c) return; c.out = true; c.type = 'tone'; c.freq = freq; if (dur) (B ? B.toneStop : (eng.toneStop = eng.toneStop || {}))[eng.resolvePinId(pin, B)] = eng.now + dur; };
    const noTone = pin => { const c = ch(pin); if (c && c.type === 'tone') { c.out = false; c.dead = true; } };
    const pulseIn = (pin, level, timeout) => {
      const node = eng.boardNode(B, pin);
      const us = eng.doc.components.find(c => c.type === 'ultrasonic');
      if (us && eng.netRoot && eng.netRoot.get(us.id + '.ECHO') === eng.netRoot.get(node)) {
        return Math.round(us.props.dist * 58.31 + 20);
      }
      return 0;
    };

    /* --- library classes --- */
    class Servo {
      attach(pin) { this.pin = pin; const c = ch(pin); c.out = true; c.type = 'servo'; c.angle = 90; return 1; }
      write(deg) { if (!this.pin && this.pin !== 0) return; ch(this.pin).angle = clamp(deg, 0, 180); }
      writeMicroseconds(us) { this.write(clamp((us - 500) / 2000 * 180, 0, 180)); }
      detach() { }
      read() { return this.pin != null ? (ch(this.pin).angle || 0) : 0; }
    }
    class LiquidCrystal {
      constructor(rs, e, d4, d5, d6, d7) { this.pins = [rs, e, d4, d5, d6, d7]; this.comp = firstOf('lcd'); this.cursor = [0, 0]; if (this.comp) this.comp.state.lines = ['', '']; }
      begin() { if (this.comp) { this.comp.state.lines = ['', '']; eng.markDirtyById(this.comp.id); } }
      clear() { if (this.comp) { this.comp.state.lines = ['', '']; this.cursor = [0, 0]; eng.markDirtyById(this.comp.id); } }
      setCursor(col, row) { this.cursor = [clamp(col | 0, 0, 15), clamp(row | 0, 0, 1)]; }
      print(msg) {
        const c = this.comp; if (!c) return;
        const lines = c.state.lines || ['', ''];
        let [col, row] = this.cursor;
        for (const chr of String(msg)) {
          if (chr === '\n') { row = Math.min(1, row + 1); col = 0; continue; }
          if (col > 15) { col = 0; row = Math.min(1, row + 1); }
          lines[row] = (lines[row] || '').padEnd(col, ' ').slice(0, col) + chr + (lines[row] || '').slice(col + 1);
          col++;
        }
        this.cursor = [col, row];
        c.state.lines = lines;
        eng.markDirtyById(c.id);
      }
      println(m) { this.print(m); }
      home() { this.cursor = [0, 0]; }
      backlight() { } noBacklight() { } display() { } noDisplay() { } init() { this.begin(); }
      createChar() { } scrollDisplayLeft() { } scrollDisplayRight() { } blink() { } noBlink() { } cursor() { } noCursor() { }
    }
    class DHT {
      constructor(pin, type) { this.pin = pin; this.comp = firstOf('dht22'); }
      readTemperature(f) { const c = this.comp; if (!c) return NaN; const v = (+c.props.temp || 25) + (Math.random() - 0.5) * 0.3; return f ? v * 9 / 5 + 32 : Math.round(v * 10) / 10; }
      readHumidity() { const c = this.comp; if (!c) return NaN; return Math.round((+c.props.hum || 50) + (Math.random() - 0.5)); }
      readHeatIndex() { return this.readTemperature() + 2; }
      begin() { }
    }
    class OLED {
      constructor(sda, scl) { this.comp = firstOf('oled'); if (this.comp) this.comp.state.lines = this.comp.state.lines || []; }
      begin() { if (this.comp) { this.comp.state.lines = []; } }
      clear() { if (this.comp) { this.comp.state.lines = []; eng.markDirtyById(this.comp.id); } }
      print(m) { const c = this.comp; if (!c) return; const L = c.state.lines; L[L.length - 1] = ((L[L.length - 1] || '') + String(m)).slice(0, 14); eng.markDirtyById(c.id); }
      println(m) { const c = this.comp; if (!c) return; c.state.lines.push(String(m).slice(0, 14)); if (c.state.lines.length > 8) c.state.lines.shift(); eng.markDirtyById(c.id); }
      setCursor() { } display() { }
    }
    const TINY_FONT = {
      '0': [0x1F, 0x11, 0x1F], '1': [0x12, 0x1F, 0x10], '2': [0x1D, 0x15, 0x17], '3': [0x15, 0x15, 0x1F], '4': [0x07, 0x04, 0x1F], '5': [0x17, 0x15, 0x1D], '6': [0x1F, 0x15, 0x1D], '7': [0x01, 0x01, 0x1F], '8': [0x1F, 0x15, 0x1F], '9': [0x17, 0x15, 0x1F],
      'A': [0x1E, 0x05, 0x1E], 'B': [0x1F, 0x15, 0x0A], 'C': [0x0E, 0x11, 0x11], 'D': [0x1F, 0x11, 0x0E], 'E': [0x1F, 0x15, 0x11], 'F': [0x1F, 0x05, 0x01], 'G': [0x0E, 0x11, 0x1D], 'H': [0x1F, 0x04, 0x1F], 'I': [0x11, 0x1F, 0x11], 'J': [0x08, 0x10, 0x0F], 'K': [0x1F, 0x04, 0x1B], 'L': [0x1F, 0x10, 0x10], 'M': [0x1F, 0x02, 0x04, 0x02, 0x1F], 'N': [0x1F, 0x02, 0x04, 0x1F], 'O': [0x0E, 0x11, 0x0E], 'P': [0x1F, 0x05, 0x02], 'Q': [0x0E, 0x19, 0x1E], 'R': [0x1F, 0x05, 0x1A], 'S': [0x12, 0x15, 0x09], 'T': [0x01, 0x1F, 0x01], 'U': [0x0F, 0x10, 0x0F], 'V': [0x07, 0x08, 0x07], 'W': [0x1F, 0x08, 0x04, 0x08, 0x1F], 'X': [0x1B, 0x04, 0x1B], 'Y': [0x03, 0x1C, 0x03], 'Z': [0x19, 0x15, 0x13], ' ': [0, 0, 0], '.': [0x10], '-': [0x04, 0x04, 0x04], '!': [0x17], ':': [0x0A], '>': [0x04, 0x0A, 0x11], '<': [0x11, 0x0A, 0x04], '°': [0x02, 0x05, 0x02]
    };
    class LedMatrix {
      constructor() { this.comp = firstOf('matrix'); if (this.comp && !this.comp.state.grid) { this.comp.state.grid = Array.from({ length: 8 }, () => Array(8).fill(0)); } }
      grid() { if (this.comp && !this.comp.state.grid) this.comp.state.grid = Array.from({ length: 8 }, () => Array(8).fill(0)); return this.comp ? this.comp.state.grid : null; }
      set(x, y, on = 1) { const g = this.grid(); if (!g) return; x |= 0; y |= 0; if (x >= 0 && x < 8 && y >= 0 && y < 8) { g[y][x] = on ? 1 : 0; eng.markDirtyById(this.comp.id); } }
      clear() { const g = this.grid(); if (g) { for (let y = 0; y < 8; y++) g[y].fill(0); eng.markDirtyById(this.comp.id); } }
      fill() { const g = this.grid(); if (g) { for (let y = 0; y < 8; y++) g[y].fill(1); eng.markDirtyById(this.comp.id); } }
      setRow(y, byte) { for (let x = 0; x < 8; x++) this.set(x, y, (byte >> x) & 1); }
      text(str, x = 0, y = 1) {
        this.clear();
        String(str).toUpperCase().split('').forEach((chr, i) => {
          const glyph = TINY_FONT[chr] || [0x1F, 0x1F, 0x1F];
          glyph.forEach((colByte, ci) => { for (let yy = 0; yy < 5; yy++) if ((colByte >> yy) & 1) this.set(x + i * 4 + ci, y + yy, 1); });
        });
      }
      scroll() { const g = this.grid(); if (g) { for (let y = 0; y < 8; y++) { g[y].shift(); g[y].push(0); } eng.markDirtyById(this.comp.id); } }
    }
    class IMU {
      constructor() { this.comp = firstOf('mpu6050'); this._t = 0; }
      get accelX() { return Math.round(Math.sin((this._t += 0.02)) * 0.7 * 100) / 100; }
      get accelY() { return Math.round(Math.sin(this._t * 2) * 0.4 * 100) / 100; }
      get accelZ() { return 0.98; }
      get gyroX() { return Math.round(Math.cos(this._t) * 8 * 10) / 10; }
      get gyroY() { return Math.round(Math.cos(this._t * 2) * 5 * 10) / 10; }
      begin() { }
    }
    class RFID {
      constructor() { this.comp = firstOf('rfid'); }
      available() { return !!(this.comp && this.comp.state.uid); }
      readUid() { if (!this.comp) return ''; return this.comp.state.uid || ''; }
      read() { return this.readUid(); }
      clear() { if (this.comp) { this.comp.state.uid = null; eng.markDirtyById(this.comp.id); } }
    }
    class Stepper {
      constructor(steps, p1, p2, p3, p4) { this.steps = steps || 2048; this.comp = firstOf('stepper'); }
      step(n) { if (!this.comp) return; this.comp.state.deg = ((this.comp.state.deg || 0) + 360 * n / this.steps); const d = CS.defs.stepper; if (d.frameUpdate) d.frameUpdate(this.comp); }
      setSpeed() { }
    }

    /* --- MicroPython shim --- */
    class Pin {
      constructor(n, mode) { this.n = n; this.mode = mode; pinMode(n, mode === Pin.OUT ? 'OUTPUT' : mode === Pin.PULL_UP ? 'INPUT_PULLUP' : 'INPUT'); Pin.byN[n] = this; }
      value(v) { if (v === undefined) return digitalRead(this.n); digitalWrite(this.n, v); return undefined; }
      on() { this.value(1); } off() { this.value(0); }
      irq() { }
    }
    Pin.OUT = 1; Pin.IN = 0; Pin.PULL_UP = 2; Pin.OPEN_DRAIN = 3; Pin.byN = {};
    class ADC {
      constructor(pinObj) { this.pin = pinObj instanceof Pin ? pinObj.n : pinObj; }
      read() { return analogRead(this.pin); }
      read_u16() { return Math.round(analogRead(this.pin) * 65535 / adcMaxOf()); }
      atten() { } width() { }
    }
    class PWM {
      constructor(pinObj, freq) { this.pin = pinObj instanceof Pin ? pinObj.n : pinObj; this._d = 0; }
      duty(v) { if (v === undefined) return this._d; this._d = v; const c = ch(this.pin); c.out = true; c.type = 'pwm'; c.duty = clamp(v / 1023, 0, 1); }
      duty_u16(v) { this.duty(Math.round(v / 65535 * 1023)); }
      freq() { } deinit() { }
    }

    /* --- RPi.GPIO shim --- */
    const GPIO = {
      BCM: 'BCM', BOARD: 'BOARD', OUT: 'OUTPUT', IN: 'INPUT', PUD_UP: 'PUD_UP', HIGH: 1, LOW: 0,
      setmode(mode) { const gm = (mode === 'BOARD' || mode === GPIO.BOARD) ? 'BOARD' : 'BCM'; if (B) B.gpioMode = gm; else eng.gpioMode = gm; }, setwarnings() { }, cleanup() { const m = chanMap(); for (const k in m) delete m[k]; },
      setup(pin, mode, pud) { pinMode(pin, mode === 'OUTPUT' ? 'OUTPUT' : pud === 'PUD_UP' ? 'INPUT_PULLUP' : 'INPUT'); },
      output(pin, v) { digitalWrite(pin, v); },
      input(pin) { return digitalRead(pin); },
      analog(pin) { return analogRead(pin); }, // CircuitTecture extension for analog stand-ins
      PWM: class { constructor(pin, freq) { this.pwm = new PWM(pin, freq); } start(duty) { this.pwm.duty(duty * 10.23); } ChangeDutyCycle(d) { this.pwm.duty(d * 10.23); } stop() { } }
    };

    /* --- gpiozero-style helpers --- */
    class LED { constructor(pin) { this.pin = pin; pinMode(pin, 'OUTPUT'); } on() { digitalWrite(this.pin, 1); } off() { digitalWrite(this.pin, 0); } toggle() { digitalWrite(this.pin, digitalRead(this.pin) ? 0 : 1); } get value() { return digitalRead(this.pin); } set value(v) { digitalWrite(this.pin, v); } close() { this.off(); } }
    class PWMLED extends LED { constructor(pin) { super(pin); this._value = 0; } on() { this.value = 1; } off() { this.value = 0; } get value() { return this._value || 0; } set value(v) { this._value = clamp(+v || 0, 0, 1); analogWrite(this.pin, Math.round(this._value * 255)); } pulse() { this.value = 0.5; } }
    class Button { constructor(pin, opts) { this.pin = pin; pinMode(pin, 'INPUT_PULLUP'); } get value() { return digitalRead(this.pin); } get is_pressed() { return !!this.value; } wait_for_press() { return true; } when_pressed(fn) { if (typeof fn === 'function' && this.is_pressed) fn(); } }
    class Buzzer extends LED { beep() { this.on(); } }
    class Motor { constructor(forward, backward, enable) { this.forwardPin = forward; this.backwardPin = backward; this.enablePin = enable; [forward, backward, enable].forEach(p => p != null && pinMode(p, 'OUTPUT')); } forward(speed = 1) { digitalWrite(this.forwardPin, 1); digitalWrite(this.backwardPin, 0); if (this.enablePin != null) analogWrite(this.enablePin, Math.round(clamp(speed,0,1)*255)); } backward(speed = 1) { digitalWrite(this.forwardPin, 0); digitalWrite(this.backwardPin, 1); if (this.enablePin != null) analogWrite(this.enablePin, Math.round(clamp(speed,0,1)*255)); } stop() { digitalWrite(this.forwardPin, 0); digitalWrite(this.backwardPin, 0); } }
    class DistanceSensor { constructor(echo, trigger) { this.echo = echo; this.trigger = trigger; } get distance() { const us = eng.doc.components.find(c => c.type === 'ultrasonic'); return us ? (+us.props.dist || 100) / 100 : 1; } get value() { return this.distance; } }
    class SMBus { constructor(bus = 1) { this.bus = bus; this.regs = {}; } _k(a, r) { return String(a) + ':' + String(r); } write_byte_data(addr, reg, val) { this.regs[this._k(addr, reg)] = val & 255; } read_byte_data(addr, reg) { return this.regs[this._k(addr, reg)] || 0; } write_i2c_block_data(addr, reg, vals) { (vals || []).forEach((v, i) => this.write_byte_data(addr, reg + i, v)); } read_i2c_block_data(addr, reg, len) { return Array.from({ length: len || 1 }, (_, i) => this.read_byte_data(addr, reg + i)); } close() {} }

    const time = { ticks_ms: () => eng.now | 0, ticks_us: () => eng.now * 1000 | 0, ticks_diff: (a, b) => a - b, sleep: s => ({ d: s * 1000 }) };

    return Object.freeze ? {
      // constants
      HIGH: 1, LOW: 0, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP',
      CHANGE: 'CHANGE', RISING: 'RISING', FALLING: 'FALLING', DHT11: 11, DHT22: 22, DHT21: 21,
      A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, A6: 20, A7: 21,
      LED_BUILTIN: (() => { const t = B ? B.comp.type : (eng.mcu ? eng.mcu.type : ''); return t === 'esp32' || t === 'esp8266' ? 2 : t === 'pico' ? 25 : 13; })(),
      // core
      pinMode, digitalWrite, digitalRead, analogRead, analogWrite, analogReference: () => { },
      millis: () => eng.now | 0, micros: () => (eng.now * 1000) | 0,
      map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c),
      constrain: (x, a, b) => clamp(x, a, b),
      random: (a, b) => b === undefined ? Math.floor(Math.random() * (a || 32767)) : a + Math.floor(Math.random() * (b - a)),
      randomSeed: () => { },
      abs: Math.abs, min: Math.min, max: Math.max, sq: x => x * x, sqrt: Math.sqrt, pow: Math.pow,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, radians: d => d * Math.PI / 180, degrees: r => r * 180 / Math.PI,
      floor: Math.floor, ceil: Math.ceil, round: Math.round,
      tone, noTone, pulseIn, pulseInLong: pulseIn,
      attachInterrupt: (i, fn, mode) => { (B ? B.interrupts : (eng.interrupts = eng.interrupts || [])).push({ pin: i, fn, mode: mode || 'CHANGE', last: null }); },
      detachInterrupt: () => { }, digitalPinToInterrupt: p => p, interrupts: () => { }, noInterrupts: () => { },
      sizeof: x => (Array.isArray(x) ? x.length : 4), word: (a, b) => b === undefined ? a : (a << 8) | b,
      lowByte: x => x & 255, highByte: x => (x >> 8) & 255, bitRead: (x, n) => (x >> n) & 1, bitWrite: (x, n, v) => v ? x | (1 << n) : x & ~(1 << n),
      Serial,
      Servo, LiquidCrystal, LiquidCrystal_I2C: LiquidCrystal, DHT, OLED, SSD1306: OLED, MATRIX: LedMatrix, LedMatrix,
      IMU, MPU6050: IMU, RFID, MFRC522: RFID, Stepper,
      // python
      Pin, ADC, PWM, GPIO, LED, PWMLED, Button, Buzzer, Motor, DistanceSensor, SMBus, smbus: { SMBus }, smbus2: { SMBus }, gpiozero: { LED, PWMLED, Button, Buzzer, Motor, DistanceSensor }, time, math: Math, len: x => (x && x.length != null) ? x.length : 0,
      int: x => Math.trunc(Number(x) || 0), float: x => Number(x) || 0, str: x => String(x), range: (...a) => a.length === 1 ? [...Array(a[0]).keys()] : [...Array(a[1] - a[0]).keys()].map(i => i + a[0]),
      print: (...a) => serialLine(a, true)
    } : {};
  };

  CS.Engine = Engine;
  CS.sim = null; // instantiated by app
})();
