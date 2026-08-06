/* CircuitTecture — source translators.
   Translates Arduino-flavoured C/C++ and a MicroPython subset into JS generator
   functions that the simulation engine drives cooperatively.
   Convention: output keeps EXACTLY the same line count as input (markers are
   prefixed in-place), so editor line numbers, errors and breakpoints align.
   Yields:  {l:n} statement marker · {d:ms} delay · anything else ignored   */
(function () {
  const CS = window.CS;

  /* split a line into code/string/comment segments so we never transform inside strings */
  function segs(line, py) {
    const out = []; let i = 0, cur = '', mode = 0; // mode 0=code 1=" 2=' 3=` or #
    const push = (t, s) => { if (s) out.push([t, s]); };
    while (i < line.length) {
      const ch = line[i];
      if (mode === 0) {
        if (ch === '"' || ch === "'") { push(0, cur); cur = ch; mode = ch === '"' ? 1 : 2; }
        else if (ch === '/' && line[i + 1] === '/' && !py) { push(0, cur); push(4, line.slice(i)); return finish(); }
        else if (ch === '#' && py) { push(0, cur); push(4, line.slice(i)); return finish(); }
        else if (ch === 'f' && py && (line[i + 1] === '"' || line[i + 1] === "'") && !/[\w]/.test(line[i - 1] || '')) { cur += 'f'; }
        else cur += ch;
        i++;
      } else {
        cur += ch;
        if ((mode === 1 && ch === '"') || (mode === 2 && ch === "'")) { if (line[i - 1] !== '\\') { push(mode, cur); cur = ''; mode = 0; } }
        i++;
      }
    }
    function finish() { push(mode === 4 ? 4 : mode, cur); cur = ''; return out; }
    return finish();
  }
  const mapCode = (line, py, fn) => segs(line, py).map(([t, s]) => t === 0 ? fn(s) : s).join('');

  const CPP_TYPES = '(?:unsigned\\s+long\\s+long|unsigned\\s+long|unsigned\\s+int|unsigned\\s+short|unsigned\\s+char|long\\s+long|volatile\\s+\\w+|int|long|short|float|double|boolean|bool|byte|char|String|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|size_t|word|void)';
  const CPP_CLASSES = ['Servo', 'LiquidCrystal', 'LiquidCrystal_I2C', 'DHT', 'OLED', 'SSD1306', 'MATRIX', 'LedMatrix', 'IMU', 'MPU6050', 'MFRC522', 'Stepper', 'RFID', 'Ultrasonic'];

  function detectCppFns(lines) {
    const names = new Set();
    const re = new RegExp('^\\s*(?:static\\s+)?' + CPP_TYPES + '\\s+([A-Za-z_]\\w*)\\s*\\(');
    lines.forEach(l => { const m = l.match(re); if (m && !/;\s*$/.test(l) && !/^#\s*define/.test(l)) names.add(m[1]); });
    return names;
  }

  function rewriteCppCalls(seg, fnNames) {
    for (const name of fnNames) {
      const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
      seg = seg.replace(re, (m, off) => {
        const before = seg.slice(0, off);
        if (/\.\s*$/.test(before)) return m;                       // method call
        if (new RegExp('(function\\*?|' + CPP_TYPES + ')\\s*$').test(before)) return m; // definition
        return 'yield* ' + m;
      });
    }
    return seg;
  }

  function transpileCpp(src) {
    const lines = src.split('\n');
    const fnNames = detectCppFns(lines);
    const out = [];
    let prevSig = ''; // previous significant (non-empty, transformed) raw line
    for (let n = 0; n < lines.length; n++) {
      let line = lines[n];
      // strip F("...") flash-string wrappers before segmentation
      line = line.replace(/\bF\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)/g, '$1');
      const rawTrim = line.trim();
      // preprocessor
      if (/^\s*#\s*include/.test(line)) { out.push('// ' + line.trim().slice(1)); prevSig = line; continue; }
      const dM = line.match(/^\s*#\s*define\s+([A-Za-z_]\w*)(?:\s+(.+))?$/);
      if (dM) { out.push('const ' + dM[1] + ' = ' + (dM[2] !== undefined ? dM[2] : 'true') + ';'); prevSig = line; continue; }
      if (/^\s*#\s*(ifdef|ifndef|endif|if|else|undef|pragma)/.test(line)) { out.push('// ' + line.trim()); prevSig = line; continue; }
      if (rawTrim === '') { out.push(''); continue; }

      // single statement after unbraced control flow → wrap
      const unbracedPrev = (() => {
        const p = prevSig.trim();
        if (!p || p === '{' || p === '}') return false;
        const ctrl = /^(if|else\s+if|for|while|else|do)\b/.test(p) || /\)\s*$/.test(p) && /\b(if|for|while)\s*\(/.test(p) || /^else\b/.test(p);
        return ctrl && !p.endsWith('{') && !p.endsWith(';') && !p.endsWith('}');
      })();

      let t = mapCode(line, false, seg => {
        let s = ' ' + seg; // pad for ^ anchored replaces
        // mid-line defs first: `} void loop() { ...` on the same line
        s = s.replace(new RegExp('([};]\\s*)(' + CPP_TYPES + ')\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{', 'g'),
          (m, pre, ty, nm, args) => {
            const a2 = args.split(',').map(a => a.trim()).filter(Boolean).map(a => a.replace(new RegExp('^(?:const\\s+)?(?:' + CPP_TYPES + ')\\s*[&*]?\\s*'), '').replace(/\[.*?\]/g, '')).join(', ');
            return pre + 'function* ' + nm + '(' + a2 + '){';
          });
        // function definitions (incl. one-liner bodies: `void setup() { ... }`)
        const stripArgs = args => args.split(',').map(a => a.trim()).filter(Boolean).map(a =>
          a.replace(new RegExp('^(?:const\\s+)?(?:' + CPP_TYPES + ')\\s*[&*]?\\s*'), '').replace(/\[.*?\]/g, '')).join(', ');
        const defRe = new RegExp('^(\\s*(?:static\\s+)?)(?:' + CPP_TYPES + ')\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)(\\s*\\{)');
        const dm = s.match(defRe);
        if (dm) s = dm[1] + 'function* ' + dm[2] + '(' + stripArgs(dm[3]) + '){' + s.slice(dm[0].length);
        const defRe2 = new RegExp('^(\\s*(?:static\\s+)?)(?:' + CPP_TYPES + ')\\s+([A-Za-z_]\\w*)\\s*\\(([^)]*)\\)\\s*$');
        const dm2 = s.match(defRe2);
        if (dm2) s = dm2[1] + 'function* ' + dm2[2] + '(' + stripArgs(dm2[3]) + '){';
        // const declarations
        s = s.replace(new RegExp('([\\s;{(]|^)const\\s+(' + CPP_TYPES + ')\\s+'), (m, p1) => p1 + 'const ');
        // class declarations:  Servo x;   LiquidCrystal lcd(1,2);
        s = s.replace(new RegExp('([\\s;{(]|^)(' + CPP_CLASSES.join('|') + ')\\s+([A-Za-z_]\\w*)\\s*(\\([^;]*\\))?\\s*;'), (m, ws, cls, nm, args) => `${ws}let ${nm} = new ${cls}(${args ? args.slice(1, -1) : ''});`);
        // primitive declarations (with possible multiple declarators & arrays)
        s = s.replace(new RegExp('([\\s;{(]|^)(?:static\\s+)?(?:' + CPP_TYPES + ')\\s+'), (m, ws, off) => {
          return ws + 'let ';
        });
        // array initializers {1,2,3} after =
        if (/=\s*\{/.test(s)) s = s.replace(/=\s*\{/, '= [').replace(/\}\s*(;|,)/, ']$1');
        s = s.replace(/^(\s*let\s+\w+)\s*\[\s*(\w*)\s*\]\s*;?$/, (m, pre, sz) => sz ? `${pre} = new Array(${sz}).fill(0);` : `${pre} = [];`);
        s = s.replace(/^(\s*let\s+\w+)\s*\[\s*\]\s*=\s*\[(.*)\]\s*;?$/, (m, pre, inner) => `${pre} = [${inner}];`);
        // string helpers
        s = s.replace(/\bF\s*\(\s*("(?:[^"\\]|\\.)*")\s*\)/g, '$1');
        s = s.replace(/\bB([01]+)\b/g, '0b$1');
        // delays
        s = s.replace(/\bdelayMicroseconds\s*\(/g, 'yield{d:(') // note: close paren below
        // user function calls
        s = rewriteCppCalls(s, fnNames);
        return s.slice(1);
      });
      // fix delayMicroseconds: wrapped open paren → need ")" extra before ;  — simpler: redo as full-line replace
      if (/yield\{d:\(/.test(t)) {
        t = t.replace(/yield\{d:\(([^;]*)\)/, (m, inner) => 'yield{d:(' + inner + ')/1000}');
      }
      t = mapCode(t, false, seg => seg.replace(/\bdelay\s*\(/g, 'yield{d:(') // open form; patched below
      );
      // patch any  yield{d:(...);  →  yield{d:(...)};
      t = t.replace(/yield\{d:\(([^;{}]*?)\)(\s*;)/g, (m, inner, semi) => 'yield{d:(' + inner + ')}' + semi);
      // statement marker — never before else/catch/finally/do-while tails or bare braces
      let marker = '';
      if (!/^\s*(\/\/|\/\*|#)/.test(rawTrim) && !/^(else|catch|finally)\b/.test(rawTrim) && !/^}\s*while\b/.test(rawTrim) && rawTrim !== '{' && rawTrim !== '}' && rawTrim !== '};' && rawTrim !== '') marker = `yield{l:${n + 1}}; `;
      if (unbracedPrev && marker) { t = '{ ' + marker + t.trim() + ' }'; }
      else if (unbracedPrev) { t = '{ ' + t.trim() + ' }'; }
      else t = marker + t;
      out.push(t);
      if (rawTrim) prevSig = line;
    }
    return { js: out.join('\n'), fnNames: [...fnNames] };
  }

  /* ---------- MicroPython ---------- */
  function transpilePy(src) {
    const lines = src.split('\n');
    const out = [];
    const stack = [];       // block indents
    let pending = null;     // indent of line that opened a block
    const declared = new Set(['time', 'Pin', 'ADC', 'PWM', 'Serial', 'GPIO', 'machine', 'math', 'LED', 'Button', 'PWMLED', 'Motor', 'DistanceSensor', 'Buzzer', 'SMBus', 'smbus', 'smbus2', 'gpiozero']);
    const globals = new Set();
    const fnNames = new Set();
    // first pass: function names
    lines.forEach(l => { const m = l.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/); if (m) fnNames.add(m[1]); });

    function closersFor(indent, isElseLike) {
      let n = '';
      while (stack.length && indent < stack[stack.length - 1]) { n += '} '; stack.pop(); }
      return n;
    }

    const fixExpr = seg => {
      let s = seg;
      s = s.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
      s = s.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!');
      s = s.replace(/\belif\b/g, 'else if');
      s = s.replace(/([^<>=!])\/\/(?![\/])/g, '$1/');
      s = s.replace(/\btime\.sleep_ms\s*\(/g, 'yield{d:(');
      s = s.replace(/\butime\.sleep_ms\s*\(/g, 'yield{d:(');
      s = s.replace(/\btime\.sleep_us\s*\(/g, 'yield{d:(');
      s = s.replace(/\butime\.sleep_us\s*\(/g, 'yield{d:(');
      s = s.replace(/\btime\.sleep\s*\(/g, 'yield{d:(').replace(/\butime\.sleep\s*\(/g, 'yield{d:(');
      s = s.replace(/\bprint\s*\(/g, 'Serial.println(');
      s = s.replace(/\bnew\s+new\b/g, 'new');
      s = s.replace(/(?<![.\w])(Pin|ADC|PWM|LED|Button|PWMLED|Motor|DistanceSensor|Buzzer|SMBus)\s*\(/g, 'new $1(');
      s = s.replace(/\blen\s*\(/g, 'len(');
      s = s.replace(/\.append\s*\(/g, '.push(');
      s = s.replace(/\.upper\s*\(\)/g, '.toUpperCase()').replace(/\.lower\s*\(\)/g, '.toLowerCase()');
      s = s.replace(/\.isdigit\s*\(\)/g, '.match(/^\\d+$/)');
      for (const name of fnNames) {
        const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
        s = s.replace(re, (m, off) => {
          const before = s.slice(0, off);
          if (/\.\s*$/.test(before) || /\bdef\s*$/.test(before) || /function\*?\s*$/.test(before)) return m;
          return 'yield* ' + m;
        });
      }
      return s;
    };

    for (let n = 0; n < lines.length; n++) {
      const raw = lines[n];
      if (/^\s*$/.test(raw)) { out.push(''); continue; }
      const indent = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
      const isElseLike = /^\s*(elif|else|except|finally)\b/.test(raw);
      let pre = closersFor(indent, isElseLike);
      if (pending != null) {
        if (indent > pending) stack.push(indent);
        else if (!isElseLike) pre += '} ';
        pending = null;
      }
      // split off trailing comment safely, then transform the code portion
      const codeOnly = segs(raw.trim(), true).filter(([ty]) => ty !== 4).map(([ty, s]) => s).join('').trim();
      let code = mapCode(codeOnly, true, fixExpr);
      // f-strings
      code = code.replace(/f("([^"]*)"|'([^']*)')/g, (m, whole) => {
        const inner = whole.slice(1, -1).replace(/\{([^{}]+)\}/g, '${$1}');
        return '`' + inner + '`';
      });

      let t = null;
      if (code === '' || /^#/.test(code)) t = '';
      else if (/^(import|from)\s/.test(code)) t = '// ' + code.replace(/^from\s+\S+\s+/, '');
      else if (/^def\s+/.test(code)) { t = code.replace(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:\s*$/, (m, nm, args) => `function* ${nm}(${args}) {`); }
      else if (/^global\s+/.test(code)) { code.replace(/^global\s+/, '').split(',').forEach(x => globals.add(x.trim())); t = ''; }
      else if (/^pass\b/.test(code)) t = '';
      else {
        let m;
        if ((m = code.match(/^while\s+(.+?)\s*:\s*(.*)$/))) {
          t = `while (${m[1]}) {` + (m[2] ? ` yield{l:${n + 1}}; ${m[2].replace(/;$/, '')}; }` : '');
        } else if ((m = code.match(/^(?:yield\*\s+)?for\s+(\w+)\s+in\s+range\s*\(([^)]*)\)\s*:\s*(.*)$/))) {
          const parts = m[2].split(',').map(x => x.trim());
          let hdr;
          if (parts.length === 1) hdr = `for (let ${m[1]} = 0; ${m[1]} < (${parts[0]}); ${m[1]}++) {`;
          else if (parts.length === 2) hdr = `for (let ${m[1]} = (${parts[0]}); ${m[1]} < (${parts[1]}); ${m[1]}++) {`;
          else hdr = `for (let ${m[1]} = (${parts[0]}); (${parts[2]}) >= 0 ? ${m[1]} < (${parts[1]}) : ${m[1]} > (${parts[1]}); ${m[1]} += (${parts[2]})) {`;
          declared.add(m[1]);
          t = hdr + (m[3] ? ` yield{l:${n + 1}}; ${m[3].replace(/;$/, '')}; }` : '');
        } else if ((m = code.match(/^for\s+(\w+)\s+in\s+(.+?)\s*:\s*(.*)$/))) {
          declared.add(m[1]);
          t = `for (let ${m[1]} of ${m[2]}) {` + (m[3] ? ` yield{l:${n + 1}}; ${m[3].replace(/;$/, '')}; }` : '');
        } else if ((m = code.match(/^(else\s+if|if)\s+(.+?)\s*:\s*(.*)$/))) {
          t = `${m[1]} (${m[2]}) {` + (m[3] ? ` yield{l:${n + 1}}; ${m[3].replace(/;$/, '')}; }` : '');
        } else if ((m = code.match(/^else\s*:\s*(.*)$/))) {
          t = `else {` + (m[1] ? ` yield{l:${n + 1}}; ${m[1].replace(/;$/, '')}; }` : '');
        } else if ((m = code.match(/^try\s*:\s*(.*)$/))) { t = 'try {'; }
        else if ((m = code.match(/^except(?:\s+\w+(?:\s+as\s+\w+)?)?\s*:\s*(.*)$/))) { t = `catch (e) {` + (m[1] ? ' ' + m[1] + ' }' : ''); }
        else if ((m = code.match(/^finally\s*:/))) { t = 'finally {'; }
        else if ((m = code.match(/^raise\s+(.+)$/))) { t = 'throw new Error(' + m[1] + ');'; }
        else if ((m = code.match(/^([A-Za-z_]\w*)\s*=[^=]/))) {
          const nm = m[1];
          if (!declared.has(nm) && !globals.has(nm)) { declared.add(nm); t = 'let ' + code.replace(/;$/, '') + ';'; }
          else t = code.replace(/;$/, '') + ';';
        }
        else t = code.replace(/;$/, '') + ';';
      }
      // delay/sleep close-paren patch
      if (t.includes('yield{d:(')) t = t.replace(/yield\{d:\(([^;{}]*?)\)(\s*;|\s*})/g, (mm, inner, tail) => 'yield{d:(' + inner + ')' + (/sleep_ms/.test(raw) ? '' : /sleep_us/.test(raw) ? '/1000' : '*1000') + '}' + tail);
      const opensBlock = /\{\s*$/.test(t) && !/\}\s*$/.test(t);
      // statement marker — skip block headers (they get markers from their body lines)
      let marker = '';
      if (t.trim() && !t.trim().startsWith('//') && !opensBlock && !/^(function\*|while|for|if|else\s|else{|try|catch|finally|\})/.test(t.trim())) marker = `yield{l:${n + 1}}; `;
      const line = (pre || '') + marker + t;
      out.push(line);
      if (opensBlock) { pending = indent; }
    }
    // close remaining blocks on the last line
    if (out.length) out[out.length - 1] += ' ' + '}'.repeat(stack.length);
    return { js: out.join('\n'), fnNames: [...fnNames] };
  }

  CS.transpile = function (src, lang) {
    try {
      return Object.assign({ ok: true }, lang === 'py' ? transpilePy(src) : transpileCpp(src));
    } catch (e) {
      return { ok: false, error: { msg: e.message } };
    }
  };
})();
