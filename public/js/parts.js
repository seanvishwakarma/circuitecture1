/* CircuitTecture — component registry: passives, inputs, sensors, outputs, real-hardware peripherals.
   Simulation hooks:
     tick(comp, api, dt)   — pre-solve: drive pins / dynamic internal links
     sense(comp, api, dt)  — post-solve: read nets, update state
     frameUpdate(comp)     — cheap DOM updates on already-rendered svg (data-k hooks)
     api: pin(comp,id), drive(node,v,strength), connect(nodeA,nodeB), volts(node), state(node),
          channel(node) -> mcu channel {type,v...}|null, powered(node), markDirty(comp)  */
  
  // Component categories:
  // - Passive Components: resistor, capacitor, potentiometer, led, ledrgb, buzzer, speaker
  // - Inputs: pushbutton, switch, slider, joystick, keypad, encoder, dipswitch
  // - Sensors: dht22, ultrasonic, pir, ldr, gas, soil, ir, mpu6050, rfid
  // - Outputs & Actuators: servo, dcmotor, stepper, relay, lcd, oled, seg7, matrix
  // - Real Hardware: camera, mic, gps
(function () {
  const CS = window.CS;
  const { R, T, CI, path, plabels } = CS._svg;
  const D = CS.defs;
  const clamp = CS.clamp;

  /* ================= RESISTOR ================= */
  const BAND = ['#111', '#7c3f12', '#dc2626', '#f59e0b', '#facc15', '#16a34a', '#2563eb', '#7c3aed', '#64748b', '#f1f5f9'];
  D.resistor = {
    type: 'resistor', name: 'Resistor', cat: 'Passive Components', icon: '〰️', w: 96, h: 26,
    desc: 'Fixed resistor. Value in Ω shown as color bands. Limits current — always use one in series with an LED.',
    pins: [{ id: '1', label: '', x: 4, y: 13, kind: 'special', nolabel: true }, { id: '2', label: '', x: 92, y: 13, kind: 'special', nolabel: true }],
    props: [{ key: 'value', label: 'Resistance (Ω)', type: 'number', def: 220, min: 1, max: 10000000 }],
    render(def, c) {
      const v = Math.max(1, +c.props.value || 220);
      const exp = Math.floor(Math.log10(v));
      const d1 = Math.floor(v / Math.pow(10, exp)), rest = v / d1;
      const d2 = Math.round(rest % 10);
      const mult = clamp(exp - (d2 ? 1 : 0), 0, 9);
      let s = path('M4 13 H26 M70 13 H92', '#94a3b8', 2.4);
      s += R(26, 4, 44, 18, '#d9c9a3', 'rx="8" stroke="#b8a67d"');
      [[34, BAND[d1]], [43, BAND[d2]], [52, BAND[mult]], [64, '#c9a227']].forEach(([x, col]) => { s += R(x, 4, 4, 18, col); });
      s += T(48, 36, fmtOhms(v), '#7d8fb3', 6);
      return s;
    }
  };
  function fmtOhms(v) { return v >= 1e6 ? (v / 1e6) + ' MΩ' : v >= 1e3 ? (v / 1e3) + ' kΩ' : v + ' Ω'; }
  CS.fmtOhms = fmtOhms;

  /* ================= CAPACITOR ================= */
  D.capacitor = {
    type: 'capacitor', name: 'Capacitor', cat: 'Passive Components', icon: '⚡', w: 56, h: 46,
    desc: 'Electrolytic capacitor (polarized!). Long leg (+) to higher potential. Smooths supply / filters noise.',
    pins: [{ id: '+', label: '+', x: 16, y: 44, o: 'l', kind: 'special' }, { id: '-', label: '−', x: 40, y: 44, o: 'r', kind: 'special' }],
    props: [{ key: 'uf', label: 'Capacitance (µF)', type: 'number', def: 100, min: 0.1, max: 10000 }],
    render(def, c) {
      let s = path('M16 44 V26 M40 44 V26', '#94a3b8', 2.2);
      s += CI(28, 14, 12, '#1e3a5f', 'stroke="#3d6db5" stroke-width="1.4"') + T(21, 10, '+', '#7dd3fc', 8);
      s += T(28, 18, (c.props.uf || 100) + 'µ', '#bed8f5', 6.5);
      return s;
    },
    sense(c, api) { const vp = api.volts(api.pin(c, '+')), vn = api.volts(api.pin(c, '-')); c.state.reversed = (vp != null && vn != null && vn > vp + 0.4); }
  };

  /* ================= POTENTIOMETER ================= */
  D.potentiometer = {
    type: 'potentiometer', name: 'Potentiometer', cat: 'Passive Components', icon: '🎛️', w: 74, h: 74,
    desc: '10 kΩ rotary pot — a voltage divider. Wiper (2) outputs between pins 1 and 3. Scroll or drag the knob.',
    pins: [{ id: '1', label: '1', x: 16, y: 68, o: 't', kind: 'special' }, { id: '2', label: '2·w', x: 37, y: 68, o: 't', kind: 'analog' }, { id: '3', label: '3', x: 58, y: 68, o: 't', kind: 'special' }],
    props: [{ key: 'value', label: 'Position', type: 'range', def: 0.5, min: 0, max: 1, step: 0.01 }],
    render(def, c) {
      const a = -135 + (c.props.value ?? 0.5) * 270;
      let s = CI(37, 34, 26, '#2b3347', 'stroke="#4b5a7a" stroke-width="1.5"') + CI(37, 34, 18, '#1a2133', 'stroke="#3b4763"');
      s += `<line data-k="pointer" x1="37" y1="34" x2="${37 + 15 * Math.cos(a * Math.PI / 180)}" y2="${34 + 15 * Math.sin(a * Math.PI / 180)}" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>`;
      s += CI(37, 34, 24, 'none', 'data-act="knob" stroke="transparent" stroke-width="9"');
      s += T(8, 10, '10k', '#7d8fb3', 6, 'start');
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const v1 = c.state.v1 ?? 0, v3 = c.state.v3 ?? 5;
      api.drive(api.pin(c, '2'), v1 + (v3 - v1) * (c.props.value ?? 0.5), 'strong');
    },
    sense(c, api) { c.state.v1 = api.volts(api.pin(c, '1')) ?? 0; c.state.v3 = api.volts(api.pin(c, '3')) ?? 0; }
  };

  /* ================= LED ================= */
  D.led = {
    type: 'led', name: 'LED', cat: 'Passive Components', icon: '🔴', w: 44, h: 74,
    desc: 'Light-emitting diode. Long leg = anode (+). Needs a series resistor (~220 Ω at 5 V).',
    pins: [{ id: 'anode', label: 'A+', x: 14, y: 72, o: 'l', kind: 'special' }, { id: 'cathode', label: 'C−', x: 32, y: 72, o: 'r', kind: 'special' }],
    props: [{ key: 'color', label: 'Color', type: 'select', def: '#ef4444', options: [['#ef4444', 'Red'], ['#22c55e', 'Green'], ['#3b82f6', 'Blue'], ['#facc15', 'Yellow'], ['#fb923c', 'Orange'], ['#f1f5f9', 'White']] }],
    render(def, c) {
      const col = c.props.color || '#ef4444';
      let s = path('M14 72 V34 M32 72 V30', '#94a3b8', 2.2);
      s += `<path data-k="bulb" d="M8 30 Q8 8 23 8 Q38 8 38 30 L38 34 L8 34 Z" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="1.6"/>`;
      s += R(8, 34, 30, 5, col, 'opacity="0.55" rx="2"');
      s += `<ellipse data-k="glow" cx="23" cy="24" rx="20" ry="18" fill="${col}" opacity="0"/>`;
      return s;
    },
    sense(c, api) {
      const va = api.volts(api.pin(c, 'anode')), vk = api.volts(api.pin(c, 'cathode'));
      let b = 0;
      if (va != null && vk != null && va > vk + 1.6) {
        const drop = va - vk - 1.9;
        const r = api.seriesResistor(api.pin(c, 'anode'), api.pin(c, 'cathode'));
        b = r == null ? 1 : clamp((drop / Math.max(20, r)) / 0.02, 0, 1);
        c.state.noResistor = r == null;
      } else c.state.noResistor = false;
      // also support direct mcu channel write (common learning path)
      const ch = api.channel(api.pin(c, 'anode'));
      if ((va == null || vk == null) && ch) b = ch.type === 'pwm' ? ch.duty : ch.v ? 1 : 0;
      const changed = Math.abs((c.state.b || 0) - b) > 0.02;
      c.state.b = b;
      if (changed || c.state._init !== false) { c.state._init = false; this.frameUpdate && D.led.frameUpdate(c); }
    },
    frameUpdate(c) {
      const b = c.state.b || 0;
      if (c._k.bulb) { c._k.bulb.setAttribute('fill-opacity', 0.35 + b * 0.65); c._k.bulb.style.filter = b > 0.02 ? `drop-shadow(0 0 ${4 + b * 10}px ${c.props.color || '#ef4444'})` : ''; }
      if (c._k.glow) c._k.glow.setAttribute('opacity', b * 0.35);
    }
  };

  /* ================= RGB LED ================= */
  D.ledrgb = {
    type: 'ledrgb', name: 'RGB LED', cat: 'Passive Components', icon: '🌈', w: 60, h: 76,
    desc: 'Common-cathode RGB LED. Drive R, G and B through resistors (PWM for color mixing).',
    pins: [{ id: 'R', label: 'R', x: 10, y: 74, o: 't', kind: 'digital' }, { id: 'G', label: 'G', x: 26, y: 74, o: 't', kind: 'digital' }, { id: 'B', label: 'B', x: 42, y: 74, o: 't', kind: 'digital' }, { id: 'C', label: 'C−', x: 54, y: 74, o: 't', kind: 'ground' }],
    render(def, c) {
      let s = path('M10 74 V30 M26 74 V30 M42 74 V30 M54 74 V34', '#94a3b8', 2);
      s += `<path data-k="bulb" d="M10 30 Q10 6 30 6 Q50 6 50 30 L50 34 L10 34 Z" fill="#334155" fill-opacity="0.5" stroke="#94a3b8" stroke-width="1.4"/>`;
      s += `<ellipse data-k="glow" cx="30" cy="24" rx="24" ry="20" fill="#fff" opacity="0"/>`;
      s += plabels(def);
      return s;
    },
    sense(c, api) {
      const k = api.volts(api.pin(c, 'C')) ?? 0;
      const lv = p => { const v = api.volts(api.pin(c, p)); if (v != null) return clamp((v - k - 1.7) / 2.5, 0, 1); const ch = api.channel(api.pin(c, p)); return ch ? (ch.type === 'pwm' ? ch.duty : ch.v ? 1 : 0) : 0; };
      const r = lv('R'), g = lv('G'), b = lv('B');
      const key = (r * 9 | 0) + ',' + (g * 9 | 0) + ',' + (b * 9 | 0);
      if (key !== c.state.key) {
        c.state.key = key;
        const col = `rgb(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0})`;
        if (c._k.bulb) c._k.bulb.setAttribute('fill', col);
        if (c._k.glow) { c._k.glow.setAttribute('fill', col); c._k.glow.setAttribute('opacity', Math.max(r, g, b) * 0.4); }
        if (c._k.bulb) c._k.bulb.style.filter = Math.max(r, g, b) > 0.05 ? `drop-shadow(0 0 12px ${col})` : '';
      }
    }
  };

  /* ================= BUZZER & SPEAKER ================= */
  D.buzzer = {
    type: 'buzzer', name: 'Buzzer', cat: 'Passive Components', icon: '🔔', w: 52, h: 52,
    desc: 'Piezo buzzer. Use tone(pin, freq, dur) for melodies, or drive HIGH for a click.',
    pins: [{ id: '+', label: '+', x: 12, y: 48, o: 'l', kind: 'digital' }, { id: '-', label: '−', x: 40, y: 48, o: 'r', kind: 'ground' }],
    render() {
      let s = path('M12 48 V30 M40 48 V30', '#94a3b8', 2.2);
      s += CI(26, 22, 18, '#14161d', 'stroke="#3b4763" stroke-width="1.6"') + CI(26, 22, 7, '#2b3347');
      s += T(14, 16, '+', '#e2e8f0', 8);
      return s;
    },
    sense(c, api) { buzzTick(c, api, 0.7); }
  };
  D.speaker = {
    type: 'speaker', name: 'Speaker', cat: 'Outputs & Actuators', icon: '🔊', w: 60, h: 64,
    desc: '8 Ω mini speaker. Richer tone output — tone() plays with a softer sine voice.',
    pins: [{ id: '+', label: '+', x: 14, y: 60, o: 'l', kind: 'digital' }, { id: '-', label: '−', x: 46, y: 60, o: 'r', kind: 'ground' }],
    render() {
      let s = path('M14 60 V34 M46 60 V34', '#94a3b8', 2.2);
      s += CI(30, 26, 20, '#1e293b', 'stroke="#475569" stroke-width="1.6"');
      s += `<path d="M22 26 L30 18 L30 34 Z" fill="#94a3b8"/><circle data-k="cone" cx="33" cy="26" r="7" fill="none" stroke="#fbbf24" stroke-width="1.6" opacity="0.4"/>`;
      return s;
    },
    sense(c, api) { buzzTick(c, api, 1); }
  };
  function buzzTick(c, api, soft) {
    const ch = api.channel(api.pin(c, '+'));
    let hz = 0;
    if (ch && ch.type === 'tone') hz = ch.freq;
    else { const vp = api.volts(api.pin(c, '+')), vn = api.volts(api.pin(c, '-')); if (vp != null && vn != null && vp > vn + 2) hz = 1800; }
    CS.audio && CS.audio.set(c.id + (soft ? 's' : ''), hz, soft);
    if (c._k.cone) c._k.cone.setAttribute('opacity', hz ? 0.95 : 0.4);
  }

  /* ================= PUSH BUTTON ================= */
  D.pushbutton = {
    type: 'pushbutton', name: 'Push Button', cat: 'Inputs', icon: '🔘', w: 52, h: 56,
    desc: 'Momentary button. Connects pins 1–2 while pressed. Use INPUT_PULLUP or an external pull-down.',
    pins: [{ id: '1', label: '1', x: 10, y: 52, o: 'l', kind: 'special' }, { id: '2', label: '2', x: 42, y: 52, o: 'r', kind: 'special' }],
    render(def, c) {
      const dn = c.state && c.state.pressed;
      let s = path('M10 52 V34 M42 52 V34', '#94a3b8', 2.2);
      s += R(10, 20, 32, 14, '#1f2937', 'rx="3" stroke="#4b5563"');
      s += `<rect data-act="press" x="16" y="${dn ? 12 : 8}" width="20" height="${dn ? 8 : 12}" rx="3" fill="${dn ? '#f87171' : '#e2e8f0'}" style="transition:all .08s"/>`;
      return s;
    },
    tick(c, api) { if (c.state.pressed) api.connect(api.pin(c, '1'), api.pin(c, '2')); }
  };

  /* ================= TOGGLE SWITCH ================= */
  D.switch = {
    type: 'switch', name: 'Slide Switch', cat: 'Inputs', icon: '🎚️', w: 56, h: 50,
    desc: 'Latching SPDT slide switch — click to toggle. Connects pin 1–2 when ON.',
    pins: [{ id: '1', label: '1', x: 12, y: 46, o: 'l', kind: 'special' }, { id: '2', label: '2', x: 44, y: 46, o: 'r', kind: 'special' }],
    props: [{ key: 'on', label: 'Switch ON', type: 'bool', def: false }],
    render(def, c) {
      const on = !!c.props.on;
      let s = path('M12 46 V30 M44 46 V30', '#94a3b8', 2.2);
      s += R(8, 20, 40, 12, '#1f2937', 'rx="4" stroke="#4b5563"');
      s += `<rect data-act="toggle" x="${on ? 32 : 10}" y="16" width="14" height="18" rx="4" fill="${on ? '#4ade80' : '#94a3b8'}" style="transition:x .15s"/>`;
      s += T(28, 12, on ? 'ON' : 'OFF', on ? '#4ade80' : '#94a3b8', 6);
      return s;
    },
    tick(c, api) { if (c.props.on) api.connect(api.pin(c, '1'), api.pin(c, '2')); }
  };

  /* ================= ANALOG SLIDER ================= */
  D.slider = {
    type: 'slider', name: 'Analog Slider', cat: 'Inputs', icon: '🎚️', w: 44, h: 110,
    desc: 'Linear slide potentiometer module. OUT sweeps 0…VCC. Drag the knob while simulating.',
    pins: [{ id: 'VCC', label: 'VCC', x: 8, y: 14, o: 'r', kind: 'power' }, { id: 'OUT', label: 'OUT', x: 8, y: 96, o: 'r', kind: 'analog' }, { id: 'GND', label: 'GND', x: 36, y: 96, o: 'l', kind: 'ground' }],
    props: [{ key: 'value', label: 'Position', type: 'range', def: 0.5, min: 0, max: 1, step: 0.01 }],
    render(def, c) {
      const y = 84 - (c.props.value ?? 0.5) * 58;
      let s = R(0, 0, 44, 110, '#13233d', 'rx="6" stroke="#274070"');
      s += R(18, 24, 8, 64, '#0a1220', 'rx="4"');
      s += `<rect data-act="slider" x="13" y="${y - 8}" width="18" height="12" rx="3" fill="#22d3ee" style="transition:y .06s"/>`;
      s += plabels(def);
      return s;
    },
    tick(c, api) { const vcc = c.state.vcc ?? 5; api.drive(api.pin(c, 'OUT'), (c.props.value ?? 0.5) * vcc, 'strong'); },
    sense(c, api) { c.state.vcc = api.volts(api.pin(c, 'VCC')) ?? 5; }
  };

  /* ================= JOYSTICK ================= */
  D.joystick = {
    type: 'joystick', name: 'Joystick Module', cat: 'Inputs', icon: '🕹️', w: 86, h: 96,
    desc: '2-axis analog joystick + push button. Drag the stick during simulation.',
    pins: [{ id: 'GND', label: 'GND', x: 10, y: 90, o: 'r', kind: 'ground' }, { id: 'VCC', label: '+5V', x: 26, y: 90, o: 't', kind: 'power' }, { id: 'VRX', label: 'VRx', x: 42, y: 90, o: 't', kind: 'analog' }, { id: 'VRY', label: 'VRy', x: 58, y: 90, o: 't', kind: 'analog' }, { id: 'SW', label: 'SW', x: 74, y: 90, o: 'l', kind: 'digital' }],
    props: [{ key: 'x', label: 'X axis', type: 'range', def: 0.5, min: 0, max: 1, step: 0.01 }, { key: 'y', label: 'Y axis', type: 'range', def: 0.5, min: 0, max: 1, step: 0.01 }],
    render(def, c) {
      const kx = 43 + ((c.props.x ?? 0.5) - 0.5) * 36, ky = 42 + ((c.props.y ?? 0.5) - 0.5) * 36;
      let s = R(0, 0, 86, 96, '#173a2a', 'rx="8" stroke="#2a6b4a"');
      s += CI(43, 42, 26, '#0d1f16', 'stroke="#2a6b4a" stroke-width="2"');
      s += `<g data-act="stick"><circle cx="${kx}" cy="${ky}" r="13" fill="#1f2937" stroke="#4b5563" stroke-width="2" style="transition:all .05s"/><circle cx="${kx}" cy="${ky}" r="6" fill="#ef4444"/></g>`;
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const vcc = c.state.vcc ?? 5;
      api.drive(api.pin(c, 'VRX'), (c.props.x ?? 0.5) * vcc, 'strong');
      api.drive(api.pin(c, 'VRY'), (c.props.y ?? 0.5) * vcc, 'strong');
      if (c.state.pressed) api.drive(api.pin(c, 'SW'), 0, 'strong');
    },
    sense(c, api) { c.state.vcc = api.volts(api.pin(c, 'VCC')) ?? 5; }
  };

  /* ================= KEYPAD 4x4 ================= */
  D.keypad = {
    type: 'keypad', name: 'Keypad 4×4', cat: 'Inputs', icon: '🔢', w: 118, h: 140,
    desc: 'Matrix keypad. Row pins R1–R4, column pins C1–C4. Click keys while simulating.',
    pins: [...Array(4)].flatMap((_, i) => [{ id: 'R' + (i + 1), label: 'R' + (i + 1), x: 8, y: 30 + i * 26, o: 'r', kind: 'digital' }])
      .concat([...Array(4)].map((_, i) => ({ id: 'C' + (i + 1), label: 'C' + (i + 1), x: 110, y: 30 + i * 26, o: 'l', kind: 'digital' }))),
    render(def, c) {
      let s = R(0, 0, 118, 140, '#1c2438', 'rx="8" stroke="#33415f');
      '123456789*0#'.split('').forEach((k, i) => {
        const x = 22 + (i % 3) * 26, y = 16 + Math.floor(i / 3) * 26;
        const on = c.state.key === k;
        s += `<rect data-act="key" data-key="${k}" x="${x}" y="${y}" width="20" height="20" rx="4" fill="${on ? '#4ade80' : '#2b3550'}" stroke="#42507a"/><text x="${x + 10}" y="${y + 14}" fill="${on ? '#04140a' : '#cbd5e1'}" font-size="10" text-anchor="middle" font-family="monospace" pointer-events="none">${k}</text>`;
      });
      s += `<rect data-act="key" data-key="A" x="96" y="16" width="0" height="0" fill="none"/>`;
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const k = c.state.key;
      if (!k) return;
      const map = { 1: [1, 1], 2: [1, 2], 3: [1, 3], A: [1, 4], 4: [2, 1], 5: [2, 2], 6: [2, 3], B: [2, 4], 7: [3, 1], 8: [3, 2], 9: [3, 3], C: [3, 4], '*': [4, 1], 0: [4, 2], '#': [4, 3], D: [4, 4] };
      const [r, col] = map[k];
      api.connect(api.pin(c, 'R' + r), api.pin(c, 'C' + col));
    }
  };

  /* ================= ROTARY ENCODER ================= */
  D.encoder = {
    type: 'encoder', name: 'Rotary Encoder', cat: 'Inputs', icon: '⭕', w: 70, h: 80,
    desc: 'KY-040 quadrature encoder (30 detents). CLK & DT need pull-ups. Drag around the knob to turn, click to press.',
    pins: [{ id: 'GND', label: 'GND', x: 10, y: 76, o: 'r', kind: 'ground' }, { id: 'VCC', label: '+', x: 25, y: 76, o: 't', kind: 'power' }, { id: 'SW', label: 'SW', x: 40, y: 76, o: 't', kind: 'digital' }, { id: 'DT', label: 'DT', x: 55, y: 76, o: 't', kind: 'digital' }, { id: 'CLK', label: 'CLK', x: 68, y: 76, o: 'l', kind: 'digital' }],
    render(def, c) {
      const a = (c.props.pos || 0) * 12;
      let s = R(0, 56, 70, 24, '#13233d', 'rx="4" stroke="#274070"');
      s += CI(35, 30, 24, '#2b3347', 'stroke="#4b5a7a" stroke-width="1.6"') + CI(35, 30, 16, '#1a2133');
      s += `<g data-act="knob" transform="rotate(${a} 35 30)"><line x1="35" y1="30" x2="35" y2="12" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/><circle cx="35" cy="30" r="26" fill="transparent"/></g>`;
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const p = Math.round(c.props.pos || 0);
      // open-collector style: briefly pull low between detents
      const frac = Math.abs((c.props.pos || 0) - p);
      if (frac > 0.18) { const adv = (c.props.pos > (c.state.lastPos || 0)); api.drive(api.pin(c, 'CLK'), 0, 'strong'); if (adv) api.drive(api.pin(c, 'DT'), 0, 'strong'); }
      c.state.lastPos = c.props.pos || 0;
      if (c.state.swPressed) api.drive(api.pin(c, 'SW'), 0, 'strong');
    }
  };

  /* ================= DIP SWITCH 4 ================= */
  D.dipswitch = {
    type: 'dipswitch', name: 'DIP Switch ×4', cat: 'Inputs', icon: '🎛️', w: 74, h: 56,
    desc: '4-way DIP switch. Click a switch to flip it. Top pin connects to bottom pin when ON.',
    pins: [...Array(4)].flatMap((_, i) => [{ id: (i + 1) + 'a', label: '', x: 16 + i * 14, y: 6, kind: 'special', nolabel: true }, { id: (i + 1) + 'b', label: '', x: 16 + i * 14, y: 50, kind: 'special', nolabel: true }]),
    props: [{ key: 'sw', label: 'Switches', type: 'dip4', def: [false, false, false, false] }],
    render(def, c) {
      const sw = c.props.sw || [false, false, false, false];
      let s = R(6, 10, 62, 36, '#b91c1c', 'rx="5" stroke="#7f1d1d"');
      sw.forEach((on, i) => {
        const x = 12 + i * 14;
        s += R(x, 14, 10, 28, '#f8fafc', 'rx="2"');
        s += `<rect data-act="dip" data-idx="${i}" x="${x + 1.5}" y="${on ? 16 : 28}" width="7" height="12" rx="1.5" fill="#0f172a" style="transition:y .12s"/>`;
        s += T(x + 5, 53, String(i + 1), '#7d8fb3', 6);
      });
      s += T(12, 9, 'ON', '#fca5a5', 5, 'start');
      return s;
    },
    tick(c, api) { (c.props.sw || []).forEach((on, i) => { if (on) api.connect(api.pin(c, (i + 1) + 'a'), api.pin(c, (i + 1) + 'b')); }); }
  };

  /* ================= DHT22 ================= */
  D.dht22 = {
    type: 'dht22', name: 'DHT22 Temp/Humidity', cat: 'Sensors', icon: '🌡️', w: 64, h: 84,
    desc: 'DHT22 (AM2302): −40…80 °C, 0–100 % RH. Single-wire DATA pin — in this sim, bind with `DHT dht(pin, DHT22)`.',
    pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 80, o: 'l', kind: 'power' }, { id: 'DATA', label: 'DATA', x: 32, y: 80, o: 't', kind: 'digital' }, { id: 'GND', label: 'GND', x: 50, y: 80, o: 'r', kind: 'ground' }],
    props: [{ key: 'temp', label: 'Temperature °C', type: 'range', def: 25, min: -20, max: 60, step: 0.5 }, { key: 'hum', label: 'Humidity %', type: 'range', def: 55, min: 0, max: 100, step: 1 }],
    render(def, c) {
      let s = R(4, 4, 56, 66, '#3b82a0', 'rx="5" stroke="#5ab2d4" stroke-width="1.4"');
      for (let i = 0; i < 4; i++) s += R(10, 12 + i * 13, 44, 6, '#2b6a85', 'rx="2"');
      s += T(32, 66, `${(+c.props.temp).toFixed(1)}°C ${c.props.hum | 0}%`, '#dff3fb', 7);
      s += plabels(def);
      return s;
    }
  };

  /* ================= HC-SR04 ULTRASONIC ================= */
  D.ultrasonic = {
    type: 'ultrasonic', name: 'Ultrasonic (HC-SR04)', cat: 'Sensors', icon: '📡', w: 92, h: 56,
    desc: 'Distance sensor 2–400 cm. 10 µs pulse on TRIG, measure ECHO high-time ÷ 58 = cm. `pulseIn` is handled natively.',
    pins: [{ id: 'VCC', label: 'VCC', x: 10, y: 50, o: 'r', kind: 'power' }, { id: 'TRIG', label: 'TRIG', x: 32, y: 50, o: 't', kind: 'digital' }, { id: 'ECHO', label: 'ECHO', x: 58, y: 50, o: 't', kind: 'digital' }, { id: 'GND', label: 'GND', x: 82, y: 50, o: 'l', kind: 'ground' }],
    props: [{ key: 'dist', label: 'Target distance (cm)', type: 'range', def: 42, min: 2, max: 400, step: 1 }, { key: 'auto', label: 'Random-moving target', type: 'bool', def: false }],
    render(def, c) {
      let s = R(0, 6, 92, 44, '#1e3a5f', 'rx="6" stroke="#3d6db5"');
      s += CI(26, 26, 14, '#c8ccd4', 'stroke="#8a93a6" stroke-width="2"') + CI(66, 26, 14, '#c8ccd4', 'stroke="#8a93a6" stroke-width="2"');
      s += CI(26, 26, 8, '#3a3f47') + CI(66, 26, 8, '#3a3f47');
      s += `<circle data-k="ping" cx="46" cy="26" r="${2 + ((Date.now() / 400) % 1) * 6}" fill="none" stroke="#22d3ee" opacity="0"/>`;
      s += T(46, 14, Math.round(c.props.dist) + ' cm', '#9fc7ee', 7);
      s += plabels(def);
      return s;
    },
    tick(c, api, dt, eng) {
      if (c.props.auto) { c.state.t = (c.state.t || 0) + dt; if (c.state.t > 900) { c.state.t = 0; c.props.dist = 10 + Math.random() * 150; api.markDirty(c); } }
      const trig = api.state(api.pin(c, 'TRIG'));
      if (trig === 'hi' && !c.state.wasTrig) c.state.pingAt = eng.now;
      c.state.wasTrig = trig === 'hi';
      const t = c.state.pingAt;
      if (t != null) {
        const echo = c.props.dist * 0.058 + 0.25; // ms
        const elapsed = eng.now - t;
        api.drive(api.pin(c, 'ECHO'), (elapsed > 0.35 && elapsed < 0.35 + echo) ? 5 : 0, 'strong');
        if (elapsed > 60) c.state.pingAt = null;
      } else api.drive(api.pin(c, 'ECHO'), 0, 'weak');
    }
  };

  /* ================= PIR MOTION ================= */
  D.pir = {
    type: 'pir', name: 'PIR Motion Sensor', cat: 'Sensors', icon: '🚶', w: 64, h: 78,
    desc: 'Passive infrared motion detector. OUT goes HIGH for ~2 s on motion. Auto mode triggers randomly.',
    pins: [{ id: 'VCC', label: 'VCC', x: 12, y: 74, o: 'l', kind: 'power' }, { id: 'OUT', label: 'OUT', x: 32, y: 74, o: 't', kind: 'digital' }, { id: 'GND', label: 'GND', x: 52, y: 74, o: 'r', kind: 'ground' }],
    props: [{ key: 'auto', label: 'Auto random motion', type: 'bool', def: true }, { key: 'interval', label: 'Avg interval (s)', type: 'number', def: 6, min: 2, max: 30 }],
    render(def, c) {
      const on = (c.state.motionUntil || 0) > (CS.sim ? CS.sim.now : 0);
      let s = R(4, 30, 56, 40, '#f1f5f9', 'rx="4" stroke="#cbd5e1"');
      s += CI(32, 22, 16, '#e2e8f0', 'stroke="#94a3b8" stroke-width="1.6"');
      s += CI(32, 22, 16, on ? 'rgba(239,68,68,0.55)' : 'rgba(148,163,184,0.2)');
      for (let i = 0; i < 4; i++) s += path(`M${20 + i * 8} 14 Q${24 + i * 8} 22 ${20 + i * 8} 30`, '#b6c2d4', 1);
      s += `<rect data-act="motion" x="44" y="42" width="14" height="20" rx="3" fill="#e2e8f0" stroke="#94a3b8"/><text x="51" y="55" font-size="8" text-anchor="middle" pointer-events="none">🚶</text>`;
      if (on) s += `<circle cx="32" cy="22" r="20" fill="none" stroke="#ef4444" opacity="0.7" stroke-dasharray="3 4" class="hero-wire"/>`;
      s += plabels(def);
      return s;
    },
    tick(c, api, dt, eng) {
      if (c.props.auto) { c.state.next = c.state.next ?? eng.now + 2000 + Math.random() * (c.props.interval || 6) * 1000; if (eng.now > c.state.next) { c.state.motionUntil = eng.now + 2000; c.state.next = eng.now + (c.props.interval || 6) * 1000 * (0.5 + Math.random()); api.markDirty(c); } }
      const on = (c.state.motionUntil || 0) > eng.now;
      if (on !== c.state.wasOn) api.markDirty(c);
      c.state.wasOn = on;
      api.drive(api.pin(c, 'OUT'), on ? 3.3 : 0, 'strong');
    }
  };

  /* ================= LDR / GAS / SOIL / IR (generic analog module pattern) ================= */
  function analogModule(type, name, icon, desc, envKey, defProps, saturationColor, drawFn, invert) {
    return {
      type, name, cat: 'Sensors', icon, w: 64, h: 78, desc,
      pins: [{ id: 'VCC', label: 'VCC', x: 12, y: 74, o: 'l', kind: 'power' }, { id: 'GND', label: 'GND', x: 32, y: 74, o: 't', kind: 'ground' }, { id: 'AO', label: 'AO', x: 46, y: 74, o: 't', kind: 'analog' }, { id: 'DO', label: 'DO', x: 58, y: 74, o: 'r', kind: 'digital' }],
      props: defProps,
      render(def, c) { return drawFn(c) + plabels(def); },
      tick(c, api) {
        let v;
        v = +c.props.level ?? 0.5;
        const vcc = c.state.vcc ?? 5;
        c.state.env = v;
        api.drive(api.pin(c, 'AO'), (invert ? 1 - v : v) * vcc, 'strong');
        api.drive(api.pin(c, 'DO'), (invert ? 1 - v : v) > (c.props.threshold ?? 0.5) ? vcc : 0, 'strong');
      },
      sense(c, api) { c.state.vcc = api.volts(api.pin(c, 'VCC')) ?? 5; if (c._k.meter) { c._k.meter.setAttribute('width', String(44 * (c.state.env ?? 0.5))); c._k.meter.setAttribute('fill', saturationColor); } }
    };
  }
  function envRender(c, icon, label, col) {
    const v = c.state && c.state.env != null ? c.state.env : (c.props.level ?? 0.5);
    let s = R(4, 4, 56, 60, '#1c2438', 'rx="6" stroke="#33415f"');
    s += T(32, 30, icon, '#fff', 20);
    s += T(32, 45, label, '#8ea3c8', 6);
    s += R(10, 52, 44, 5, '#0c1220', 'rx="2.5"');
    s += `<rect data-k="meter" x="10" y="52" width="${44 * v}" height="5" rx="2.5" fill="${col}"/>`;
    return s;
  }
  D.ldr = analogModule('ldr', 'LDR Light Sensor', '💡', 'Photoresistor module. AO increases with light.', null,
    [{ key: 'level', label: 'Light level', type: 'range', def: 0.55, min: 0, max: 1, step: 0.01 }, { key: 'threshold', label: 'DO threshold', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05 }], '#facc15', c => envRender(c, '💡', 'lux', '#facc15'));
  D.gas = analogModule('gas', 'Gas/Smoke (MQ-2)', '🧪', 'MQ-2 gas sensor. AO rises with LPG/smoke/CO concentration.', null,
    [{ key: 'level', label: 'Gas level', type: 'range', def: 0.2, min: 0, max: 1, step: 0.01 }, { key: 'threshold', label: 'DO threshold', type: 'range', def: 0.6, min: 0, max: 1, step: 0.05 }], '#f87171', c => envRender(c, '🧪', 'ppm', '#f87171'));
  D.soil = analogModule('soil', 'Soil Moisture', '🌱', 'Capacitive soil moisture probe. AO rises with moisture.', null,
    [{ key: 'level', label: 'Moisture', type: 'range', def: 0.34, min: 0, max: 1, step: 0.01 }, { key: 'threshold', label: 'DO threshold', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05 }], '#4ade80', c => envRender(c, '🌱', 'wet', '#4ade80'));
  D.soil.props[0].def = 0.34; D.soil.props.forEach(p => { if (p.key === 'level') p.label = 'Moisture level'; });
