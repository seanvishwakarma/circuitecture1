/* CircuitTecture — code editor.
   Uses Monaco Editor when the browser can load it; keeps a zero-dependency
   textarea fallback for offline/sandboxed previews. Public API is unchanged:
   getCode/setCode/setLang, breakpoints, setExecLine, setError/diagnostics. */
(function () {
  const CS = window.CS;

  const CPP = {
    kw: 'if|else|for|while|do|switch|case|default|break|continue|return|const|static|struct|enum|class|true|false|sizeof|typedef|using|namespace|public|private|new|delete|goto|volatile',
    ty: 'void|int|long|short|float|double|boolean|bool|byte|char|String|unsigned|signed|word|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t',
    bi: 'setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|millis|micros|map|constrain|random|randomSeed|tone|noTone|pulseIn|attachInterrupt|detachInterrupt|digitalPinToInterrupt|Serial|Servo|LiquidCrystal|DHT|OLED|MATRIX|LedMatrix|GPS|Camera|IMU|Stepper|RFID|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|A0|A1|A2|A3|A4|A5|A6|A7|LED_BUILTIN|DHT22|DHT11|RISING|FALLING|CHANGE|WIFI_STA'
  };
  const PY = {
    kw: 'def|for|while|if|elif|else|return|import|from|as|True|False|None|and|or|not|in|is|break|continue|pass|try|except|finally|global|class|with|lambda|yield|raise',
    ty: '',
    bi: 'print|Pin|ADC|PWM|time|sleep|sleep_ms|sleep_us|range|len|int|float|str|GPIO|machine|utime|value|read|duty|freq'
  };

  const API = [
    ['pinMode(pin, mode)', 'Configure a GPIO pin as INPUT, INPUT_PULLUP, or OUTPUT.', 'pinMode(${1:13}, ${2:OUTPUT});'],
    ['digitalWrite(pin, value)', 'Drive a digital pin HIGH or LOW.', 'digitalWrite(${1:13}, ${2:HIGH});'],
    ['digitalRead(pin)', 'Read HIGH/LOW from a digital pin.', 'digitalRead(${1:2})'],
    ['analogRead(pin)', 'Read an analog input. Arduino returns 0..1023; ESP32/Pico return scaled values in the simulator.', 'analogRead(${1:A0})'],
    ['analogWrite(pin, value)', 'Output PWM/duty value. Use PWM-capable pins on Arduino.', 'analogWrite(${1:9}, ${2:128});'],
    ['delay(ms)', 'Pause the current sketch for the given milliseconds.', 'delay(${1:1000});'],
    ['delayMicroseconds(us)', 'Pause for a small number of microseconds.', 'delayMicroseconds(${1:10});'],
    ['millis()', 'Milliseconds since simulation start.', 'millis()'],
    ['micros()', 'Microseconds since simulation start.', 'micros()'],
    ['Serial.begin(baud)', 'Start the serial monitor stream.', 'Serial.begin(${1:9600});'],
    ['Serial.print(value)', 'Write text/value without a newline.', 'Serial.print(${1:value});'],
    ['Serial.println(value)', 'Write text/value followed by a newline.', 'Serial.println(${1:value});'],
    ['tone(pin, frequency)', 'Play a square wave on buzzer/speaker pins.', 'tone(${1:8}, ${2:440});'],
    ['noTone(pin)', 'Stop tone output on a pin.', 'noTone(${1:8});'],
    ['pulseIn(pin, value)', 'Measure pulse duration from sensors such as HC-SR04 echo.', 'pulseIn(${1:7}, ${2:HIGH})'],
    ['Servo.attach(pin)', 'Attach a Servo object to a pin.', 'servo.attach(${1:9});'],
    ['Servo.write(angle)', 'Set servo angle 0..180 degrees.', 'servo.write(${1:90});'],
    ['DHT.readTemperature()', 'Read DHT temperature in °C.', 'dht.readTemperature()'],
    ['DHT.readHumidity()', 'Read DHT relative humidity.', 'dht.readHumidity()'],
    ['OLED.println(text)', 'Print a line on the simulated OLED.', 'oled.println(${1:"Hello"});'],

  ];
  const PY_API = [
    ['Pin(id, mode)', 'Create/configure a MicroPython GPIO pin.', 'Pin(${1:2}, Pin.${2:OUT})'],
    ['pin.value(v)', 'Read or write a digital pin value.', '${1:pin}.value(${2:1})'],
    ['ADC(pin).read()', 'Read analog input.', 'ADC(Pin(${1:34})).read()'],
    ['PWM(pin).duty(v)', 'Set PWM duty.', '${1:pwm}.duty(${2:512})'],
    ['time.sleep(seconds)', 'Delay in seconds.', 'time.sleep(${1:1})'],
    ['time.sleep_ms(ms)', 'Delay in milliseconds.', 'time.sleep_ms(${1:500})'],
    ['print(value)', 'Write to the serial monitor.', 'print(${1:"hello"})']
  ];

  function highlightLine(line, lang) {
    const L = lang === 'py' ? PY : CPP;
    const esc = CS.esc(line);
    let rest = esc, comment = '';
    const ci = lang === 'py' ? esc.indexOf('#') : esc.indexOf('//');
    if (ci >= 0) { comment = `<span class="tok-com">${rest.slice(ci)}</span>`; rest = rest.slice(0, ci); }
    // Highlight words first (before inserting HTML from number/string replacements)
    // so word-boundary regex does not match keywords like `class` inside HTML attribute values.
    const wordRe = new RegExp('\\b(' + L.kw + (L.ty ? '|' + L.ty : '') + '|' + L.bi + ')\\b', 'g');
    rest = rest.replace(wordRe, m => {
      if (new RegExp('^(' + L.kw + ')$').test(m)) return `<span class="tok-kw">${m}</span>`;
      if (L.ty && new RegExp('^(' + L.ty + ')$').test(m)) return `<span class="tok-ty">${m}</span>`;
      return `<span class="tok-bi">${m}</span>`;
    });
    rest = rest.replace(/\b(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+\.?\d*[fLuU]*)\b/g, '<span class="tok-num">$1</span>');
    rest = rest.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`[^`]*`)/g, '<span class="tok-str">$1</span>');
    return (lang !== 'py' && /^\s*#/.test(line) ? `<span class="tok-pre">${rest}</span>` : rest) + comment || '&nbsp;';
  }

  let monacoLoader = null;
  function loadMonaco() {
    if (window.monaco && window.monaco.editor) return Promise.resolve(window.monaco);
    if (monacoLoader) return monacoLoader;
    monacoLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-monaco-loader]');
      const done = () => {
        try {
          window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs' } });
          window.require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
        } catch (e) { reject(e); }
      };
      if (window.require && window.require.config) return done();
      const s = existing || document.createElement('script');
      s.setAttribute('data-monaco-loader', '1');
      s.src = s.src || 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs/loader.min.js';
      s.onload = done;
      s.onerror = () => reject(new Error('Monaco failed to load'));
      if (!existing) document.head.appendChild(s);
    });
    return monacoLoader;
  }
  let completionsInstalled = false;
  function installMonacoLanguageProviders(monaco) {
    if (completionsInstalled) return;
    completionsInstalled = true;
    const makeItems = (list, range) => list.map(([label, doc, insert]) => {
      const name = label.split('(')[0].replace(/\.$/, '');
      return { label: name, kind: monaco.languages.CompletionItemKind.Function, insertText: insert || name, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: label, documentation: doc, range };
    });
    monaco.languages.registerCompletionItemProvider('cpp', {
      triggerCharacters: ['.', '(', 'S'],
      provideCompletionItems(model, pos) {
        const word = model.getWordUntilPosition(pos);
        const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
        return { suggestions: makeItems(API, range).concat(['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN'].map(x => ({ label: x, kind: monaco.languages.CompletionItemKind.Constant, insertText: x, range }))) };
      }
    });
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', '('],
      provideCompletionItems(model, pos) {
        const word = model.getWordUntilPosition(pos);
        const range = new monaco.Range(pos.lineNumber, word.startColumn, pos.lineNumber, word.endColumn);
        return { suggestions: makeItems(PY_API, range).concat(['Pin.OUT', 'Pin.IN', 'Pin.PULL_UP', 'True', 'False'].map(x => ({ label: x, kind: monaco.languages.CompletionItemKind.Constant, insertText: x, range }))) };
      }
    });
    const hoverDocs = new Map(API.concat(PY_API).map(([sig, doc]) => [sig.split('(')[0].replace(/\.$/, ''), { sig, doc }]));
    ['cpp', 'python'].forEach(lang => monaco.languages.registerHoverProvider(lang, {
      provideHover(model, pos) {
        const w = model.getWordAtPosition(pos); if (!w) return null;
        const h = hoverDocs.get(w.word); if (!h) return null;
        return { range: new monaco.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn), contents: [{ value: '`' + h.sig + '`' }, { value: h.doc }] };
      }
    }));
  }

  class CodeEditor {
    constructor(root) {
      this.root = root;
      this.lang = 'cpp';
      this.breakpoints = new Set();
      this.execLine = 0;
      this.errLine = 0; this.errMsg = '';
      this.problems = [];
      this.fontSize = 13;
      this.theme = localStorage.getItem('ct-code-theme') || 'vs-dark';
      this.onChange = () => { };
      this.onProblemsChange = () => { };
      this._suppress = false;
      this._bpDecor = []; this._execDecor = []; this._errDecor = [];
      this.initFallback();
      this.tryMonacoUpgrade();
    }

    /* ---------- shared public API ---------- */
    languageId() { return this.lang === 'py' ? 'python' : 'cpp'; }
    getCode() { return this.monacoEditor ? this.monacoModel.getValue() : this.ta.value; }
    setCode(v) {
      v = v || '';
      if (this.monacoEditor) { this._suppress = true; this.monacoModel.setValue(v); this._suppress = false; }
      else this.ta.value = v;
      this.refresh();
    }
    setLang(l) {
      this.lang = l === 'py' ? 'py' : 'cpp';
      if (this.monacoEditor && window.monaco) window.monaco.editor.setModelLanguage(this.monacoModel, this.languageId());
      this.refresh(); this.closeAC();
    }
    setTheme(theme) {
      this.theme = theme || 'vs-dark';
      if (this.monacoEditor && window.monaco) window.monaco.editor.setTheme(this.theme);
      this.root.dataset.editorTheme = this.theme;
    }
    setFontSize(n) {
      this.fontSize = Math.max(10, Math.min(28, +n || 13));
      if (this.monacoEditor) this.monacoEditor.updateOptions({ fontSize: this.fontSize });
      this.root.style.fontSize = this.fontSize + 'px';
    }
    setExecLine(n) {
      this.execLine = n || 0;
      if (this.monacoEditor) this.paintExec(); else { this.refresh(); this.scrollExecIntoView(); }
    }
    setError(line, msg) {
      this.errLine = line || 0; this.errMsg = msg || '';
      this.setDiagnostics(this.errLine && this.errMsg ? [{ line: this.errLine, message: this.errMsg, severity: 'error' }] : []);
    }
    setDiagnostics(items) {
      this.problems = (items || []).map(i => ({ line: i.line || 1, col: i.col || 1, message: i.message || i.msg || '', severity: i.severity || (i.level === 'warn' ? 'warning' : 'error') }));
      if (this.monacoEditor && window.monaco) {
        const M = window.monaco;
        M.editor.setModelMarkers(this.monacoModel, 'circuittecture', this.problems.map(p => ({
          startLineNumber: p.line, startColumn: p.col || 1, endLineNumber: p.line, endColumn: 200,
          message: p.message, severity: p.severity === 'warning' ? M.MarkerSeverity.Warning : M.MarkerSeverity.Error
        })));
        const errs = this.problems.filter(p => p.severity === 'error');
        this._errDecor = this.monacoEditor.deltaDecorations(this._errDecor, errs.map(p => ({
          range: new M.Range(p.line, 1, p.line, 1),
          options: {
            isWholeLine: true,
            className: 'cf-error-line',
            glyphMarginClassName: 'cf-error-glyph',
            glyphMarginHoverMessage: { value: p.message }
          }
        })));
      } else {
        const first = this.problems.find(p => p.severity !== 'warning') || this.problems[0];
        this.errLine = first ? first.line : 0; this.errMsg = first ? first.message : '';
        this.refresh();
      }
      this.onProblemsChange(this.problems);
    }
    revealLine(n) {
      if (!n) return;
      if (this.monacoEditor) { this.monacoEditor.revealLineInCenter(n); this.monacoEditor.setPosition({ lineNumber: n, column: 1 }); this.monacoEditor.focus(); }
      else { this.scroll.scrollTop = Math.max(0, (n - 1) * 20 - 60); this.ta.focus(); }
    }

    /* ---------- Monaco ---------- */
    tryMonacoUpgrade() {
      loadMonaco().then(monaco => {
        if (!this.root.isConnected) return;
        installMonacoLanguageProviders(monaco);
        const code = this.getCode();
        this.disposeFallback();
        this.root.innerHTML = '<div class="monaco-host"></div>';
        this.monacoModel = monaco.editor.createModel(code, this.languageId());
        this.monacoEditor = monaco.editor.create(this.root.querySelector('.monaco-host'), {
          model: this.monacoModel,
          theme: this.theme,
          fontSize: this.fontSize,
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'ui-monospace, Menlo, Consolas, monospace',
          minimap: { enabled: true, scale: 0.65, renderCharacters: false },
          automaticLayout: true,
          glyphMargin: true,
          folding: true,
          find: { addExtraSpaceOnTop: false },
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          multiCursorModifier: 'ctrlCmd',
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'off'
        });
        this.monacoEditor.onDidChangeModelContent(() => { if (!this._suppress) this.onChange(); });
        this.monacoEditor.onMouseDown(e => {
          const T = monaco.editor.MouseTargetType;
          if (e.target && e.target.position && (e.target.type === T.GUTTER_GLYPH_MARGIN || e.target.type === T.GUTTER_LINE_NUMBERS)) {
            const n = e.target.position.lineNumber;
            this.breakpoints.has(n) ? this.breakpoints.delete(n) : this.breakpoints.add(n);
            this.paintBreakpoints(); CS.bus.emit('breakpoints', [...this.breakpoints]);
          }
        });
        this.paintBreakpoints(); this.paintExec(); this.setDiagnostics(this.problems);
        this.root.classList.add('monaco-ready');
      }).catch(() => {
        this.root.classList.add('monaco-fallback');
      });
    }
    paintBreakpoints() {
      if (!this.monacoEditor || !window.monaco) return;
      const M = window.monaco;
      this._bpDecor = this.monacoEditor.deltaDecorations(this._bpDecor, [...this.breakpoints].map(n => ({
        range: new M.Range(n, 1, n, 1),
        options: { glyphMarginClassName: 'cf-breakpoint', glyphMarginHoverMessage: { value: 'Breakpoint' } }
      })));
    }
    paintExec() {
      if (!this.monacoEditor || !window.monaco) return;
      const M = window.monaco;
      this._execDecor = this.monacoEditor.deltaDecorations(this._execDecor, this.execLine ? [{
        range: new M.Range(this.execLine, 1, this.execLine, 1),
        options: { isWholeLine: true, className: 'cf-exec-line', glyphMarginClassName: 'cf-exec-glyph' }
      }] : []);
      if (this.execLine) this.monacoEditor.revealLineInCenterIfOutsideViewport(this.execLine);
    }

    /* ---------- fallback editor ---------- */
    initFallback() {
      this.root.innerHTML = `<div class="ce-gutter"></div><div class="ce-scroll"><pre class="ce-pre"></pre><textarea class="ce-ta" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div>`;
      this.gutter = this.root.querySelector('.ce-gutter');
      this.scroll = this.root.querySelector('.ce-scroll');
      this.pre = this.root.querySelector('.ce-pre');
      this.ta = this.root.querySelector('.ce-ta');
      this.ac = null;
      this.bindFallback();
      this.setFontSize(this.fontSize);
      this.setCode('');
    }
    disposeFallback() { if (this.ac) this.ac.remove(); this.ac = null; }
    bindFallback() {
      const ta = this.ta;
      ta.addEventListener('input', () => { this.refresh(); this.onChange(); this.acTick(); });
      ta.addEventListener('scroll', () => this.syncScroll());
      ta.addEventListener('keydown', e => {
        if (this.ac && !this.ac.hidden) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.acMove(e.key === 'ArrowDown' ? 1 : -1); return; }
          if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); this.acAccept(); return; }
          if (e.key === 'Escape') { this.closeAC(); return; }
        }
        if (e.key === 'Tab') { e.preventDefault(); this.insert('  '); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          const pos = ta.selectionStart;
          const lineStart = ta.value.lastIndexOf('\n', pos - 1) + 1;
          const indent = (ta.value.slice(lineStart, pos).match(/^\s*/) || [''])[0];
          const extra = this.lang === 'py' && /:\s*($|#)/.test(ta.value.slice(lineStart, pos)) ? '    ' : (this.lang === 'cpp' && /[{]\s*$/.test(ta.value.slice(lineStart, pos)) ? '  ' : '');
          this.insert('\n' + indent + extra);
        }
        else if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.openAC(true); }
      });
      ta.addEventListener('keyup', e => { if (/^[\w)$.;]$/.test(e.key) === false) this.closeLater(); });
      ta.addEventListener('click', () => this.closeAC());
      this.gutter.addEventListener('click', e => {
        const ln = e.target.closest('.g-ln'); if (!ln) return;
        const n = +ln.getAttribute('data-ln');
        this.breakpoints.has(n) ? this.breakpoints.delete(n) : this.breakpoints.add(n);
        this.paintGutter(); CS.bus.emit('breakpoints', [...this.breakpoints]);
      });
      this.syncScroll();
    }
    closeLater() { setTimeout(() => this.closeAC(), 120); }
    insert(text) {
      const ta = this.ta, s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
      ta.selectionStart = ta.selectionEnd = s + text.length;
      this.refresh(); this.onChange();
    }
    syncScroll() { if (this.gutter) this.gutter.style.transform = `translateY(${-this.scroll.scrollTop + 8}px)`; }
    lines() { return this.getCode().split('\n'); }
    refresh() {
      if (this.monacoEditor) { this.paintBreakpoints(); this.paintExec(); return; }
      const lines = this.lines();
      let html = '', gh = '';
      lines.forEach((ln, i) => {
        const n = i + 1;
        const cls = n === this.execLine ? ' exec' : n === this.errLine ? ' errl' : '';
        html += `<span class="ln${cls}" title="${n === this.errLine ? CS.esc(this.errMsg) : ''}">${highlightLine(ln, this.lang)}</span>`;
        gh += `<div class="g-ln${cls}${this.breakpoints.has(n) ? ' has-bp' : ''}" data-ln="${n}">${this.breakpoints.has(n) ? '<span class="bp"></span>' : ''}${n}</div>`;
      });
      this.pre.innerHTML = html;
      this.gutter.innerHTML = gh;
      this.syncScroll();
    }
    paintGutter() { if (this.monacoEditor) this.paintBreakpoints(); else this.refresh(); }
    scrollExecIntoView() {
      if (!this.execLine) return;
      const y = (this.execLine - 1) * 20 + 8;
      if (y < this.scroll.scrollTop || y > this.scroll.scrollTop + this.scroll.clientHeight - 60) this.scroll.scrollTop = Math.max(0, y - 100);
    }
    currentWord() {
      const pos = this.ta.selectionStart;
      const left = this.ta.value.slice(0, pos);
      const m = left.match(/[A-Za-z_#][\w~.]*$/);
      return m ? m[0] : '';
    }
    words() {
      const src = this.ta.value;
      const idents = new Set((src.match(/\b[A-Za-z_]\w{2,}\b/g) || []));
      const base = (this.lang === 'py' ? (PY.kw + '|' + PY.bi) : (CPP.kw + '|' + CPP.ty + '|' + CPP.bi)).split('|');
      const api = (this.lang === 'py' ? PY_API : API).map(x => x[0].split('(')[0]);
      return [...new Set([...base, ...api, ...idents])].sort();
    }
    acTick() { if (this.currentWord().length >= 2) this.openAC(false); else this.closeAC(); }
    openAC(explicit) {
      if (this.monacoEditor) { this.monacoEditor.trigger('keyboard', 'editor.action.triggerSuggest', {}); return; }
      const w = this.currentWord();
      const lower = w.toLowerCase();
      const cands = this.words().filter(x => x.toLowerCase().startsWith(lower) && x !== w).slice(0, 12);
      if (!cands.length && !explicit) return this.closeAC();
      if (!cands.length) return;
      if (!this.ac) { this.ac = document.createElement('div'); this.ac.className = 'ce-ac hidden'; this.root.appendChild(this.ac); }
      this.acCands = cands; this.acSel = 0; this.acWord = w;
      this.ac.innerHTML = cands.map((c, i) => `<div class="${i === 0 ? 'sel' : ''}" data-w="${CS.esc(c)}"><span>${CS.esc(c)}</span><span class="ac-hint">${apiDoc(c, this.lang)}</span></div>`).join('');
      const pos = this.ta.selectionStart;
      const before = this.ta.value.slice(0, pos);
      const row = before.split('\n').length - 1;
      const colText = before.split('\n').pop();
      const cx = measureText(colText, this.ta);
      this.ac.style.left = (46 - this.scroll.scrollLeft + 12 + cx) + 'px';
      this.ac.style.top = ((row + 1) * 20 + 8 - this.scroll.scrollTop + 4) + 'px';
      this.ac.classList.remove('hidden'); this.ac.hidden = false;
      this.ac.querySelectorAll('div').forEach(d => d.addEventListener('pointerdown', e => { e.preventDefault(); this.acAccept(d.getAttribute('data-w')); }));
    }
    acMove(d) { this.acSel = (this.acSel + d + this.acCands.length) % this.acCands.length; this.ac.querySelectorAll('div').forEach((el, i) => el.classList.toggle('sel', i === this.acSel)); }
    acAccept(word) {
      const w = word || this.acCands[this.acSel]; if (!w) return;
      const pos = this.ta.selectionStart;
      const cur = this.acWord || this.currentWord();
      this.ta.value = this.ta.value.slice(0, pos - cur.length) + w + this.ta.value.slice(pos);
      this.ta.selectionStart = this.ta.selectionEnd = pos - cur.length + w.length;
      this.refresh(); this.onChange(); this.closeAC();
    }
    closeAC() { if (this.ac) { this.ac.classList.add('hidden'); this.ac.hidden = true; } }
  }

  function apiDoc(word, lang) {
    const list = lang === 'py' ? PY_API : API;
    const item = list.find(([sig]) => sig.split('(')[0] === word || sig.split('(')[0].endsWith('.' + word));
    return item ? item[1].split('.')[0] : '';
  }
  let mctx = null;
  function measureText(s, ta) {
    if (!mctx) { mctx = document.createElement('canvas').getContext('2d'); }
    mctx.font = (getComputedStyle(ta).fontSize || '13px') + ' ' + getComputedStyle(ta).fontFamily;
    return mctx.measureText(s).width;
  }

  CS.CodeEditor = CodeEditor;

  /* ================= Logic Analyzer UI ================= */
  class LogicAnalyzer {
    constructor(container) {
      this.container = container;
      this.active = false;
      this.channels = [];
      this.render();
    }

    render() {
      if (!this.container) return;
      this.container.innerHTML = `
        <div class="analyzer-toolbar flex items-center justify-between p-2 bg-slate-800 text-slate-200 text-xs border-b border-slate-700">
          <div class="flex items-center gap-2">
            <span class="font-semibold">Logic Analyzer</span>
            <span class="badge bg-indigo-600 px-2 py-0.5 rounded text-white text-[10px]">Active Channels: <span id="la-chan-count">0</span></span>
          </div>
          <div class="flex items-center gap-2">
            <button id="la-export-csv" class="btn btn-sm btn-secondary">Export CSV</button>
            <button id="la-clear" class="btn btn-sm btn-ghost">Clear</button>
          </div>
        </div>
        <div class="analyzer-canvas-wrap p-2 bg-slate-900 overflow-x-auto" style="height: 140px;">
          <svg id="la-svg" width="800" height="120" style="background:#0f172a; border-radius:4px;"></svg>
        </div>
      `;

      const btnExport = this.container.querySelector('#la-export-csv');
      if (btnExport) {
        btnExport.addEventListener('click', () => this.exportCSV());
      }
      const btnClear = this.container.querySelector('#la-clear');
      if (btnClear) {
        btnClear.addEventListener('click', () => this.clear());
      }
    }

    update(sim) {
      if (!sim || !sim.samples) return;
      const svg = this.container ? this.container.querySelector('#la-svg') : null;
      if (!svg) return;

      const channels = sim.scopeChannels || [];
      const countEl = this.container.querySelector('#la-chan-count');
      if (countEl) countEl.textContent = channels.length;

      svg.innerHTML = '';
      if (!channels.length) {
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', '20'); txt.setAttribute('y', '60');
        txt.setAttribute('fill', '#64748b'); txt.setAttribute('font-size', '12');
        txt.textContent = 'No scope channels connected. Wire pins to Scope / Logic Analyzer.';
        svg.appendChild(txt);
        return;
      }

      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
      channels.forEach((ch, idx) => {
        const samples = sim.samples.get(ch) || [];
        const yBase = (idx + 1) * 24;
        const color = colors[idx % colors.length];

        // Channel Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '5'); label.setAttribute('y', yBase - 4);
        label.setAttribute('fill', color); label.setAttribute('font-size', '10'); label.setAttribute('font-weight', 'bold');
        label.textContent = `CH${idx}: ${ch}`;
        svg.appendChild(label);

        if (samples.length < 2) return;

        let d = `M0 ${yBase}`;
        const step = 780 / Math.max(1, samples.length);
        samples.forEach((val, i) => {
          const x = i * step;
          const y = yBase - (val ? 14 : 0);
          d += ` H${x} V${y}`;
        });

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
      });
    }

    exportCSV() {
      if (!CS.sim || !CS.sim.samples) return;
      const channels = CS.sim.scopeChannels || [];
      if (!channels.length) return alert('No channels to export.');

      let csv = 'Sample,' + channels.join(',') + '\n';
      const maxSamples = Math.max(...channels.map(c => (CS.sim.samples.get(c) || []).length));

      for (let i = 0; i < maxSamples; i++) {
        const row = [i];
        channels.forEach(ch => {
          const arr = CS.sim.samples.get(ch) || [];
          row.push(arr[i] !== undefined ? arr[i] : '');
        });
        csv += row.join(',') + '\n';
      }

      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'logic_analyzer_export.csv';
      a.click();
    }

    clear() {
      if (CS.sim && CS.sim.samples) CS.sim.samples.clear();
      this.update(CS.sim);
    }
  }

  /* ================= BOM Export ================= */
  function exportBOM(doc) {
    const comps = (doc && doc.components) || [];
    if (!comps.length) return alert('No components on canvas.');

    const summary = new Map();
    comps.forEach(c => {
      const def = CS.defs[c.type] || { name: c.type, category: 'General' };
      const name = c.label || def.name || c.type;
      const key = `${c.type}:${name}`;
      if (!summary.has(key)) {
        summary.set(key, { type: c.type, name, category: def.category || 'General', qty: 0, specs: c.props ? JSON.stringify(c.props) : '-' });
      }
      summary.get(key).qty++;
    });

    let csv = 'Part Type,Name,Category,Quantity,Specs,Buy Link\n';
    for (const [, item] of summary) {
      const buyLink = `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(item.name)}`;
      csv += `"${item.type}","${item.name}","${item.category}",${item.qty},"${item.specs}","${buyLink}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'circuittecture_bom.csv';
    a.click();
  }

  CS.LogicAnalyzer = LogicAnalyzer;
  CS.exportBOM = exportBOM;
})();
