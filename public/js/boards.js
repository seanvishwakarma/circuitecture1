/* CircuitTecture — component registry: boards, breadboards, power.
   Def shape:
   { type, name, cat, icon, w, h, desc, pins:[{id,label,x,y,kind,o}],
     props:[{key,label,type,...}], render(def,comp)=>svg, tick?(comp,api,dt),
     links?():[[pinId,pinId]..] internal electrical bonds, mcu?, vcc? }
   kind: power|ground|digital|analog|i2c|spi|special  */
(function () {
  const CS = window.CS;
  CS.defs = CS.defs || {};
  const KIND_COLOR = { power: '#ef4444', ground: '#333333', digital: '#3b82f6', analog: '#facc15', i2c: '#22c55e', spi: '#f97316', special: '#94a3b8' };
  CS.KIND_COLOR = KIND_COLOR;

  const R = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  const T = (x, y, s, fill = '#cbd5e1', size = 7, anchor = 'middle') => `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-family="monospace" text-anchor="${anchor}">${s}</text>`;
  const CI = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  const path = (d, stroke, w = 2, fill = 'none') => `<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="${fill}" stroke-linecap="round"/>`;

  /* pin label helper */
  function plabels(def) {
    let s = '';
    for (const p of def.pins) {
      if (p.nolabel) continue;
      const o = p.o || 't';
      if (o === 't') s += T(p.x, p.y - 4.5, p.label, '#7d8fb3', 5.6);
      else if (o === 'b') s += T(p.x, p.y + 9.5, p.label, '#7d8fb3', 5.6);
      else if (o === 'l') s += T(p.x - 4, p.y + 2, p.label, '#7d8fb3', 5.6, 'end');
      else s += T(p.x + 4, p.y + 2, p.label, '#7d8fb3', 5.6, 'start');
    }
    return s;
  }
  CS._svg = { R, T, CI, path, plabels };

  function headerRow(x0, y, n, step) { // black pin-header graphic behind pins
    return R(x0 - 5, y - 4.5, (n - 1) * step + 10, 9, '#10141f', 'rx="2"');
  }
  function socketCol(x, y0, n, step) {
    return R(x - 4.5, y0 - 5, 9, (n - 1) * step + 10, '#10141f', 'rx="2"');
  }

  /* ================= ARDUINO UNO ================= */
  function baseUno(name, type, extraPins) {
    const pins = [];
    for (let i = 0; i <= 13; i++) pins.push({ id: 'D' + i, label: String(i), x: 222 - i * 12, y: 10, kind: i >= 3 && i <= 11 && i !== 4 && i !== 7 && i !== 8 ? 'digital pwm' : 'digital', o: 'b' });
    ['5V', '3V3', 'GND', 'GND2', 'VIN', 'RST'].forEach((id, i) => pins.push({ id, label: id === 'GND2' ? 'GND' : id, x: 54 + i * 12, y: 140, o: 't', kind: id.startsWith('GND') ? 'ground' : 'power' }));
    for (let i = 0; i <= 5; i++) pins.push({ id: 'A' + i, label: 'A' + i, x: 150 + i * 12, y: 140, o: 't', kind: 'analog' });
    if (extraPins) pins.push(...extraPins);
    return {
      type, name, cat: 'Boards & MCUs', icon: '🟦', w: 250, h: 150, mcu: true, vcc: 5, family: 'avr',
      desc: 'Arduino ' + name + ' — ATmega328P, 16 MHz, 14 digital (6 PWM), 6 analog in, 32 KB flash.',
      pins,
      render(def) {
        // Semi-realistic Uno R3 — teal PCB with sheen, plated mounting holes,
        // metal USB shell, electrolytic cans, silkscreen.
        let s = `<defs>
          <linearGradient id="unoPcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#12949e"/><stop offset="55%" stop-color="#0e7c86"/><stop offset="100%" stop-color="#0a6169"/></linearGradient>
          <linearGradient id="unoMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e8ecf3"/><stop offset="45%" stop-color="#c8ccd4"/><stop offset="100%" stop-color="#9aa1ad"/></linearGradient>
          <linearGradient id="unoChip" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#232936"/><stop offset="100%" stop-color="#14161d"/></linearGradient>
          <linearGradient id="unoSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".13"/><stop offset="35%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
          <linearGradient id="unoCan" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#274060"/><stop offset="50%" stop-color="#4a6fa5"/><stop offset="100%" stop-color="#1e3350"/></linearGradient>
        </defs>`;
        // PCB body + sheen + bottom edge shade
        s += R(0, 0, 250, 150, 'url(#unoPcb)', 'rx="9"');
        s += R(0, 0, 250, 40, 'url(#unoSheen)', 'rx="9"');
        s += R(0, 144, 250, 6, '#07393f', 'rx="9" opacity=".55"');
        s += R(0, 0, 250, 150, 'none', 'rx="9" stroke="#12aab5" stroke-width="1.2" opacity=".7"');
        // mounting holes (silver-plated)
        [[10, 75], [240, 75], [14, 134], [236, 134]].forEach(([hx, hy]) => { s += CI(hx, hy, 4, 'none', 'stroke="#9aa1ad" stroke-width="1" opacity=".8"') + CI(hx, hy, 2.6, '#0a3f45'); });
        // USB-B: metal shell + ridges + recess
        s += R(-3, 13, 22, 36, 'url(#unoMetal)', 'rx="4" stroke="#7c8490" stroke-width=".8"');
        s += R(2, 15, 14, 3, '#aab2be', 'rx="1"') + R(2, 21, 14, 3, '#aab2be', 'rx="1"');
        s += R(3, 34, 12, 11, '#2b3038', 'rx="2"') + R(5, 37, 8, 5, '#e8ecf3', 'rx="1"');
        // barrel jack: body + silver rim + center hole
        s += R(-3, 95, 24, 28, '#15181f', 'rx="5" stroke="#2b303b" stroke-width="1"');
        s += CI(10, 109, 7.5, 'none', 'stroke="#9aa1ad" stroke-width="1.6"') + CI(10, 109, 4.6, '#000');
        // ATmega328P with legs + notch dot
        for (let i = 0; i < 14; i++) { s += R(94 + i * 4.6, 46.5, 2.2, 5.5, '#aab2be'); s += R(94 + i * 4.6, 72, 2.2, 5.5, '#aab2be'); }
        s += R(88, 52, 74, 20, 'url(#unoChip)', 'rx="2.5" stroke="#2b303b" stroke-width=".8"');
        s += CI(94, 57, 1.8, '#3d4453');
        s += T(125, 66, 'ATMEGA328P', '#5a6478', 6.4);
        // crystal + voltage regulator + electrolytic cans
        s += R(90, 28, 26, 9, 'url(#unoMetal)', 'rx="4.5" stroke="#8a919d" stroke-width=".6"') + R(97, 25, 12, 3, '#aab2be', 'rx="1.5"');
        s += R(34, 52, 16, 10, '#191d24', 'rx="2"') + R(38, 46, 8, 6, 'url(#unoMetal)');
        s += R(162, 84, 11, 12, 'url(#unoCan)', 'rx="2" stroke="#16233a" stroke-width=".8"') + R(162, 84, 11, 4, '#c8ccd4', 'rx="2"') + T(167.5, 88, '+', '#16233a', 5);
        s += R(176, 84, 11, 12, 'url(#unoCan)', 'rx="2" stroke="#16233a" stroke-width=".8"') + R(176, 84, 11, 4, '#c8ccd4', 'rx="2"') + T(181.5, 88, '+', '#16233a', 5);
        // ICSP 2×3 header with plated holes
        s += R(206, 94, 30, 18, '#10141f', 'rx="2"');
        [0, 1, 2].forEach(i => { s += CI(214 + i * 9, 99, 2, '#0a0d14', 'stroke="#8a6f2e" stroke-width=".8"') + CI(214 + i * 9, 107, 2, '#0a0d14', 'stroke="#8a6f2e" stroke-width=".8"'); });
        s += T(221, 119, 'ICSP', '#cfeef2', 5);
        // reset tactile button (silver body, dark stem)
        s += R(37, 121, 11, 11, 'url(#unoMetal)', 'rx="2" stroke="#8a919d" stroke-width=".7"') + CI(42.5, 126.5, 3, '#e11d48', 'stroke="#9f1239" stroke-width=".8"') + T(42.5, 142, 'RESET', '#cfeef2', 5);
        // chip LEDs: L (amber) + ON (green)
        s += R(66, 31.5, 8, 5, '#facc15', 'rx="2"') + CI(70, 34, 1.4, '#fff7d6') + T(70, 26, 'L', '#fff7d6', 5.6);
        s += R(236, 57.5, 8, 5, '#22c55e', 'rx="2"') + CI(240, 60, 1.4, '#d9f9e5') + T(240, 52, 'ON', '#d9f9e5', 5.6);
        // header strips with plated holes (pins draw on top)
        function hstrip(x0, y, n, step) { let h = R(x0 - 5, y - 5.5, (n - 1) * step + 10, 11, '#0d1119', 'rx="2" stroke="#1b2230" stroke-width=".7"'); for (let i = 0; i < n; i++) h += CI(x0 + i * step, y, 2.3, '#07090e', 'stroke="#8a6f2e" stroke-width=".9"'); return h; }
        s += hstrip(66, 10, 14, 12) + hstrip(54, 140, 6, 12) + hstrip(150, 140, 6, 12);
        // silkscreen: logo box + brand + model
        s += R(28, 62, 12, 14, 'none', 'stroke="#e9fbfd" stroke-width="1.5"') + T(34, 72.5, '∞', '#e9fbfd', 8);
        s += T(20, 90, 'ARDUINO', '#f0feff', 11, 'start') + T(20, 101, name.toUpperCase(), '#bdeef4', 8.5, 'start');
        s += T(246, 145.5, '⌀ ATmega · 16 MHz', '#7fd4dc', 5.4, 'end');
        s += plabels(def);
        return s;
      }
    };
  }
  CS.defs.uno = baseUno('Uno R3', 'uno');

  /* ================= ARDUINO MEGA ================= */
  CS.defs.mega = (() => {
    const pins = [];
    for (let i = 0; i <= 21; i++) pins.push({ id: 'D' + i, label: String(i), x: 258 - i * 10, y: 10, kind: 'digital', o: 'b' });
    for (let i = 22; i <= 41; i++) pins.push({ id: 'D' + i, label: String(i), x: 292, y: 34 + (i - 22) * 9, kind: 'digital', o: 'l' });
    for (let i = 42; i <= 53; i++) pins.push({ id: 'D' + i, label: String(i), x: 8, y: 34 + (i - 42) * 9, kind: 'digital', o: 'r' });
    ['5V', '3V3', 'GND', 'GND2', 'VIN', 'RST'].forEach((id, i) => pins.push({ id, label: id === 'GND2' ? 'GND' : id, x: 48 + i * 11, y: 200, o: 't', kind: id.startsWith('GND') ? 'ground' : 'power' }));
    for (let i = 0; i <= 15; i++) pins.push({ id: 'A' + i, label: 'A' + i, x: 120 + i * 11, y: 200, o: 't', kind: 'analog' });
    return {
      type: 'mega', name: 'Mega 2560', cat: 'Boards & MCUs', icon: '🟦', w: 300, h: 210, mcu: true, vcc: 5, family: 'avr',
      desc: 'Arduino Mega 2560 — 54 digital (15 PWM), 16 analog, 256 KB flash.',
      pins,
      render(def) {
        let s = R(0, 0, 300, 210, '#0e7c86', 'rx="9" stroke="#0aa" stroke-width="1.5"');
        s += R(-2, 60, 20, 34, '#c8ccd4', 'rx="4"');
        s += R(110, 80, 90, 26, '#14161d', 'rx="3"') + T(155, 96, 'ATMEGA2560', '#3d4453', 7);
        s += headerRow(58, 10, 22, 10) + headerRow(48, 200, 6, 11) + headerRow(120, 200, 16, 11);
        s += socketCol(292, 34, 20, 9) + socketCol(8, 34, 12, 9);
        s += T(24, 150, 'ARDUINO MEGA', '#e6f7f9', 11, 'start');
        s += CI(278, 24, 2.5, '#22c55e');
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= ARDUINO NANO ================= */
  CS.defs.nano = (() => {
    const ids = ['RST', 'D13', 'D11', 'D10', 'D9', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'TXD', 'RXD', 'RSTB', 'GND'];
    const ids2 = ['D12', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RSTC', 'GNDB', 'VIN'];
    const pins = [];
    ids.forEach((id, i) => pins.push({ id, label: id.replace('RSTB', 'RST').replace('TXD', 'D1').replace('RXD', 'D0'), x: 7, y: 20 + i * 12, o: 'r', kind: id.startsWith('GND') ? 'ground' : id === '5V' || id === '3V3' ? 'power' : 'digital' }));
    ids2.forEach((id, i) => pins.push({ id, label: id.replace('GNDB', 'GND'), x: 63, y: 20 + i * 12, o: 'l', kind: id.startsWith('A') ? 'analog' : id === '5V' || id === '3V3' ? 'power' : id.startsWith('GND') ? 'ground' : id === 'VIN' ? 'power' : 'digital' }));
    return {
      type: 'nano', name: 'Nano', cat: 'Boards & MCUs', icon: '🟩', w: 70, h: 210, mcu: true, vcc: 5, family: 'avr',
      desc: 'Arduino Nano — breadboard-friendly ATmega328P. Plugs across the breadboard gap.',
      pins,
      render(def) {
        let s = R(0, 0, 70, 210, '#1573a8', 'rx="6" stroke="#4aa3d8" stroke-width="1.2"');
        s += R(23, -3, 24, 14, '#c8ccd4', 'rx="3"') + R(27, 0, 16, 9, '#3a3f47', 'rx="2"'); // usb mini
        s += headerRow(7, 20, 15, 12) + headerRow(63, 20, 15, 12) + socketCol(7, 20, 15, 12) + socketCol(63, 20, 15, 12);
        s += R(24, 96, 22, 14, '#14161d', 'rx="2"');
        s += T(35, 40, 'NANO', '#e6f7f9', 9) + CI(52, 30, 2.4, '#22c55e');
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= ESP32 DEVKIT ================= */
  CS.defs.esp32 = (() => {
    const left = ['EN', '36', '39', '34', '35', '32', '33', '25', '26', '27', '14', '12', '13', 'GND', 'VIN'];
    const right = ['23', '22', '1', '3', '21', '19', '18', '5', '17', '16', '4', '2', '15', '3V3', 'GNDB'];
    const pins = [];
    const kindOf = id => ['VIN', '3V3', 'EN'].includes(id) ? 'power' : id.startsWith('GND') ? 'ground' : ['32', '33', '34', '35', '36', '39'].includes(id) ? 'analog' : ['21', '22'].includes(id) ? 'i2c' : 'digital';
    left.forEach((id, i) => pins.push({ id, label: id === '36' ? 'VP·36' : id === '39' ? 'VN·39' : id, x: 8, y: 22 + i * 13, o: 'r', kind: kindOf(id) }));
    right.forEach((id, i) => pins.push({ id, label: id === 'GNDB' ? 'GND' : id === '1' ? 'TX0' : id === '3' ? 'RX0' : id, x: 111, y: 22 + i * 13, o: 'l', kind: kindOf(id) }));
    return {
      type: 'esp32', name: 'ESP32 DevKit', cat: 'Boards & MCUs', icon: '📶', w: 120, h: 230, mcu: true, vcc: 3.3, family: 'esp',
      desc: 'ESP32-WROOM-32 — 240 MHz dual-core, Wi-Fi + BLE, 3.3 V logic. LED_BUILTIN = GPIO 2.',
      pins,
      render(def) {
        let s = R(0, 0, 120, 230, '#3d4451', 'rx="7" stroke="#59637a" stroke-width="1.2"');
        s += R(96, -3, 22, 16, '#c8ccd4', 'rx="3"') + R(100, 0, 14, 10, '#3a3f47', 'rx="2"');
        s += socketCol(8, 22, 15, 13) + socketCol(111, 22, 15, 13);
        s += R(30, 20, 60, 44, '#23272f', 'rx="4" stroke="#8a93a6"') + R(36, 26, 34, 32, '#14161d', 'rx="2"') + T(60, 46, 'ESP32', '#c8ccd4', 8); // module+antenna
        s += R(4, 200, 10, 16, '#262b35') + R(106, 200, 10, 16, '#262b35'); // buttons
        s += T(60, 90, 'ESP32 DEVKIT', '#e2e8f0', 9) + CI(60, 104, 3, '#38bdf8') + T(60, 116, 'IO2', '#7d8fb3', 5);
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= ESP8266 NODEMCU ================= */
  CS.defs.esp8266 = (() => {
    const left = ['A0', 'RSV1', 'RSV2', 'D8', 'D7', 'D6', 'D5', 'GND', '3V3', 'EN', 'RST', 'GND2', 'VIN'];
    const right = ['D0', 'D1', 'D2', 'D3', 'D4', '3V3B', 'GNDB', 'TX', 'RX', 'D9', 'D10', 'CMD', '5V'];
    const pins = [];
    const kindOf = id => id === 'A0' ? 'analog' : id.startsWith('GND') ? 'ground' : ['3V3', '3V3B', 'VIN', '5V', 'EN'].includes(id) ? 'power' : 'digital';
    left.forEach((id, i) => pins.push({ id, label: id.replace('RSV1', '·').replace('RSV2', '·').replace('GND2', 'GND'), x: 8, y: 24 + i * 13, o: 'r', kind: kindOf(id), nolabel: id.startsWith('RSV') }));
    right.forEach((id, i) => pins.push({ id, label: id.replace('3V3B', '3V3').replace('GNDB', 'GND'), x: 111, y: 24 + i * 13, o: 'l', kind: kindOf(id) }));
    return {
      type: 'esp8266', name: 'ESP8266 NodeMCU', cat: 'Boards & MCUs', icon: '📡', w: 120, h: 220, mcu: true, vcc: 3.3, family: 'esp',
      desc: 'NodeMCU ESP-12E — 80 MHz, Wi-Fi, 3.3 V logic. D1=GPIO5, D2=GPIO4, D4=GPIO2 …',
      gpioMap: { 16: 'D0', 5: 'D1', 4: 'D2', 0: 'D3', 2: 'D4', 14: 'D5', 12: 'D6', 13: 'D7', 15: 'D8' },
      pins,
      render(def) {
        let s = R(0, 0, 120, 220, '#2b2f3a', 'rx="7" stroke="#4b5264" stroke-width="1.2"');
        s += R(96, -3, 22, 16, '#c8ccd4', 'rx="3"');
        s += socketCol(8, 24, 13, 13) + socketCol(111, 24, 13, 13);
        s += R(28, 18, 64, 46, '#1f232b', 'rx="4" stroke="#8a93a6"') + T(60, 46, 'ESP-12E', '#c8ccd4', 8);
        s += T(60, 96, 'NodeMCU', '#e2e8f0', 10);
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= RASPBERRY PI PICO ================= */
  CS.defs.pico = (() => {
    const left = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND4', 'GP14', 'GP15'];
    const right = ['GP16', 'GP17', 'GND5', 'GP18', 'GP19', 'GP20', 'GP21', 'GP22', 'RUN', 'GP26', 'GP27', 'GP28', 'AGND', '3V3', 'EN3V3', 'VSYS', 'VBUS', 'GND8', 'GND9', 'GP25'];
    const pins = [];
    const kindOf = id => ['GP26', 'GP27', 'GP28'].includes(id) ? 'analog' : id.includes('GND') || id === 'AGND' ? 'ground' : ['VBUS', 'VSYS', '3V3', 'EN3V3'].includes(id) ? 'power' : 'digital';
    left.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND'), x: 7, y: 22 + i * 11, o: 'r', kind: kindOf(id) }));
    right.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d+/, 'GND').replace('EN3V3', '3V3EN'), x: 79, y: 22 + i * 11, o: 'l', kind: kindOf(id), nolabel: /GND(8|9)/.test(id) }));
    return {
      type: 'pico', name: 'Raspberry Pi Pico', cat: 'Boards & MCUs', icon: '🍓', w: 86, h: 250, mcu: true, vcc: 3.3, family: 'rp',
      desc: 'RP2040 dual-core 133 MHz. GP0–GP28, 3 ADC pins. LED on GP25.',
      pins,
      render(def) {
        let s = R(0, 0, 86, 250, '#1a7a4a', 'rx="5" stroke="#35b56f" stroke-width="1.2"');
        s += R(28, -3, 30, 14, '#c8ccd4', 'rx="4"') + R(33, 0, 20, 9, '#3a3f47', 'rx="2"');
        s += socketCol(7, 22, 20, 11) + socketCol(79, 22, 20, 11);
        s += R(28, 22, 30, 22, '#b8beca', 'rx="2"') + T(43, 36, 'RP2040', '#3a3f47', 6);
        s += CI(43, 62, 3, '#22c55e') + T(43, 74, 'PICO', '#e6f7f9', 9);
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= MAKE PI FACTORY ================= */
  function makePi(model, type) {
    const topIds = ['3V3', '2', '3', '4', 'GND1', '17', '27', '22', '3V3B', '10', '9', '11', 'GND2', 'IDSD', '5', '6', '13', '19', '26', '20'];
    const botIds = ['5V', '5VB', '14', 'GND3', '15', '18', 'GND4', '23', '24', 'GND5', '25', '8', '7', 'IDSC', 'GND6', '12', 'GND7', '16', 'GND8', '21'];
    const pins = [];
    const kindOf = id => id.includes('GND') ? 'ground' : ['3V3', '3V3B', '5V', '5VB'].includes(id) ? 'power' : ['2', '3'].includes(id) ? 'i2c' : ['10', '9', '11', '8', '7'].includes(id) ? 'spi' : 'digital';
    topIds.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND').replace('3V3B', '3V3').replace('IDSD', 'SD'), x: 62 + i * 9.5, y: 12, o: 'b', kind: kindOf(id), nolabel: true }));
    botIds.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND').replace('5VB', '5V').replace('IDSC', 'SC'), x: 62 + i * 9.5, y: 26, o: 'b', kind: kindOf(id), nolabel: true }));
    const soc = model === '5' ? 'BCM2712' : model === '4' ? 'BCM2711' : 'BCM2837';
    return {
      type, name: 'Raspberry Pi ' + model, cat: 'Boards & MCUs', icon: '🍓', w: 300, h: 180, mcu: true, vcc: 3.3, family: 'linux',
      desc: 'Raspberry Pi ' + model + ' — full Linux SBC. 40-pin GPIO (3.3 V!), I2C/SPI/UART. Sim runs MicroPython-style GPIO code.',
      pins,
      render(def) {
        let s = R(0, 0, 300, 180, '#1a7a4a', 'rx="8" stroke="#35b56f" stroke-width="1.4"');
        s += R(60, 6, 192, 26, '#10141f', 'rx="3"') + R(60, 6, 192, 9, '#0a0d14', 'rx="3"');
        s += T(52, 20, 'GPIO', '#35b56f', 6, 'end');
        s += R(268, 30, 34, 24, '#b8beca', 'rx="3"') + R(268, 58, 34, 24, '#b8beca', 'rx="3"');
        s += R(272, 140, 30, 34, '#b8beca', 'rx="3"') + T(287, 158, 'ETH', '#3a3f47', 6);
        s += R(-2, 40, 18, 22, '#14161d', 'rx="2"') + R(-2, 70, 18, 16, '#14161d', 'rx="2"') + R(-2, 94, 18, 20, '#14161d', 'rx="2"');
        s += R(120, 70, 46, 46, '#14161d', 'rx="4"') + T(143, 90, soc, '#3d4453', 6) + T(143, 100, 'SoC', '#3d4453', 6);
        s += R(180, 74, 34, 26, '#14161d', 'rx="3"') + T(197, 90, 'RAM', '#3d4453', 6);
        s += CI(24, 150, 3, '#22c55e') + CI(34, 150, 3, '#facc15');
        s += T(60, 158, 'RASPBERRY PI ' + model, '#e6f7f9', 11, 'start') + T(60, 170, '› simulated GPIO — runs Python via RPi.GPIO shim', '#a8e6c0', 6.5, 'start');
        s += plabels(def);
        return s;
      }
    };
  }
  CS.defs.rpi5 = makePi('5', 'rpi5');

  /* ================= RASPBERRY PI PICO W ================= */
  CS.defs.picow = (() => {
    const left = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND4', 'GP14', 'GP15'];
    const right = ['GP16', 'GP17', 'GND5', 'GP18', 'GP19', 'GP20', 'GP21', 'GP22', 'RUN', 'GP26', 'GP27', 'GP28', 'AGND', '3V3', 'EN3V3', 'VSYS', 'VBUS', 'GND8', 'GND9', 'GP25'];
    const pins = [];
    const kindOf = id => ['GP26', 'GP27', 'GP28'].includes(id) ? 'analog' : id.includes('GND') || id === 'AGND' ? 'ground' : ['VBUS', 'VSYS', '3V3', 'EN3V3'].includes(id) ? 'power' : 'digital';
    left.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND'), x: 7, y: 22 + i * 11, o: 'r', kind: kindOf(id) }));
    right.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d+/, 'GND').replace('EN3V3', '3V3EN'), x: 79, y: 22 + i * 11, o: 'l', kind: kindOf(id), nolabel: /GND(8|9)/.test(id) }));
    return {
      type: 'picow', name: 'Raspberry Pi Pico W', cat: 'Boards & MCUs', icon: '🍓', w: 86, h: 250, mcu: true, vcc: 3.3, family: 'rp',
      desc: 'RP2040 dual-core 133 MHz with CYW43439 wireless (Wi-Fi + BLE). GP0\u2013GP28, 3 ADC pins. LED on GP25.',
      pins,
      render(def) {
        let s = R(0, 0, 86, 250, '#1a7a4a', 'rx="5" stroke="#35b56f" stroke-width="1.2"');
        s += R(28, -3, 30, 14, '#c8ccd4', 'rx="4"') + R(33, 0, 20, 9, '#3a3f47', 'rx="2"');
        s += socketCol(7, 22, 20, 11) + socketCol(79, 22, 20, 11);
        s += R(28, 22, 30, 22, '#b8beca', 'rx="2"') + T(43, 36, 'RP2040', '#3a3f47', 6);
        s += CI(43, 62, 3, '#22c55e') + T(43, 74, 'PICO W', '#e6f7f9', 9);
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= RASPBERRY PI PICO 2 ================= */
  CS.defs.pico2 = (() => {
    const left = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND4', 'GP14', 'GP15'];
    const right = ['GP16', 'GP17', 'GND5', 'GP18', 'GP19', 'GP20', 'GP21', 'GP22', 'RUN', 'GP26', 'GP27', 'GP28', 'AGND', '3V3', 'EN3V3', 'VSYS', 'VBUS', 'GND8', 'GND9', 'GP25'];
    const pins = [];
    const kindOf = id => ['GP26', 'GP27', 'GP28'].includes(id) ? 'analog' : id.includes('GND') || id === 'AGND' ? 'ground' : ['VBUS', 'VSYS', '3V3', 'EN3V3'].includes(id) ? 'power' : 'digital';
    left.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND'), x: 7, y: 22 + i * 11, o: 'r', kind: kindOf(id) }));
    right.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d+/, 'GND').replace('EN3V3', '3V3EN'), x: 79, y: 22 + i * 11, o: 'l', kind: kindOf(id), nolabel: /GND(8|9)/.test(id) }));
    return {
      type: 'pico2', name: 'Raspberry Pi Pico 2', cat: 'Boards & MCUs', icon: '🍓', w: 86, h: 250, mcu: true, vcc: 3.3, family: 'rp',
      desc: 'RP2350 dual-core Arm Cortex-M33, 150 MHz. GP0\u2013GP28, 3 ADC pins. LED on GP25.',
      pins,
      render(def) {
        let s = R(0, 0, 86, 250, '#1a7a4a', 'rx="5" stroke="#35b56f" stroke-width="1.2"');
        s += R(28, -3, 30, 14, '#c8ccd4', 'rx="4"') + R(33, 0, 20, 9, '#3a3f47', 'rx="2"');
        s += socketCol(7, 22, 20, 11) + socketCol(79, 22, 20, 11);
        s += R(28, 22, 30, 22, '#b8beca', 'rx="2"') + T(43, 36, 'RP2350', '#3a3f47', 6);
        s += CI(43, 62, 3, '#22c55e') + T(43, 74, 'PICO 2', '#e6f7f9', 9);
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= RASPBERRY PI ZERO 2 W ================= */
  CS.defs.rpizero2w = (() => {
    const topIds = ['3V3', '2', '3', '4', 'GND1', '17', '27', '22', '3V3B', '10', '9', '11', 'GND2', 'IDSD', '5', '6', '13', '19', '26', '20'];
    const botIds = ['5V', '5VB', '14', 'GND3', '15', '18', 'GND4', '23', '24', 'GND5', '25', '8', '7', 'IDSC', 'GND6', '12', 'GND7', '16', 'GND8', '21'];
    const pins = [];
    const kindOf = id => id.includes('GND') ? 'ground' : ['3V3', '3V3B', '5V', '5VB'].includes(id) ? 'power' : ['2', '3'].includes(id) ? 'i2c' : ['10', '9', '11', '8', '7'].includes(id) ? 'spi' : 'digital';
    topIds.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND').replace('3V3B', '3V3').replace('IDSD', 'SD'), x: 36 + i * 6, y: 12, o: 'b', kind: kindOf(id), nolabel: true }));
    botIds.forEach((id, i) => pins.push({ id, label: id.replace(/GND\d/, 'GND').replace('5VB', '5V').replace('IDSC', 'SC'), x: 36 + i * 6, y: 22, o: 'b', kind: kindOf(id), nolabel: true }));
    return {
      type: 'rpizero2w', name: 'Raspberry Pi Zero 2 W', cat: 'Boards & MCUs', icon: '🍓', w: 180, h: 100, mcu: true, vcc: 3.3, family: 'linux',
      desc: 'Quad-core ARM Cortex-A53, 1 GHz, 512 MB RAM, Wi-Fi. Runs full Linux, simulated GPIO like RPi5.',
      pins,
      render(def) {
        let s = R(0, 0, 180, 100, '#1a7a4a', 'rx="6" stroke="#35b56f" stroke-width="1.3"');
        s += R(32, 6, 128, 20, '#10141f', 'rx="3"') + R(32, 6, 128, 6, '#0a0d14', 'rx="3"');
        s += T(28, 16, 'GPIO', '#35b56f', 5.5, 'end');
        s += R(168, 26, 14, 16, '#b8beca', 'rx="2"');
        s += R(-2, 40, 12, 16, '#14161d', 'rx="2"') + R(-2, 60, 12, 14, '#14161d', 'rx="2"');
        s += R(70, 42, 30, 22, '#14161d', 'rx="3"') + T(85, 50, 'BCM2710A1', '#3d4453', 5.5);
        s += R(108, 44, 18, 14, '#14161d', 'rx="2"');
        s += CI(16, 80, 2.5, '#22c55e');
        s += T(30, 88, 'RASPBERRY PI ZERO 2 W', '#e6f7f9', 8.5, 'start');
        s += T(30, 97, 'simulated GPIO \u2014 runs Python via RPi.GPIO shim', '#a8e6c0', 5.5, 'start');
        s += plabels(def);
        return s;
      }
    };
  })();

  /* ================= BREADBOARDS ================= */
  function makeBreadboard(type, name, cols) {
    const sp = 13, x0 = 22, w = x0 * 2 + (cols - 1) * sp;
    const rows = { rp: 14, rn: 25, a: 47, b: 58, c: 69, d: 80, e: 91, f: 115, g: 126, h: 137, i: 148, j: 159, rn2: 181, rp2: 192 };
    const h = 206;
    const pins = [];
    for (let c = 1; c <= cols; c++) {
      const x = x0 + (c - 1) * sp;
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].forEach(r =>
        pins.push({ id: r + c, label: '', x, y: rows[r], kind: 'special', nolabel: true, bb: r + c }));
      pins.push({ id: 'tp' + c, label: '', x, y: rows.rp, kind: 'special', nolabel: true, bb: '+ top rail' });
      pins.push({ id: 'tn' + c, label: '', x, y: rows.rn, kind: 'special', nolabel: true, bb: '− top rail' });
      pins.push({ id: 'bp' + c, label: '', x, y: rows.rp2, kind: 'special', nolabel: true, bb: '+ bottom rail' });
      pins.push({ id: 'bn' + c, label: '', x, y: rows.rn2, kind: 'special', nolabel: true, bb: '− bottom rail' });
    }
    const links = [];
    for (let c = 1; c <= cols; c++) {
      ['abcde', 'fghij'].forEach(group => { for (let i = 1; i < 5; i++) links.push([group[i - 1] + c, group[i] + c]); });
      if (c > 1) { links.push(['tp' + (c - 1), 'tp' + c]); links.push(['tn' + (c - 1), 'tn' + c]); links.push(['bp' + (c - 1), 'bp' + c]); links.push(['bn' + (c - 1), 'bn' + c]); }
    }
    return {
      type, name, cat: 'Prototyping & Power', icon: '🍞', w, h, breadboard: true,
      desc: `${name} — ${cols} columns. Columns a–e and f–j are connected vertically; +/− rails run horizontally.`,
      pins, links,
      render() {
        let s = R(0, 0, w, h, '#ece8db', 'rx="8" stroke="#c4bfaf" stroke-width="1.2"');
        s += `<rect x="0" y="0" width="${w}" height="${h}" rx="8" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>`;
        s += R(8, 4, w - 16, 33, '#e1dccd', 'rx="5"') + R(8, h - 37, w - 16, 33, '#e1dccd', 'rx="5"');
        s += R(8, 4, w - 16, 33, 'none', 'rx="5" stroke="rgba(0,0,0,.06)" stroke-width="1"');
        s += R(8, h - 37, w - 16, 33, 'none', 'rx="5" stroke="rgba(0,0,0,.06)" stroke-width="1"');
        s += R(-2, -2, w + 4, 1, '#f5f0df', 'rx="1" opacity=".4"');
        s += R(-2, h - 1, w + 4, 3, '#c4bfaf', 'rx="1" opacity=".5"');
        const rw = w - 24;
        s += `<rect x="${12}" y="${rows.rp - 3}" width="${rw}" height="2.6" fill="#d64038" rx="1.3"/>`;
        s += `<rect x="${12}" y="${rows.rp - 3}" width="${rw}" height="1" fill="#f06a60" rx="0.5" opacity=".5"/>`;
        s += `<rect x="${12}" y="${rows.rn - 3}" width="${rw}" height="2.6" fill="#2f55c4" rx="1.3"/>`;
        s += `<rect x="${12}" y="${rows.rn - 3}" width="${rw}" height="1" fill="#5a7ae8" rx="0.5" opacity=".5"/>`;
        s += `<rect x="${12}" y="${rows.rp2 - 3}" width="${rw}" height="2.6" fill="#d64038" rx="1.3"/>`;
        s += `<rect x="${12}" y="${rows.rp2 - 3}" width="${rw}" height="1" fill="#f06a60" rx="0.5" opacity=".5"/>`;
        s += `<rect x="${12}" y="${rows.rn2 - 3}" width="${rw}" height="2.6" fill="#2f55c4" rx="1.3"/>`;
        s += `<rect x="${12}" y="${rows.rn2 - 3}" width="${rw}" height="1" fill="#5a7ae8" rx="0.5" opacity=".5"/>`;
        s += T(14, rows.rp + 2.5, '+', '#f87171', 7) + T(14, rows.rn + 2.5, '−', '#6a8ae8', 7);
        s += T(14, rows.rp2 + 2.5, '+', '#f87171', 7) + T(14, rows.rn2 + 2.5, '−', '#6a8ae8', 7);
        s += R(10, 101.5, w - 20, 7, '#d2ccbc', 'rx="3"');
        s += R(12, 103.5, w - 24, 3, 'none', 'stroke="#bdb6a3" stroke-width="1" rx="1" opacity=".6"');
        const hole = (cx, cy) => {
          s += CI(cx, cy, 2.2, '#3a352e');
          s += CI(cx, cy, 1.6, '#c2b9a6');
          s += CI(cx, cy, 1, '#ddd5c2');
        };
        for (let c = 1; c <= cols; c++) {
          const x = x0 + (c - 1) * sp;
          if (c % 5 === 0) s += T(x, 106, String(c), '#8a8272', 5);
          ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].forEach(r => hole(x, rows[r]));
          ['rp', 'rn', 'rp2', 'rn2'].forEach(r => hole(x, rows[r]));
        }
        s += T(x0 - 12, 50, 'a', '#8a8272', 6) + T(x0 - 12, 61, 'b', '#8a8272', 6) + T(x0 - 12, 72, 'c', '#8a8272', 6) + T(x0 - 12, 83, 'd', '#8a8272', 6) + T(x0 - 12, 94, 'e', '#8a8272', 6);
        s += T(x0 - 12, 118, 'f', '#8a8272', 6) + T(x0 - 12, 129, 'g', '#8a8272', 6) + T(x0 - 12, 140, 'h', '#8a8272', 6) + T(x0 - 12, 151, 'i', '#8a8272', 6) + T(x0 - 12, 162, 'j', '#8a8272', 6);
        return s;
      }
    };
  }
  CS.defs.bb_full = makeBreadboard('bb_full', 'Breadboard (full)', 30);
  CS.defs.bb_half = makeBreadboard('bb_half', 'Breadboard (half)', 25);

  /* ================= POWER SUPPLY MODULE ================= */
  CS.defs.psu = {
    type: 'psu', name: 'Power Supply Module', cat: 'Prototyping & Power', icon: '🔌', w: 132, h: 96,
    desc: 'MB102-style breadboard PSU. Toggle the switch to output 5 V / 3.3 V on the rails.',
    pins: [
      { id: '5V', label: '5V', x: 20, y: 24, o: 'b', kind: 'power' }, { id: '3V3', label: '3V3', x: 40, y: 24, o: 'b', kind: 'power' },
      { id: 'GND', label: 'GND', x: 20, y: 76, o: 't', kind: 'ground' }, { id: 'GNDB', label: 'GND', x: 40, y: 76, o: 't', kind: 'ground' },
      { id: 'VIN', label: 'Vin', x: 118, y: 50, o: 'l', kind: 'power' }
    ],
    props: [{ key: 'on', label: 'Switch ON', type: 'bool', def: true }],
    render(def, c) {
      const on = c.props.on !== false;
      let s = R(0, 0, 132, 96, '#153b6e', 'rx="7" stroke="#2a5aa8" stroke-width="1.3"');
      s += R(-6, 34, 16, 26, '#14161d', 'rx="4"') + CI(2, 47, 5, '#000'); // barrel
      s += CI(96, 30, 10, '#c8ccd4') + CI(96, 30, 4, '#3a3f47'); // usb-a? decorative pot
      s += R(56, 40, 22, 14, '#10141f', 'rx="3"') + R(on ? 66 : 58, 42, 10, 10, on ? '#4ade80' : '#94a3b8', 'rx="2" data-act="toggle"') + T(67, 36, on ? 'ON' : 'OFF', on ? '#4ade80' : '#94a3b8', 6);
      s += headerRow(20, 24, 2, 20) + headerRow(20, 76, 2, 20);
      s += T(30, 12, 'MB102 PSU', '#bfd3f5', 8);
      s += CI(110, 74, 3, on ? '#22c55e' : '#374151');
      s += plabels(def);
      return s;
    },
    tick(c, api) { if (c.props.on !== false) { api.drive(api.pin(c, '5V'), 5, 'strong'); api.drive(api.pin(c, '3V3'), 3.3, 'strong'); api.drive(api.pin(c, 'VIN'), 9, 'strong'); } api.drive(api.pin(c, 'GND'), 0, 'strong'); api.drive(api.pin(c, 'GNDB'), 0, 'strong'); }
  };

  /* ================= BATTERY PACK ================= */
  CS.defs.battery = {
    type: 'battery', name: 'Battery Pack', cat: 'Prototyping & Power', icon: '🔋', w: 110, h: 64,
    desc: 'DC battery pack. Set voltage in the inspector (default 9 V).',
    pins: [{ id: '+', label: '+', x: 16, y: 50, o: 'l', kind: 'power' }, { id: '-', label: '−', x: 94, y: 50, o: 'r', kind: 'ground' }],
    props: [{ key: 'voltage', label: 'Voltage (V)', type: 'number', def: 9, min: 1.5, max: 24, step: 0.5 }],
    render(def, c) {
      let s = `<defs><linearGradient id="batBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3d4857"/><stop offset="100%" stop-color="#111827"/></linearGradient><linearGradient id="batBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f45f4e"/><stop offset="100%" stop-color="#c92f27"/></linearGradient></defs>`;
      s += path('M16 50 L8 50 M8 42 L8 26', '#94a3b8', 2.5) + path('M94 50 L102 50 M102 42 L102 26', '#94a3b8', 2.5);
      s += R(8, 8, 94, 34, 'url(#batBody)', 'rx="6" stroke="#0b1220" stroke-width="1.2"');
      s += R(8, 8, 94, 12, 'url(#batBand)', 'rx="6"') + R(10, 9, 90, 4, '#ffffff', 'rx="2" opacity=".22"');
      s += R(10.5, 45, 5, 10, '#c8ccd4', 'rx="1.5"') + R(94.5, 45, 5, 10, '#c8ccd4', 'rx="1.5"');
      s += T(55, 33, (c.props.voltage || 9) + ' V', '#e5e7eb', 10) + T(16, 17, '+', '#fff', 8) + T(96, 17, '−', '#fff', 8);
      return s;
    },
    tick(c, api) { const v = +c.props.voltage || 9; api.drive(api.pin(c, '+'), v, 'strong'); api.drive(api.pin(c, '-'), 0, 'strong'); }
  };
})();