D.ir = analogModule('ir', 'IR Obstacle Sensor', '🚧', 'Infrared proximity module. DO pulls LOW when an object is closer than the threshold.', null,
    [{ key: 'level', label: 'Object distance (far↔near)', type: 'range', def: 0.7, min: 0, max: 1, step: 0.01 }], '#f97316', c => envRender(c, '🚧', 'near', '#f97316'), true);

  /* ================= MPU6050 IMU ================= */
  D.mpu6050 = {
    type: 'mpu6050', name: 'MPU6050 Accel/Gyro', cat: 'Sensors', icon: '🧭', w: 74, h: 84,
    desc: '6-axis IMU (I2C 0x68). Drive it with your real device motion/orientation sensors, or animation fallback.',
    pins: [{ id: 'VCC', label: 'VCC', x: 12, y: 80, o: 'l', kind: 'power' }, { id: 'GND', label: 'GND', x: 28, y: 80, o: 't', kind: 'ground' }, { id: 'SDA', label: 'SDA', x: 46, y: 80, o: 't', kind: 'i2c' }, { id: 'SCL', label: 'SCL', x: 62, y: 80, o: 'r', kind: 'i2c' }],
    render(def, c) {
      let s = R(4, 4, 66, 64, '#173a2a', 'rx="6" stroke="#2a6b4a"');
      s += R(28, 20, 18, 18, '#14161d', 'rx="3"') + T(37, 32, 'MPU', '#3d4453', 5);
      s += T(37, 54, 'tilt', '#8ea3c8', 6);
      s += `<circle data-k="ball" cx="${37 + CS.clamp((c.state.mx || 0), -1, 1) * 16}" cy="${16 + CS.clamp((c.state.my || 0), -1, 1) * 8}" r="3.5" fill="#22d3ee"/>`;
      s += R(12, 8, 50, 16, 'none', 'stroke="#2a6b4a" rx="6"');
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      c.state.t = (c.state.t || 0) + 0.02;
      c.state.mx = Math.sin(c.state.t) * 0.7;
      c.state.my = Math.sin(c.state.t * 2) * 0.4;
      if (c._k.ball && CS.sim && CS.sim.running) { c._k.ball.setAttribute('cx', String(37 + CS.clamp(c.state.mx, -1, 1) * 16)); c._k.ball.setAttribute('cy', String(16 + CS.clamp(c.state.my, -1, 1) * 8)); }
    }
  };

  /* ================= RFID ================= */
  D.rfid = {
    type: 'rfid', name: 'RFID/NFC Reader', cat: 'Sensors', icon: '🪪', w: 78, h: 88,
    desc: 'RC522 RFID reader (SPI). Press "Tap card" while simulating, then read the UID with the rfid API.',
    pins: [{ id: 'VCC', label: '3V3', x: 12, y: 84, o: 'l', kind: 'power' }, { id: 'GND', label: 'GND', x: 24, y: 84, o: 't', kind: 'ground' }, { id: 'SDA', label: 'SS', x: 36, y: 84, o: 't', kind: 'spi' }, { id: 'SCK', label: 'SCK', x: 48, y: 84, o: 't', kind: 'spi' }, { id: 'MOSI', label: 'MOSI', x: 58, y: 84, o: 't', kind: 'spi' }, { id: 'MISO', label: 'MISO', x: 68, y: 84, o: 'l', kind: 'spi' }, { id: 'RST', label: 'RST', x: 74, y: 40, o: 'l', kind: 'digital' }],
    render(def, c) {
      let s = R(4, 4, 70, 70, '#1e2a4a', 'rx="6" stroke="#3b5aa0"');
      s += CI(39, 36, 20, 'none', 'stroke="#60a5fa" stroke-width="2"') + CI(39, 36, 13, 'none', 'stroke="#60a5fa" stroke-width="1.6"') + CI(39, 36, 6, 'none', 'stroke="#60a5fa" stroke-width="1.3"');
      if (c.state.uid) s += T(39, 66, '✔ card', '#4ade80', 7);
      s += `<rect data-act="tap" x="8" y="8" width="26" height="14" rx="3" fill="#33415f"/><text x="21" y="18" font-size="6.5" text-anchor="middle" fill="#cbd5e1" pointer-events="none">TAP</text>`;
      s += plabels(def);
      return s;
    }
  };

  /* ================= SERVO ================= */
  D.servo = {
    type: 'servo', name: 'Servo Motor SG90', cat: 'Outputs & Actuators', icon: '🦾', w: 84, h: 66,
    desc: '9 g hobby servo, 0–180°. Attach with the Servo API: Servo s; s.attach(pin); s.write(deg).',
    pins: [{ id: 'GND', label: 'GND', x: 8, y: 44, o: 'l', kind: 'ground' }, { id: 'VCC', label: 'V+', x: 8, y: 54, o: 'l', kind: 'power' }, { id: 'SIG', label: 'SIG', x: 8, y: 64, o: 'l', kind: 'digital' }],
    render(def, c) {
      const a = c.state.angle ?? 90;
      let s = R(18, 22, 46, 30, '#1d4ed8', 'rx="5" stroke="#3b82f6" stroke-width="1.5"');
      s += R(18, 22, 46, 10, '#1e40af', 'rx="5"');
      s += CI(41, 22, 7, '#e2e8f0', 'stroke="#94a3b8"');
      s += `<g data-k="horn" transform="rotate(${-a} 41 22)"><rect x="39" y="8" width="4" height="16" rx="2" fill="#f1f5f9"/></g>`;
      s += path('M18 44 H8 M18 54 H8 M18 64 H8', '#94a3b8', 2);
      s += T(41, 44, Math.round(a) + '°', '#bfdbfe', 8);
      s += plabels(def);
      return s;
    },
    sense(c, api) {
      const ch = api.channel(api.pin(c, 'SIG'));
      const target = ch && ch.type === 'servo' ? CS.clamp(ch.angle, 0, 180) : 90;
      let a = c.state.angle != null ? c.state.angle : target;
      a += (target - a) * 0.25;
      if (Math.abs(a - target) < 0.5) a = target;
      if (c.state.angle == null || Math.abs(a - c.state.angle) > 0.15) { c.state.angle = a; this.frameUpdate(c); }
    },
    frameUpdate(c) { if (c._k.horn) c._k.horn.setAttribute('transform', `rotate(${-(c.state.angle ?? 90)} 41 22)`); }
  };

  /* ================= DC MOTOR + DRIVER ================= */
  D.dcmotor = {
    type: 'dcmotor', name: 'DC Motor + Driver', cat: 'Outputs & Actuators', icon: '🌀', w: 92, h: 88,
    desc: 'TT gear motor with L293D-style driver. IN1/IN2 set direction, ENA (PWM/digital) sets speed.',
    pins: [{ id: 'VCC', label: 'V+', x: 12, y: 12, o: 'b', kind: 'power' }, { id: 'GND', label: 'GND', x: 28, y: 12, o: 'b', kind: 'ground' }, { id: 'IN1', label: 'IN1', x: 44, y: 12, o: 'b', kind: 'digital' }, { id: 'IN2', label: 'IN2', x: 60, y: 12, o: 'b', kind: 'digital' }, { id: 'ENA', label: 'ENA', x: 78, y: 12, o: 'b', kind: 'digital' },
    { id: 'OUT1', label: 'M+', x: 88, y: 70, o: 'l', kind: 'special' }, { id: 'OUT2', label: 'M−', x: 88, y: 82, o: 'l', kind: 'special' }],
    render(def, c) {
      const spin = CS.sim && CS.sim.running && Math.abs(c.state.speed || 0) > 0.05;
      let s = R(4, 4, 84, 36, '#7f1d1d', 'rx="5" stroke="#b91c1c"');
      s += T(46, 26, 'L293D', '#fca5a5', 8);
      s += R(20, 46, 52, 36, '#374151', 'rx="8" stroke="#4b5563"');
      s += CI(46, 64, 15, '#1f2937', 'stroke="#6b7280" stroke-width="2"');
      s += `<g data-k="rotor"${spin ? ' style="transform-origin:46px 64px;animation:spinRotor .5s linear infinite"' : ''}><line x1="46" y1="52" x2="46" y2="76" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/><line x1="34" y1="64" x2="58" y2="64" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/></g>`;
      s += `<style>@keyframes spinRotor{to{transform:rotate(360deg)}}</style>`;
      s += plabels(def);
      return s;
    },
    sense(c, api) {
      const a = api.state(api.pin(c, 'IN1')) === 'hi', b = api.state(api.pin(c, 'IN2')) === 'hi';
      const ch = api.channel(api.pin(c, 'ENA'));
      const ena = ch ? (ch.type === 'pwm' ? ch.duty : ch.v ? 1 : 0) : (api.state(api.pin(c, 'ENA')) === 'hi' ? 1 : 0);
      const dir = a && !b ? 1 : b && !a ? -1 : 0;
      const sp = dir * ena;
      if (Math.abs((c.state.speed || 0) - sp) > 0.05) { c.state.speed = sp; api.markDirty(c); }
    }
  };

  /* ================= STEPPER ================= */
  D.stepper = {
    type: 'stepper', name: 'Stepper Motor 28BYJ', cat: 'Outputs & Actuators', icon: '🎡', w: 88, h: 84,
    desc: '28BYJ-48 + ULN2003 driver. Use the Stepper API: Stepper st(2048,8,9,10,11); st.step(n).',
    pins: [{ id: 'VCC', label: '+', x: 10, y: 12, o: 'b', kind: 'power' }, { id: 'GND', label: '−', x: 24, y: 12, o: 'b', kind: 'ground' }, { id: 'IN1', label: 'IN1', x: 38, y: 12, o: 'b', kind: 'digital' }, { id: 'IN2', label: 'IN2', x: 50, y: 12, o: 'b', kind: 'digital' }, { id: 'IN3', label: 'IN3', x: 62, y: 12, o: 'b', kind: 'digital' }, { id: 'IN4', label: 'IN4', x: 74, y: 12, o: 'b', kind: 'digital' }],
    render(def, c) {
      let s = R(4, 4, 80, 32, '#7c2d12', 'rx="5" stroke="#c2410c"');
      s += T(44, 24, 'ULN2003', '#fdba74', 8);
      s += CI(44, 58, 21, '#e2e8f0', 'stroke="#94a3b8" stroke-width="2"');
      s += `<g data-k="rotor" transform="rotate(${c.state.deg || 0} 44 58)"><rect x="42" y="41" width="4" height="17" rx="2" fill="#0ea5e9"/><circle cx="44" cy="58" r="4" fill="#64748b"/></g>`;
      s += T(80, 62, Math.round(((c.state.deg || 0) % 360 + 360) % 360) + '°', '#7d8fb3', 6, 'start');
      s += plabels(def);
      return s;
    },
    frameUpdate(c) { if (c._k.rotor) c._k.rotor.setAttribute('transform', `rotate(${(c.state.deg || 0) % 360} 44 58)`); }
  };

  /* ================= RELAY ================= */
  D.relay = {
    type: 'relay', name: 'Relay Module', cat: 'Outputs & Actuators', icon: '🔀', w: 88, h: 88,
    desc: '5 V relay with optocoupler. IN HIGH energizes the coil: COM connects to NO (else NC). Switch real loads like pumps & lamps!',
    pins: [{ id: 'VCC', label: 'VCC', x: 12, y: 12, o: 'b', kind: 'power' }, { id: 'GND', label: 'GND', x: 28, y: 12, o: 'b', kind: 'ground' }, { id: 'IN', label: 'IN', x: 44, y: 12, o: 'b', kind: 'digital' },
    { id: 'COM', label: 'COM', x: 84, y: 30, o: 'l', kind: 'special' }, { id: 'NO', label: 'NO', x: 84, y: 52, o: 'l', kind: 'special' }, { id: 'NC', label: 'NC', x: 84, y: 74, o: 'l', kind: 'special' }],
    render(def, c) {
      const on = !!c.state.on;
      let s = R(2, 2, 62, 84, '#0f3d24', 'rx="5" stroke="#166534"');
      s += R(12, 24, 38, 30, '#1d4ed8', 'rx="4"');
      s += CI(58, 68, 3.5, on ? '#ef4444' : '#450a0a') + T(58, 62, on ? 'ON' : 'off', '#a3b899', 6);
      s += `<path data-k="arm" d="M68 30 L${on ? '78' : '78'} ${on ? 52 : 74}" stroke="#fbbf24" stroke-width="2.4"/>`;
      s += CI(70, 30, 3, '#e2e8f0') + CI(78, 52, 3, on ? '#4ade80' : '#64748b') + CI(78, 74, 3, on ? '#64748b' : '#4ade80');
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const powered = c.state.powered, hi = c.state.inHi;
      const on = !!(powered && hi);
      if (on !== c.state.on) { c.state.on = on; api.markDirty(c); if (CS.audio) CS.audio.click && CS.audio.click(); }
      api.connect(api.pin(c, 'COM'), api.pin(c, on ? 'NO' : 'NC'));
    },
    sense(c, api) {
      c.state.powered = (api.volts(api.pin(c, 'VCC')) ?? 0) > 3;
      c.state.inHi = api.state(api.pin(c, 'IN')) === 'hi';
    }
  };

  /* ================= LCD 16x2 ================= */
  D.lcd = {
    type: 'lcd', name: 'LCD 16×2', cat: 'Outputs & Actuators', icon: '🖥️', w: 196, h: 82,
    desc: 'HD44780 16×2 character display. Drive with the LiquidCrystal API: lcd.print(), lcd.setCursor().',
    pins: [{ id: 'VSS', label: 'VSS', x: 16, y: 76, o: 't', kind: 'ground' }, { id: 'VDD', label: 'VDD', x: 30, y: 76, o: 't', kind: 'power' }, { id: 'VO', label: 'V0', x: 44, y: 76, o: 't', kind: 'analog' }, { id: 'RS', label: 'RS', x: 58, y: 76, o: 't', kind: 'digital' }, { id: 'RW', label: 'RW', x: 72, y: 76, o: 't', kind: 'digital' }, { id: 'E', label: 'E', x: 86, y: 76, o: 't', kind: 'digital' },
    { id: 'D4', label: 'D4', x: 100, y: 76, o: 't', kind: 'digital' }, { id: 'D5', label: 'D5', x: 114, y: 76, o: 't', kind: 'digital' }, { id: 'D6', label: 'D6', x: 128, y: 76, o: 't', kind: 'digital' }, { id: 'D7', label: 'D7', x: 142, y: 76, o: 't', kind: 'digital' }, { id: 'A', label: 'A+', x: 156, y: 76, o: 't', kind: 'power' }, { id: 'K', label: 'K−', x: 170, y: 76, o: 't', kind: 'ground' }],
    props: [{ key: 'backlight', label: 'Backlight', type: 'select', def: '#1d4ed8', options: [['#1d4ed8', 'Blue'], ['#16a34a', 'Green'], ['#b45309', 'Amber'], ['#0f172a', 'Dark']] }],
    render(def, c) {
      const rows = c.state.lines || ['', ''];
      const bg = c.props.backlight || '#1d4ed8';
      let s = R(0, 0, 196, 82, '#14532d', 'rx="6" stroke="#166534" stroke-width="1.6"');
      s += R(10, 10, 176, 44, bg, 'rx="3"');
      const fg = bg === '#0f172a' ? '#94a3b8' : '#dbeafe';
      s += `<text data-k="l0" x="16" y="30" fill="${fg}" font-size="14" font-family="monospace" letter-spacing="1">${CS.esc(rows[0] || '').padEnd(16, ' ').slice(0, 16)}</text>`;
      s += `<text data-k="l1" x="16" y="48" fill="${fg}" font-size="14" font-family="monospace" letter-spacing="1">${CS.esc(rows[1] || '').padEnd(16, ' ').slice(0, 16)}</text>`;
      s += CI(8, 6, 1.6, '#c8ccd4') + CI(188, 6, 1.6, '#c8ccd4') + CI(8, 58, 1.6, '#c8ccd4') + CI(188, 58, 1.6, '#c8ccd4');
      s += plabels(def);
      return s;
    },
    frameUpdate(c) {
      const rows = c.state.lines || ['', ''];
      if (c._k.l0) c._k.l0.textContent = (rows[0] || '').padEnd(16, ' ').slice(0, 16);
      if (c._k.l1) c._k.l1.textContent = (rows[1] || '').padEnd(16, ' ').slice(0, 16);
    }
  };

  /* ================= OLED ================= */
  D.oled = {
    type: 'oled', name: 'OLED 0.96" I2C', cat: 'Outputs & Actuators', icon: '📟', w: 88, h: 78,
    desc: 'SSD1306 128×64 OLED (I2C). API: oled.print/println/clear — minimalist text renderer.',
    pins: [{ id: 'VCC', label: 'VCC', x: 16, y: 72, o: 'l', kind: 'power' }, { id: 'GND', label: 'GND', x: 38, y: 72, o: 't', kind: 'ground' }, { id: 'SDA', label: 'SDA', x: 58, y: 72, o: 't', kind: 'i2c' }, { id: 'SCL', label: 'SCL', x: 74, y: 72, o: 'r', kind: 'i2c' }],
    render(def, c) {
      const lines = c.state.lines || [];
      let s = R(0, 0, 88, 78, '#e2e8f0', 'rx="5" stroke="#94a3b8"');
      s += R(8, 8, 72, 48, '#020617', 'rx="2"');
      s += `<g font-family="monospace" font-size="8.5" fill="#7dd3fc">`;
      lines.slice(-5).forEach((ln, i) => { s += `<text x="12" y="${20 + i * 9.5}">${CS.esc(ln).slice(0, 14)}</text>`; });
      s += `</g>`;
      s += plabels(def);
      return s;
    },
    frameUpdate(c) {
      // lines rarely change; markDirty flow handles full re-render
    }
  };

  /* ================= 7-SEGMENT ================= */
  D.seg7 = {
    type: 'seg7', name: '7-Segment Display', cat: 'Outputs & Actuators', icon: '🔢', w: 66, h: 96,
    desc: 'Single digit 7-segment display. Directly drive segments a–g (+dp) from MCU pins. Common cathode by default.',
    pins: [...'abcdefg'].map((s, i) => ({ id: s, label: s, x: 8, y: 14 + i * 11, o: 'r', kind: 'digital' })).concat([
      { id: 'dp', label: 'dp', x: 8, y: 90, o: 'r', kind: 'digital' }, { id: 'COM', label: 'COM', x: 58, y: 90, o: 'l', kind: 'ground' }]),
    props: [{ key: 'common', label: 'Common pin type', type: 'select', def: 'cathode', options: [['cathode', 'Cathode (GND, active HIGH)'], ['anode', 'Anode (VCC, active LOW)']] }, { key: 'color', label: 'Color', type: 'select', def: '#ef4444', options: [['#ef4444', 'Red'], ['#22c55e', 'Green'], ['#facc15', 'Yellow'], ['#38bdf8', 'Blue']] }],
    render(def, c) {
      const col = c.props.color || '#ef4444';
      const segPath = { a: 'M30 18 L50 18 L46 24 L34 24 Z', b: 'M52 20 L56 24 L52 46 L48 42 Z', c: 'M48 50 L52 54 L48 76 L44 72 Z', d: 'M28 76 L48 76 L44 82 L32 82 Z', e: 'M26 50 L30 54 L26 72 L22 72 Z', f: 'M28 24 L32 20 L30 42 L26 46 Z', g: 'M28 46 L50 46 L46 52 L32 52 Z' };
      let s = R(14, 8, 46, 82, '#151b2d', 'rx="5" stroke="#2b3550"');
      for (const k in segPath) s += `<path data-k="seg-${k}" d="${segPath[k]}" fill="${col}" opacity="0.13"/>`;
      s += `<circle data-k="seg-dp" cx="54" cy="80" r="3.4" fill="${col}" opacity="0.13"/>`;
      s += plabels(def);
      return s;
    },
    sense(c, api) {
      const anode = c.props.common === 'anode';
      const comHi = api.state(api.pin(c, 'COM')) === 'hi';
      const comLo = api.state(api.pin(c, 'COM')) === 'lo';
      [...'abcdefg', 'dp'].forEach(k => {
        const st = api.state(api.pin(c, k));
        let on = false;
        if (anode) on = comHi && st === 'lo'; else on = comLo && st === 'hi';
        const key = 's' + k;
        if (c.state[key] !== on) {
          c.state[key] = on;
          const el = c._k['seg-' + k];
          if (el) { el.setAttribute('opacity', on ? 1 : 0.13); el.style.filter = on ? `drop-shadow(0 0 5px ${c.props.color || '#ef4444'})` : ''; }
        }
      });
    }
  };

  /* ================= LED MATRIX ================= */
  D.matrix = {
    type: 'matrix', name: '8×8 LED Matrix', cat: 'Outputs & Actuators', icon: '🟥', w: 92, h: 92,
    desc: 'MAX7219 8×8 matrix. API: matrix.set(x, y, on), matrix.clear(), matrix.scroll("HI").',
    pins: [{ id: 'VCC', label: 'VCC', x: 14, y: 88, o: 'l', kind: 'power' }, { id: 'GND', label: 'GND', x: 32, y: 88, o: 't', kind: 'ground' }, { id: 'DIN', label: 'DIN', x: 50, y: 88, o: 't', kind: 'spi' }, { id: 'CS', label: 'CS', x: 66, y: 88, o: 't', kind: 'spi' }, { id: 'CLK', label: 'CLK', x: 82, y: 88, o: 'r', kind: 'spi' }],
    render(def, c) {
      let s = R(0, 0, 92, 92, '#0f172a', 'rx="6" stroke="#33415f"');
      const g = c.state.grid;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const on = g && g[y] && g[y][x];
        s += CI(13 + x * 9.5, 13 + y * 9.5, 3.4, on ? '#ef4444' : '#312e3a', on ? 'style="filter:drop-shadow(0 0 3px #ef4444)"' : '');
      }
      s += plabels(def);
      return s;
    }
  };

  /* ================= (Real Hardware parts removed — camera, mic, gps) ================= */

  /* ================= NEOPIXEL (Addressable LED) ================= */
  D.neoPixel = {
    type: 'neoPixel', name: 'NeoPixel (WS2812B)', cat: 'Outputs & Actuators', icon: '🌈', w: 44, h: 44,
    desc: 'Addressable RGB LED (WS2812B). Chain multiple and control with the Adafruit_NeoPixel library. Data-in, Data-out passthrough.',
    pins: [{ id: 'VCC', label: '5V', x: 8, y: 40, o: 'l', kind: 'power' }, { id: 'DIN', label: 'DIN', x: 22, y: 40, o: 't', kind: 'digital' }, { id: 'GND', label: 'GND', x: 36, y: 40, o: 'r', kind: 'ground' }],
    props: [{ key: 'r', label: 'Red', type: 'range', def: 128, min: 0, max: 255, step: 1 }, { key: 'g', label: 'Green', type: 'range', def: 0, min: 0, max: 255, step: 1 }, { key: 'b', label: 'Blue', type: 'range', def: 255, min: 0, max: 255, step: 1 }],
    render(def, c) {
      const r = (c.state.outR != null ? c.state.outR : (+c.props.r || 0)), g = (c.state.outG != null ? c.state.outG : (+c.props.g || 0)), b = (c.state.outB != null ? c.state.outB : (+c.props.b || 0));
      const col = `rgb(${r},${g},${b})`;
      let s = R(2, 2, 40, 40, '#1a1a2e', 'rx="8" stroke="#334155" stroke-width="1.2"');
      s += `<circle data-k="led" cx="22" cy="20" r="14" fill="${col}" style="transition:fill .08s;filter:drop-shadow(0 0 ${Math.max(r,g,b)/40}px ${col})"/>`;
      s += `<circle cx="22" cy="20" r="5" fill="rgba(255,255,255,0.15)"/>`;
      s += T(22, 44, 'WS2812B', '#64748b', 6);
      return s;
    },
    sense(c, api) {
      const ch = api.channel(api.pin(c, 'DIN'));
      if (ch && ch.neoPixel) {
        const px = ch.neoPixel(c.id);
        if (px) {
          if (c.state.outR !== px[0] || c.state.outG !== px[1] || c.state.outB !== px[2]) {
            c.state.outR = px[0]; c.state.outG = px[1]; c.state.outB = px[2];
            api.markDirty(c);
          }
          return;
        }
      }
      c.state.outR = +c.props.r || 0; c.state.outG = +c.props.g || 0; c.state.outB = +c.props.b || 0;
    }
  };

  /* ================= MOSFET (IRLZ44N) ================= */
  D.mosfet = {
    type: 'mosfet', name: 'MOSFET (IRLZ44N)', cat: 'Passive Components', icon: '🔲', w: 66, h: 72,
    desc: 'N-channel logic-level MOSFET. Gate (G) ≳ 3 V connects Drain (D) ↔ Source (S). Switch high-current loads like motors & LED strips.',
    pins: [{ id: 'G', label: 'G', x: 10, y: 10, o: 'b', kind: 'digital' }, { id: 'D', label: 'D', x: 10, y: 68, o: 't', kind: 'special' }, { id: 'S', label: 'S', x: 56, y: 68, o: 't', kind: 'special' }],
    render(def, c) {
      const on = c.state.gateHi;
      let s = R(2, 14, 62, 48, on ? '#1a3a2a' : '#1e293b', 'rx="6" stroke="' + (on ? '#4ade80' : '#475569') + '" stroke-width="1.3"');
      s += T(33, 26, 'IRLZ44N', on ? '#4ade80' : '#94a3b8', 7);
      s += `<path d="M28 14 L28 ${on ? '42' : '38'} L40 ${on ? '42' : '38'} L40 14" fill="none" stroke="${on ? '#4ade80' : '#64748b'}" stroke-width="2"/>`;
      s += `<path d="M24 36 L40 36 M24 42 L40 42" stroke="${on ? '#4ade80' : '#64748b'}" stroke-width="1.5"/>`;
      s += T(16, 52, on ? 'ON' : 'OFF', on ? '#4ade80' : '#64748b', 7);
      s += plabels(def);
      return s;
    },
    tick(c, api) {
      const gateV = api.volts(api.pin(c, 'G'));
      const on = gateV != null && gateV > 2.5;
      if (on !== c.state.gateHi) { c.state.gateHi = on; api.markDirty(c); }
      if (on) api.connect(api.pin(c, 'D'), api.pin(c, 'S'));
    }
  };

  /* ================= TILT / VIBRATION SWITCH ================= */
  D.tilt = {
    type: 'tilt', name: 'Tilt / Vibration SW', cat: 'Inputs', icon: '📳', w: 44, h: 44,
    desc: 'Mercury tilt / vibration switch. Connects A–B when tilted/vibrating. Trigger with the shake event.',
    pins: [{ id: 'A', label: 'A', x: 8, y: 40, o: 'l', kind: 'digital' }, { id: 'B', label: 'B', x: 36, y: 40, o: 'r', kind: 'digital' }],
    props: [{ key: 'active', label: 'Tilted / Shaking', type: 'bool', def: false }],
    render(def, c) {
      const tilt = !!c.props.active;
      let s = R(4, 4, 36, 36, tilt ? '#3b1220' : '#1e293b', 'rx="18" stroke="' + (tilt ? '#f87171' : '#475569') + '" stroke-width="1.5"');
      s += `<g transform="rotate(${tilt ? -45 : 0} 22 22)">`;
      s += `<circle cx="22" cy="22" r="10" fill="#334155"/>`;
      s += `<circle cx="22" cy="18" r="3" fill="#facc15"/>`;
      s += `</g>`;
      s += T(22, 8, tilt ? '⚡' : '', '#f87171', 10);
      return s;
    },
    tick(c, api) { if (c.props.active) api.connect(api.pin(c, 'A'), api.pin(c, 'B')); }
  };

  /* ================= ULTRASONIC JSN-SR04T (Waterproof) ================= */
  D.ultrasonicWp = {
    type: 'ultrasonicWp', name: 'Ultrasonic Waterproof', cat: 'Sensors', icon: '📡', w: 84, h: 56,
    desc: 'JSN-SR04T waterproof ultrasonic 25–450cm. Same API as HC-SR04 but with external weatherproof housing.',
    pins: [{ id: 'VCC', label: 'VCC', x: 10, y: 50, o: 'r', kind: 'power' }, { id: 'TRIG', label: 'TRIG', x: 32, y: 50, o: 't', kind: 'digital' }, { id: 'ECHO', label: 'ECHO', x: 58, y: 50, o: 't', kind: 'digital' }, { id: 'GND', label: 'GND', x: 78, y: 50, o: 'l', kind: 'ground' }],
    props: [{ key: 'dist', label: 'Distance (cm)', type: 'range', def: 85, min: 25, max: 450, step: 1 }, { key: 'auto', label: 'Auto random', type: 'bool', def: false }],
    render(def, c) {
      let s = R(0, 6, 84, 44, '#1a2d40', 'rx="8" stroke="#286780"');
      s += R(14, 10, 56, 34, '#0f1a28', 'rx="20" stroke="#1e4058"');
      s += T(42, 30, 'JSN-SR04T', '#71c8e8', 8);
      s += T(42, 44, Math.round(c.props.dist) + ' cm', '#9fc7ee', 6);
      s += `<circle cx="32" cy="24" r="3" fill="#60a5fa" opacity="0.4"><animate attributeName="r" values="2;5;2" dur="2s" repeatCount="indefinite"/></circle>`;
      s += plabels(def);
      return s;
    },
    ticks: 'ultrasonic'
  };
  Object.assign(D.ultrasonicWp, { tick: D.ultrasonic.tick });

  /* ================= LASER EMITTER ================= */
  D.laser = {
    type: 'laser', name: 'Laser Emitter (KY-008)', cat: 'Outputs & Actuators', icon: '🔴', w: 70, h: 40,
    desc: '650nm red laser module. SIG HIGH turns on the laser beam. Use with LDR as a laser tripwire!',
    pins: [{ id: 'SIG', label: 'S', x: 10, y: 36, o: 'l', kind: 'digital' }, { id: 'VCC', label: '+', x: 30, y: 36, o: 't', kind: 'power' }, { id: 'GND', label: '−', x: 56, y: 36, o: 'r', kind: 'ground' }],
    render(def, c) {
      const on = c.state.on;
      let s = R(2, 2, 40, 36, '#1f2937', 'rx="6" stroke="#475569"');
      s += T(22, 22, 'LASER', '#fb923c', 7);
      s += `<circle cx="52" cy="20" r="6" fill="${on ? '#ef4444' : '#450a0a'}" style="filter:${on ? 'drop-shadow(0 0 8px #ef4444)' : 'none'};transition:all .15s"/>`;
      if (on) s += `<line x1="54" y1="20" x2="69" y2="20" stroke="#ef4444" stroke-width="1.5" opacity="0.6" stroke-dasharray="3 3"/>`;
      s += plabels(def);
      return s;
    },
    sense(c, api) { const hi = api.state(api.pin(c, 'SIG')) === 'hi'; if (hi !== c.state.on) { c.state.on = hi; api.markDirty(c); } }
  };

  /* ================= BREADBOARD MINI ================= */
  D.breadboard = {
    type: 'breadboard', name: 'Mini Breadboard', cat: 'Prototyping & Power', icon: '🔌', w: 100, h: 70,
    desc: 'Mini 170-point breadboard for compact prototyping. Power rails at top and bottom.',
    pins: [
      { id: '+5V_A', label: '+', x: 6, y: 6, kind: 'power' }, { id: 'GND_A', label: '−', x: 18, y: 6, kind: 'ground' },
      ...Array(8).fill(0).map((_, i) => ({ id: 'A' + (i + 1), label: '', x: 36 + i * 8, y: 6, kind: 'special', nolabel: true })),
      ...Array(8).fill(0).map((_, i) => ({ id: 'B' + (i + 1), label: '', x: 36 + i * 8, y: 36, kind: 'special', nolabel: true })),
      { id: '+5V_B', label: '+', x: 6, y: 64, kind: 'power' }, { id: 'GND_B', label: '−', x: 18, y: 64, kind: 'ground' },
      { id: 'GND_A2', label: '−', x: 88, y: 6, kind: 'ground', nolabel: true }, { id: '+5V_A2', label: '+', x: 96, y: 6, kind: 'power', nolabel: true },
      { id: 'GND_B2', label: '−', x: 88, y: 64, kind: 'ground', nolabel: true }, { id: '+5V_B2', label: '+', x: 96, y: 64, kind: 'power', nolabel: true }
    ],
    render(def, c) {
      let s = R(0, 0, 100, 70, '#e5d9c5', 'rx="4" stroke="#d4c5a8"');
      s += R(4, 2, 18, 14, '#f0ebe0', 'rx="2"'); s += T(13, 10, '+ −', '#c2410c', 8);
      s += Array(8).fill(0).map((_, i) => R(34 + i * 8, 2, 6, 14, '#f0ebe0', 'rx="1"')).join('');
      s += R(4, 32, 18, 14, '#f0ebe0', 'rx="2"'); s += T(13, 40, '+ −', '#c2410c', 8);
      s += Array(8).fill(0).map((_, i) => R(34 + i * 8, 32, 6, 14, '#f0ebe0', 'rx="1"')).join('');
      s += R(4, 56, 18, 12, '#f0ebe0', 'rx="2"'); s += T(13, 63, '+ −', '#c2410c', 8);
      s += R(86, 2, 12, 14, '#f0ebe0', 'rx="2"'); s += R(86, 32, 12, 14, '#f0ebe0', 'rx="2"'); s += R(86, 56, 12, 12, '#f0ebe0', 'rx="2"');
      s += T(13, 18, 'A1 A2 A3 A4 A5 A6 A7 A8', '#64748b', 5, 'start');
      s += T(13, 48, 'B1 B2 B3 B4 B5 B6 B7 B8', '#64748b', 5, 'start');
      return s;
    },
    tick(c, api) {
      const groups = [
        ['+5V_A', '+5V_A2'], ['GND_A', 'GND_A2'],
        ['+5V_B', '+5V_B2'], ['GND_B', 'GND_B2'],
        ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
        ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8']
      ];
      groups.forEach(group => {
        for (let i = 1; i < group.length; i++) api.connect(api.pin(c, group[0]), api.pin(c, group[i]));
      });
    }
  };

  /* categories order for the library */
  CS.LIB_CATS = ['Boards & MCUs', 'Prototyping & Power', 'Passive Components', 'Inputs', 'Sensors', 'Outputs & Actuators'];
  /* ================= CUSTOM COMPONENT SDK (Workstream F) ================= */
  CS.registerCustomComponent = function(def) {
    if (!def || !def.type || !def.pins) return false;
    const type = String(def.type).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const customDef = {
      type,
      name: def.name || type,
      cat: def.category || 'Custom',
      icon: def.icon || '🧩',
      w: def.w || 80,
      h: def.h || 60,
      desc: def.desc || 'Custom user-defined component.',
      pins: def.pins || [],
      render(d, c) {
        if (def.renderSvg) {
          try {
            return def.renderSvg(d, c);
          } catch (e) {
            console.error('Custom component render error:', e);
          }
        }
        let s = R(2, 2, d.w - 4, d.h - 4, '#1e293b', 'rx="6" stroke="#475569"');
        s += T(d.w / 2, d.h / 2, d.name, '#94a3b8', 9);
        s += plabels(d);
        return s;
      },
      tick(c, api) {
        if (def.logicJs) {
          // Web Worker sandboxed evaluation
          try {
            if (typeof def.tick === 'function') def.tick(c, api);
          } catch (e) {
            console.error('Custom component tick error:', e);
          }
        }
      }
    };
    D[type] = customDef;
    return true;
  };
})();
