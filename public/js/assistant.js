/* CircuitTecture — offline AI assistant.
   Suggests components, generates starter circuits from a text prompt,
   lints code/wiring for common mistakes, explains wiring, and lists what parts need to function. */
(function () {
  const CS = window.CS;
  let log, suggestRow;

  const PART_KEYWORDS = [
    ['led', /led|light|lamp|glow/i], ['ledrgb', /rgb|color.*led|mood/i], ['buzzer', /buzz|beep|alarm.*sound|chime/i],
    ['pushbutton', /button|push/i], ['switch', /switch/i], ['potentiometer', /pot|knob|dial/i], ['slider', /slider|fader/i],
    ['joystick', /joystick/i], ['keypad', /keypad|pin.*pad/i], ['encoder', /encoder|rotary/i],
    ['dht22', /dht|temperature|humidity|weather/i], ['ultrasonic', /ultrasonic|distance|sonar|sr04|parking/i],
    ['pir', /pir|motion|intruder/i], ['ldr', /ldr|light.*sens|brightness/i], ['gas', /gas|smoke|mq/i],
    ['soil', /soil|moisture|plant|water/i], ['mpu6050', /imu|accel|gyro|tilt|mpu/i], ['ir', /\bir\b|obstacle/i],
    ['rfid', /rfid|nfc|card|badge/i], ['servo', /servo/i], ['dcmotor', /dc.*motor|fan|motor(?!.*step)/i],
    ['stepper', /stepper/i], ['relay', /relay|pump|appliance|mains/i], ['lcd', /\blcd\b|16x2|display.*text/i],
    ['oled', /oled|ssd1306|screen/i], ['seg7', /7.?seg|seven.*seg|digit/i], ['matrix', /matrix|8x8/i],

  ];

  function init(root) {
    root.innerHTML = `
      <div class="chat-log" id="chat-log"></div>
      <div class="chat-suggests" id="chat-suggests"></div>
      <div class="chat-input-row">
        <input id="chat-in" placeholder='Try: "build a plant watering system"…' autocomplete="off">
        <button class="btn primary sm" id="chat-send">Send</button>
      </div>`;
    log = root.querySelector('#chat-log');
    suggestRow = root.querySelector('#chat-suggests');
    const send = () => { const v = root.querySelector('#chat-in').value.trim(); if (v) { root.querySelector('#chat-in').value = ''; ask(v); } };
    root.querySelector('#chat-send').addEventListener('click', send);
    root.querySelector('#chat-in').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    const sugg = ['build a plant watering system', 'make a burglar alarm', 'debug my code', 'explain my wiring', 'what does each part need?', 'what should I build?'];
    suggestRow.innerHTML = sugg.map(s => `<button>${s}</button>`).join('');
    suggestRow.querySelectorAll('button').forEach(b => b.addEventListener('click', () => ask(b.textContent)));
    botSay("👋 Hi! I'm **Forge**, your circuit copilot (fully offline — your privacy stays intact). I can:\n\n• **Generate a starter circuit** — try *\"build a plant watering system\"*\n• **Debug your code & wiring** — try *\"debug my code\"*\n• **Explain your wiring** in plain English\n• **List each component's power, ground and signal needs**");
  }

  function addMsg(cls, html, actions) {
    const m = document.createElement('div');
    m.className = 'chat-msg ' + cls;
    m.innerHTML = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    if (actions && actions.length) {
      const row = document.createElement('div'); row.className = 'msg-act';
      actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn ghost sm'; b.textContent = a.label; b.addEventListener('click', a.fn); row.appendChild(b); });
      m.appendChild(row);
    }
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }
  const meSay = t => addMsg('me', CS.esc(t));
  const botSay = (t, actions) => addMsg('ai', CS.esc(t).replace(/\n/g, '<br>'), actions);
  const botHtml = (h, actions) => addMsg('ai', h, actions);

  function typing(fn, ms) {
    const t = addMsg('ai', '<span class="typing"><i></i><i></i><i></i></span>');
    setTimeout(() => { t.remove(); fn(); }, ms || 650);
  }

  /* ---------- intent router ---------- */
  function ask(text) {
    meSay(text);
    typing(() => respond(text));
  }
  function respond(text) {
    const t = text.toLowerCase();
    if (/^(hi|hey|hello|yo|sup)\b/.test(t)) return botSay("Hello, maker! 🔧 Describe a project (*\"build a ...\"*), drop in a question, or ask me to **debug** your current circuit.");
    if (/cost|price|₹|\$|buy|shop|budget|what.*need|requirements|power.*need/.test(t)) return needsAnswer();
    if (/debug|error|broken|fix|wrong|not work|help me|check|lint|firmware|problem/.test(t)) return debugAnswer();
    if (/explain|wiring|wired|guide|connected|connections/.test(t)) return wiringAnswer();
    if (/what.*build|idea|suggest.*project|bored/.test(t)) return ideasAnswer();
    if (/build|make|create|generate|design|wire up|circuit for|start/.test(t)) return buildAnswer(text);
    if (/led|sensor|servo|motor|switch|arduino|esp32|raspberry/.test(t) && /how|what|use|connect/.test(t)) return componentHelp(text);
    if (/thank/.test(t)) return botSay("Anytime! Happy hacking ⚡");
    // fallback: keyword part scan → offer generator
    const parts = PART_KEYWORDS.filter(([, re]) => re.test(text));
    if (parts.length) return buildAnswer(text);
    return botSay("I'm best at:\n• *\"build a <project>\"* — I'll lay out components, wire them and write starter code\n• *\"debug my code\"* — lint circuit + sketch\n• *\"explain my wiring\"* — plain-English netlist\n• *\"what does each part need?\"* — power/ground/signal checklist\n\nDescribe your project and I'll take it from there.");
  }

  /* ---------- template match + generic generator ---------- */
  function ideasAnswer() {
    const picks = CS.templates.slice(0, 6).map(t => ({ label: t.icon + ' ' + t.name, fn: () => { CS.app.applyTemplate(t.id); botSay(`Loaded **${t.name}** onto your canvas. Press ▶ to run it!`); } }));
    botSay("Here are some fun builds — tap one to load it:", picks);
  }
  function buildAnswer(text) {
    // 1) direct template match on the whole phrase
    const t = text.toLowerCase();
    if (/plant|water/.test(t)) return offer('plant', 'Plant watering system', text);
    if (/doorbell|door bell/.test(t)) return offer('doorbell', 'Smart doorbell', text);
    if (/weather|temperature.*station/.test(t)) return offer('weather', 'Weather station', text);
    if (/traffic/.test(t)) return offer('traffic', 'Traffic light', text);
    if (/alarm|security|burglar|intruder/.test(t)) return offer('alarm', 'Motion alarm', text);
    if (/tilt|level|bubble/.test(t)) return offer('tilt', 'Tilt bubble', text);
    if (/blink|first|simple|begin/.test(t)) return offer('blink', 'Blink LED', text);
    if (/servo/.test(t) && !/with/.test(t)) return offer('servo', 'Servo sweep', text);

    // 2) generic generator from mentioned parts
    const parts = PART_KEYWORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
    if (!parts.length) return botSay("I know quite a few recipes — try **plant watering**, **burglar alarm**, **weather station**, **smart doorbell**, **traffic light**, or mention parts like *LED + button + buzzer* and I'll assemble them.");
    const plan = generate('uno', [...new Set(parts)]);
    botSay(`I've designed a starter build with: **${plan.components.map(c => CS.defs[c.type].name).join(', ')}**.\n\n${plan.summary}\n\nWant it on your canvas?`,
      [{ label: '⚡ Insert this circuit', fn: () => { CS.app.insertGenerated(plan); botSay("Done! Circuit placed and wired, starter code is in the editor. Press ▶ and tweak away. Check the **Wiring Guide** tab for the plain-English netlist."); } }, { label: '👀 Preview code first', fn: () => botSay('```\n' + plan.code + '\n```') }]);
  }
  function offer(tplId, name, text) {
    botSay(`**${name}** — perfect! I have a full recipe: components + wiring + code.\n\nShall I load it?`, [
      { label: '⚡ Load ' + name, fn: () => { CS.app.applyTemplate(tplId); botSay("Loaded! Press ▶ to simulate, and peek at the **Wiring Guide** to see every connection in plain English."); } }
    ]);
  }

  /* ---------- generator ---------- */
  function generate(boardType, partIds) {
    const esp = boardType === 'esp32';
    const pins9 = esp ? ['25', '26', '27', '14', '12', '13', '2', '4'] : ['D9', 'D10', 'D11', 'D12', 'D13', 'D8', 'D7', 'D6'];
    const pinsD = esp ? ['13', '14', '27', '26', '25', '33', '19', '18'] : ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];
    const pinsA = esp ? ['34', '35', '32', '36'] : ['A0', 'A1', 'A2', 'A3'];
    const codePin = id => /^D/.test(id) ? +id.slice(1) : /^A/.test(id) ? id : +id;
    let dp = 0, ap = 0, pp = 0;
    const comps = [], wires = [], codeSetup = [], codeLoop = [], decls = [];
    const board = mk(boardType, 60, 120); comps.push(board);
    const G = '#4ade80', R = '#f87171', GR = '#94a3b8', Y = '#fbbf24';
    const powerPin = esp ? '3V3' : '5V';
    const gndPin = esp ? 'GND' : 'GND';
    let x = 400, y = 60;
    const place = (type, props, label) => { const c = mk(type, x, y, props || {}, label); comps.push(c); y += 130; if (y > 560) { y = 60; x += 260; } return c; };
    const wire = (a, ap2, b, bp, col) => wires.push({ id: mkId(), a: { c: a.id, p: ap2 }, b: { c: b.id, p: bp }, color: col });

    const summary = [];
    for (const pid of partIds) {
      if (pid === 'led' || pid === 'ledrgb') {
        if (pid === 'ledrgb') {
          const c = place('ledrgb');
          ['R', 'G', 'B'].forEach((chan, i) => {
            const res = place('resistor', { value: 220 });
            const pin = pp < pins9.length ? pins9[pp++] : pins9[pp - 1];
            wire(board, pin, res, '1', G); wire(res, '2', c, chan, G);
          });
          wire(c, 'C', board, gndPin, GR);
          decls.push(`int rgbPins[3] = {${codePin(pins9[pp - 3])}, ${codePin(pins9[pp - 2])}, ${codePin(pins9[pp - 1])}};`);
          codeSetup.push('for (int i = 0; i < 3; i++) pinMode(rgbPins[i], OUTPUT);');
          codeLoop.push('analogWrite(rgbPins[0], 200); analogWrite(rgbPins[1], 60); analogWrite(rgbPins[2], 120);');
          summary.push('RGB LED on PWM pins via 220 Ω resistors');
        } else {
          const c = place('led');
          const res = place('resistor', { value: 220 });
          const pin = pp < pins9.length ? pins9[pp++] : 'D13';
          wire(board, pin, res, '1', G); wire(res, '2', c, 'anode', G); wire(c, 'cathode', board, gndPin, GR);
          decls.push(`int ledPin = ${codePin(pin)};`);
          codeSetup.push('pinMode(ledPin, OUTPUT);');
          codeLoop.push('digitalWrite(ledPin, HIGH); delay(400);\n  digitalWrite(ledPin, LOW); delay(400);');
          summary.push('LED with a 220 Ω series resistor (safety first)');
        }
      } else if (pid === 'buzzer') {
        const c = place('buzzer'); const pin = pp < pins9.length ? pins9[pp++] : pinsD[dp++];
        wire(board, pin, c, '+', G); wire(c, '-', board, gndPin, GR);
        decls.push(`int buzzerPin = ${codePin(pin)};`);
        codeSetup.push('pinMode(buzzerPin, OUTPUT);');
        codeLoop.push('tone(buzzerPin, 880, 200); delay(1000);');
        summary.push('buzzer ready for tone() alerts');
      } else if (pid === 'pushbutton' || pid === 'switch') {
        const c = place(pid); const pin = pinsD[dp++];
        wire(board, pin, c, '1', G); wire(c, '2', board, gndPin, GR);
        decls.push(`int buttonPin = ${codePin(pin)};`);
        codeSetup.push('pinMode(buttonPin, INPUT_PULLUP);');
        codeLoop.push('if (digitalRead(buttonPin) == LOW) Serial.println("pressed!");');
        summary.push('button with INPUT_PULLUP (no resistor needed)');
      } else if (pid === 'dht22') {
        const c = place('dht22'); const pin = pinsD[dp++];
        wire(board, pin, c, 'DATA', G); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push(`DHT dht(${codePin(pin)}, DHT22);`);
        codeLoop.push('Serial.print("Temp: "); Serial.println(dht.readTemperature());');
        summary.push('DHT22 climate sensor');
      } else if (pid === 'ldr' || pid === 'soil' || pid === 'gas' || pid === 'ir') {
        const c = place(pid); const pin = pinsA[ap++];
        wire(board, pin, c, 'AO', Y); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push(`int ${pid}Pin = ${pin};`);
        codeSetup.push(`pinMode(${pid}Pin, INPUT);`);
        codeLoop.push(`Serial.print("${pid}: "); Serial.println(analogRead(${pid}Pin));`);
        summary.push(CS.defs[pid].name + ' (analog)');
      } else if (pid === 'potentiometer' || pid === 'slider') {
        const c = place(pid); const pin = pinsA[ap++];
        if (pid === 'potentiometer') { wire(board, pin, c, '2', Y); wire(board, powerPin, c, '3', R); wire(board, gndPin, c, '1', GR); }
        else { wire(board, pin, c, 'OUT', Y); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR); }
        decls.push(`int knobPin = ${pin};`);
        codeLoop.push('Serial.println(analogRead(knobPin));');
        summary.push('analog control knob');
      } else if (pid === 'ultrasonic') {
        const c = place('ultrasonic', { auto: true }); const t1 = pinsD[dp++], e1 = pinsD[dp++];
        wire(board, t1, c, 'TRIG', G); wire(board, e1, c, 'ECHO', G); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push(`int trigPin = ${codePin(t1)}, echoPin = ${codePin(e1)};`);
        codeSetup.push('pinMode(trigPin, OUTPUT); pinMode(echoPin, INPUT);');
        codeLoop.push('digitalWrite(trigPin, HIGH); delay(1); digitalWrite(trigPin, LOW);\n  int cm = pulseIn(echoPin, HIGH) / 58;\n  Serial.print("distance: "); Serial.println(cm);');
        summary.push('HC-SR04 distance sensor');
      } else if (pid === 'pir') {
        const c = place('pir'); const pin = pinsD[dp++];
        wire(board, pin, c, 'OUT', G); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push(`int pirPin = ${codePin(pin)};`);
        codeSetup.push('pinMode(pirPin, INPUT);');
        codeLoop.push('if (digitalRead(pirPin) == HIGH) Serial.println("motion!");');
        summary.push('PIR motion sensor');
      } else if (pid === 'servo') {
        const c = place('servo'); const pin = pp < pins9.length ? pins9[pp++] : pinsD[dp++];
        wire(board, pin, c, 'SIG', G); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push('Servo myservo;');
        codeSetup.push(`myservo.attach(${codePin(pin)});`);
        codeLoop.push('myservo.write(20); delay(800);\n  myservo.write(160); delay(800);');
        summary.push('SG90 servo');
      } else if (pid === 'relay') {
        const c = place('relay'); const pin = pinsD[dp++];
        wire(board, pin, c, 'IN', G); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push(`int relayPin = ${codePin(pin)};`);
        codeSetup.push('pinMode(relayPin, OUTPUT);');
        codeLoop.push('digitalWrite(relayPin, HIGH); delay(2000);\n  digitalWrite(relayPin, LOW); delay(2000);');
        summary.push('relay for switching big loads (wire your load through COM/NO)');
      } else if (pid === 'lcd') {
        const c = place('lcd');
        const pins = ['RS', 'E', 'D4', 'D5', 'D6', 'D7'];
        const bp = esp ? ['13', '14', '27', '26', '25', '33'] : ['D7', 'D8', 'D9', 'D10', 'D11', 'D12'];
        pins.forEach((p, i) => wire(board, bp[i], c, p, G));
        wire(board, powerPin, c, 'VDD', R); wire(board, powerPin, c, 'A', R); wire(board, gndPin, c, 'VSS', GR); wire(board, gndPin, c, 'RW', GR); wire(board, gndPin, c, 'K', GR); wire(board, gndPin, c, 'VO', GR);
        decls.push(`LiquidCrystal lcd(${bp.map(codePin).join(', ')});`);
        codeSetup.push('lcd.begin(); lcd.print("Hello Forge!");');
        codeLoop.push('lcd.setCursor(0, 1); lcd.print(String(millis() / 1000) + "s   ");');
        summary.push('16×2 LCD dashboard');
      } else if (pid === 'oled' || pid === 'mpu6050') {
        const c = place(pid);
        const sdaPin = esp ? '21' : 'A4', sclPin = esp ? '22' : 'A5';
        wire(board, sdaPin, c, 'SDA', '#22d3ee'); wire(board, sclPin, c, 'SCL', '#c084fc'); wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        if (pid === 'oled') { decls.push(`OLED oled(${esp ? '21, 22' : 'A4, A5'});`); codeSetup.push('oled.begin(); oled.println("Forge ready");'); codeLoop.push(''); summary.push('OLED display on I2C'); }
        else { decls.push('IMU imu;'); codeLoop.push('Serial.println(imu.accelX);'); summary.push('MPU6050 IMU — tilt your real device!'); }
      } else if (pid === 'rfid') {
        const c = place('rfid');
        wire(board, powerPin, c, 'VCC', R); wire(board, gndPin, c, 'GND', GR);
        decls.push('RFID rfid;');
        codeLoop.push('if (rfid.available()) Serial.println(rfid.readUid());');
        summary.push('RFID reader — tap a card on the canvas while simulating');
      }
    }
    const code = `// Generated by Forge AI assistant — customize away!
${decls.join('\n')}

void setup() {
  Serial.begin(9600);
  ${codeSetup.join('\n  ')}
}

void loop() {
  ${codeLoop.filter(Boolean).join('\n  ')}
  delay(200);
}`;
    return { components: comps, wires, code, summary: summary.join('; ') + '.' };
  }
  let gid = 0;
  const mkId = () => 'gen' + (++gid) + '_' + Date.now().toString(36);
  const mk = (type, x, y, props = {}, label = '') => ({ id: mkId(), type, x, y, r: 0, props, label });

  /* ---------- debugger ---------- */
  function debugAnswer() {
    const doc = CS.canvas.getDoc();
    const issues = [];
    const code = CS.editor.getCode();
    const lang = doc.lang || 'cpp';
    // compile check (no side effects)
    const tr = CS.transpile(code, lang === 'py' ? 'py' : 'cpp');
    if (tr.ok && CS.sim) {
      const engineCheck = new CS.Engine();
      engineCheck.doc = { components: doc.components.map(c => Object.assign({ state: {} }, c)) , wires: doc.wires };
      engineCheck.attach(engineCheck.doc);
      const r = engineCheck.compile(code, lang);
      if (r.error) issues.push({ type: 'err', text: `**Syntax error** near line ${r.error.line || '?'}: ${r.error.msg}` });
    }
    // static net scan
    if (lang !== 'py' && /Serial\.(print|println)/.test(code) && !/Serial\.begin/.test(code)) issues.push({ type: 'warn', text: 'You use `Serial.print` but never `Serial.begin(9600)` in setup — add it or the monitor stays silent.' });
    if (/digitalWrite\((\w+)/.test(code)) {
      const m = code.match(/digitalWrite\((\w+)/);
      const pin = m[1];
      if (!new RegExp('pinMode\\(' + pin + ',\\s*OUTPUT').test(code)) issues.push({ type: 'warn', text: `\`digitalWrite(${pin}, …)\` without \`pinMode(${pin}, OUTPUT)\` — the pin defaults to INPUT.` });
    }
    // circuit checks
    const nets = staticNets(doc);
    doc.components.forEach(c => {
      const def = CS.defs[c.type]; if (!def) return;
      const wired = doc.wires.some(w => w.a.c === c.id || w.b.c === c.id);
      if (!wired && !def.mcu && def.type !== 'bb_full' && def.type !== 'bb_half') issues.push({ type: 'warn', text: `**${def.name}** is sitting on the bench with no wires at all.` });
      if (def.mcu && !doc.wires.some(w => w.a.c === c.id || w.b.c === c.id)) issues.push({ type: 'warn', text: `Your **${def.name}** isn't wired to anything yet.` });
      if (c.type === 'led') {
        const aNet = nets.root(c.id + '.anode'), kNet = nets.root(c.id + '.cathode');
        const hasRes = doc.components.some(r => r.type === 'resistor' && [nets.root(r.id + '.1'), nets.root(r.id + '.2')].some(n => n === aNet || n === kNet));
        if (!hasRes && wired) issues.push({ type: 'err', text: `**LED"${c.label || ''}"** has no series resistor — real hardware would fry it. Drop a ~220 Ω resistor in series.` });
      }
      if (['dht22', 'ldr', 'soil', 'gas', 'pir', 'ultrasonic', 'servo', 'relay', 'oled', 'mpu6050', 'ir'].includes(c.type)) {
        const vccWired = doc.wires.some(w => (w.a.c === c.id && (w.a.p === 'VCC' || w.a.p === 'VDD')) || (w.b.c === c.id && (w.b.p === 'VCC' || w.b.p === 'VDD')));
        if (!vccWired) issues.push({ type: 'err', text: `**${def.name}**: VCC pin isn't wired — sensors can't run on hopes and dreams.` });
      }
    });
    if (!doc.components.some(c => CS.defs[c.type] && CS.defs[c.type].mcu)) issues.push({ type: 'err', text: 'No microcontroller on the canvas — add a board first (Arduino Uno, ESP32, …).' });
    if (!doc.wires.length && doc.components.length > 1) issues.push({ type: 'warn', text: 'No wires yet. Click any pin and drag to another pin to connect them.' });
    if (!issues.length) {
      return botSay("✅ I scanned code + wiring: **no problems found**. Nice work! If behavior still looks off, tell me what you *expect* vs what you *see*.", [{ label: '▶ Run simulation', fn: () => CS.app.runSim() }]);
    }
    const errs = issues.filter(i => i.type === 'err').length;
    botHtml(`Found <b>${issues.length}</b> issue${issues.length > 1 ? 's' : ''} (${errs} critical):<br><br>` + issues.map(i => `${i.type === 'err' ? '🔴' : '🟡'} ${i.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')}`).join('<br><br>'));
  }
  function staticNets(doc) {
    const parent = new Map();
    const find = x => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
    const union = (a, b) => parent.set(find(b), find(a));
    doc.wires.forEach(w => union(w.a.c + '.' + w.a.p, w.b.c + '.' + w.b.p));
    doc.components.forEach(c => { const d = CS.defs[c.type]; if (d && d.links) (typeof d.links === 'function' ? d.links() : d.links).forEach(([a, b]) => union(c.id + '.' + a, c.id + '.' + b)); });
    return { root: find };
  }

  /* ---------- wiring explainer ---------- */
  function wiringAnswer() {
    const doc = CS.canvas.getDoc();
    if (!doc.wires.length) return botSay("There are no wires yet — click a pin and drag to another pin. I'll narrate every connection in the **Wiring Guide** tab as you build.");
    const lines = CS.wiringGuide(doc).slice(0, 14).map(g => `• ${g.text}`);
    botSay("Here's your circuit in plain English:\n\n" + lines.join('\n') + (doc.wires.length > 14 ? `\n… plus ${doc.wires.length - 14} more — see the Wiring Guide tab.` : ''), [{ label: '📖 Open Wiring Guide', fn: () => CS.app.showDock('guide') }]);
  }

  /* ---------- component needs checklist ---------- */
  function pinNeedText(def) {
    const pins = def.pins || [];
    const byKind = k => pins.filter(p => (p.kind || '').split(' ')[0] === k).map(p => '`' + p.id + '`');
    const power = byKind('power');
    const ground = byKind('ground');
    const signals = pins.filter(p => !['power', 'ground', 'special'].includes((p.kind || '').split(' ')[0])).map(p => '`' + p.id + '` (' + (p.kind || 'signal').split(' ')[0] + ')');
    const bits = [];
    if (power.length) bits.push('power: ' + power.join(', '));
    if (ground.length) bits.push('ground: ' + ground.join(', '));
    if (signals.length) bits.push('signals: ' + signals.slice(0, 8).join(', ') + (signals.length > 8 ? ', …' : ''));
    if (!bits.length && def.breadboard) bits.push('internal strips bridge holes a–e, f–j, and each rail horizontally');
    return bits.join('; ') || 'passive pins only; wire it in series or into a net as needed';
  }
  function needsAnswer() {
    const doc = CS.canvas.getDoc();
    if (!doc.components.length) return botSay("The bench is empty — add a few components and I'll list the power, ground and signal connections they need.");
    const counts = {};
    doc.components.forEach(c => counts[c.type] = (counts[c.type] || 0) + 1);
    const rows = Object.entries(counts).map(([t, n]) => {
      const d = CS.defs[t];
      return `${d.icon} **${d.name}** × ${n} — ${pinNeedText(d)}`;
    });
    botSay("Here's what your current parts need to function:\n\n" + rows.join('\n') + "\n\nTip: open the **Wiring Guide** after connecting pins to verify each net.", [{ label: '📖 Open Wiring Guide', fn: () => CS.app.showDock('guide') }]);
  }


  function componentHelp(text) {
    const part = PART_KEYWORDS.find(([, re]) => re.test(text));
    if (!part) return botSay("Which component? I know LEDs, buttons, servos, sensors, displays…");
    const def = CS.defs[part[0]];
    botSay(`**${def.name}** ${def.icon}\n\n${def.desc}\n\nPins: ${def.pins.map(p => `\`${p.id}\` (${(p.kind || '').split(' ')[0]})`).join(', ')}\n\nNeeds: ${pinNeedText(def)}`, [
      { label: '➕ Add to canvas', fn: () => { const v = CS.canvas.view; const r = CS.canvas.svg.getBoundingClientRect(); CS.canvas.addComponent(part[0], (r.width / 2 - v.x) / v.z, (r.height / 2 - v.y) / v.z); } }
    ]);
  }

  CS.assistant = { init, ask };
  CS.staticNets = staticNets;
})();
