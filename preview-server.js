// Local static preview server (dev only) — serves public/ with clean-URL route mapping
// plus a mock API so dashboard/editor surfaces can be previewed without the DB backend.
// NOT part of the product.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.txt': 'text/plain'
};
const ROUTES = {
  '/': '/index.html', '/features': '/features.html', '/components': '/components.html',
  '/docs': '/docs.html', '/dashboard': '/dashboard.html', '/editor': '/editor.html', '/admin': '/admin.html'
};

/* ---- mock API data ---- */
const G = '#4ade80', GR = '#94a3b8', Y = '#fbbf24';
const P = {
  id: 'demo1', name: 'Smart Plant Monitor', board: 'uno', lang: 'cpp',
  updatedAt: Date.now() - 3600e3, createdAt: Date.now() - 86400e3, public: true, forks: 4, likes: 12, likers: [], tags: ['iot', 'garden'], folder: 'IoT',
  code: '// Smart Plant Monitor\n#include <Servo.h>\nServo s;\n\nvoid setup() {\n  pinMode(13, OUTPUT);\n  s.attach(9);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  s.write(45);\n  Serial.println("watering...");\n  delay(500);\n  digitalWrite(13, LOW);\n  s.write(0);\n  delay(500);\n}',
  components: [
    { id: 'c1', type: 'uno', x: 90, y: 130, r: 0, props: {}, label: '' },
    { id: 'c2', type: 'resistor', x: 470, y: 70, r: 0, props: { value: 220 }, label: '' },
    { id: 'c3', type: 'led', x: 600, y: 90, r: 0, props: { color: '#ef4444' }, label: '' },
    { id: 'c4', type: 'dht22', x: 470, y: 240, r: 0, props: {}, label: '' },
    { id: 'c5', type: 'servo', x: 630, y: 250, r: 0, props: {}, label: '' }
  ],
  wires: [
    { id: 'w1', a: { c: 'c1', p: 'D13' }, b: { c: 'c2', p: '1' }, color: G },
    { id: 'w2', a: { c: 'c2', p: '2' }, b: { c: 'c3', p: 'anode' }, color: G },
    { id: 'w3', a: { c: 'c3', p: 'cathode' }, b: { c: 'c1', p: 'GND' }, color: GR },
    { id: 'w4', a: { c: 'c1', p: 'D9' }, b: { c: 'c5', p: 'SIG' }, color: Y },
    { id: 'w5', a: { c: 'c4', p: 'VCC' }, b: { c: 'c1', p: 'VIN' }, color: '#f87171' },
    { id: 'w6', a: { c: 'c4', p: 'GND' }, b: { c: 'c1', p: 'GND2' }, color: GR },
    { id: 'w7', a: { c: 'c4', p: 'DATA' }, b: { c: 'c1', p: 'D2' }, color: '#22d3ee' }
  ]
};
const projectRow = () => ({ id: P.id, name: P.name, board: P.board, lang: P.lang, updatedAt: P.updatedAt, createdAt: P.createdAt, public: P.public, forks: 4, likes: 12, likers: [], tags: P.tags, folder: P.folder, components: P.components, wires: P.wires });

function mockApi(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'PUT' && p.startsWith('/api/projects/')) { // capture saves for test assertions
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { fs.writeFileSync('/tmp/put-' + p.split('/').pop() + '.json', body); } catch { } send(200, { ok: true, csrf: 'dev' }); });
    return;
  }
  if (p === '/api/csrf') return send(200, { csrf: 'dev' });
  if (p === '/api/signup' && req.method === 'POST') { // echo back the chosen role so E2E can assert it
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let b = {};
      try { b = JSON.parse(body || '{}'); } catch { }
      send(200, { user: { id: 'u9', name: b.name || 'New User', email: (b.email || 'new@x.dev').toLowerCase(), avatar: '🚀', role: b.role === 'teacher' ? 'teacher' : 'user' }, csrf: 'dev' });
    });
    return;
  }
  if (p === '/api/me' && req.method === 'GET') {
    if (req.headers['x-preview-anon']) return send(401, { error: 'auth' });
    return send(200, { user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@circuittecture.dev', avatar: '🧑‍🔧', role: 'admin' } });
  }
  if (p === '/api/stats') return send(200, { stats: { projects: 3, public: 1, forks: 4, likes: 12 } });
  if (p === '/api/projects' && req.method === 'GET') return send(200, { projects: [projectRow()] });
  if (p === '/api/projects/' + P.id || p === '/api/projects/demo1') return send(200, { project: Object.assign(JSON.parse(JSON.stringify(P)), { own: true, owner: { name: 'Ada Lovelace' } }) });
  if (p === '/api/projects/sub1') return send(200, { project: Object.assign(JSON.parse(JSON.stringify(P)), { id: 'sub1', name: 'Grace: Button Blink', own: false, owner: { name: 'Grace Hopper' } }) });
  if (p === '/api/templates') return send(200, { templates: [] });
  if (p === '/api/community') return send(200, { projects: [Object.assign(projectRow(), { owner: { name: 'Ada Lovelace' } })] });
  // classroom mocks (teacher side — mock user is admin)
  const klass = { id: 'cl1', name: 'Robotics 101', code: 'K7Q2M9', members: 2, createdAt: Date.now() - 6048e5, role: 'teacher' };
  const roster = [
    { id: 'u2', name: 'Grace Hopper', email: 'grace@school.edu', avatar: '👩‍💻', joinedAt: Date.now() - 5000e5 },
    { id: 'u3', name: 'Alan Turing', email: 'alan@school.edu', avatar: '🧑‍🎓', joinedAt: Date.now() - 4000e5 }
  ];
  const asn1 = {
    id: 'a1', title: 'Blink an LED with a pushbutton', brief: 'Wire a pushbutton to D2 and an LED (with series resistor!) to D13. The LED should toggle on each press — debounce in software, no delay() allowed.',
    due: Date.now() + 7 * 864e5, rubric: '', classId: 'cl1', className: 'Robotics 101', owner: { name: 'Ada Lovelace' }, mine: true,
    submission: null, count: 1
  };
  if (p === '/api/classes' && req.method === 'GET') return send(200, { classes: [klass] });
  if (p === '/api/classes/cl1' && req.method === 'GET') return send(200, { class: klass, roster });
  if (p === '/api/assignments') return send(200, { assignments: [asn1] });
  if (p === '/api/classes' && req.method === 'POST') return send(200, { class: { id: 'cl2', name: '(mock-created class)', code: 'N3WC0D', members: 0, createdAt: Date.now(), role: 'teacher' } });
  if (p === '/api/classes/join') return send(200, { class: { id: 'cl9', name: 'Joined Class' } });
  if (/^\/api\/assignments\/[^/]+\/submit$/.test(p)) return send(200, { submission: { id: 's9', submittedAt: Date.now() } });
  if (/^\/api\/assignments\//.test(p) && req.method === 'POST') return send(200, { ok: true });
  if (p === '/api/assignments/a1/submissions') return send(200, {
    submissions: [{ id: 's1', assignmentId: 'a1', userId: 'u2', projectId: 'demo1', grade: 80, feedback: 'Good wiring — but debounce missing.', submittedAt: Date.now() - 864e5, student: { id: 'u2', name: 'Grace Hopper', email: 'grace@school.edu', avatar: '👩‍💻' }, project: { id: 'demo1', name: 'Smart Plant Monitor', thumb: '', updatedAt: P.updatedAt } }],
    roster, assignment: asn1
  });
  if (p === '/api/sim/run') return send(200, { ok: true, csrf: 'dev' });
  /* ---- admin mocks ---- */
  var hist = [3, 7, 5, 12, 9, 15, 11, 8, 14, 19, 16, 22, 18, 25].map(function (v, i) { var d = new Date(Date.now() - 864e5 * (13 - i)); return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), day: d.toISOString().slice(0, 10), signups: [0, 1, 0, 2, 0, 3, 1, 0, 0, 4, 2, 1, 5, 2][i], sims: v }; });
  if (p === '/api/admin/stats') return send(200, { stats: { users: 4, projects: 6, activeSessions: 2, activeUsers: 2, suspended: 1, publicProjects: 1, storageBytes: 51200, simRuns: 177, activityHistory: hist, topComponents: [['uno', 4], ['led', 6], ['resistor', 5], ['dht22', 2], ['servo', 2]], uptime: 3600 } });
  if (p === '/api/admin/system') return send(200, { system: { node: 'v22.0.0', platform: 'linux', uptime: 3600, memory: { heapUsed: 42e6, heapTotal: 80e6, rss: 120e6 }, pid: 4242, cwd: '/app', sessions: 2, dbFile: 98304 } });
  if (p === '/api/admin/users' && req.method === 'GET') return send(200, { users: [
    { id: 'u1', name: 'Ada Lovelace', email: 'ada@circuittecture.dev', role: 'admin', avatar: '🧑‍🔧', bio: '', suspended: false, projectCount: 3, createdAt: Date.now() - 90 * 864e5 },
    { id: 'u2', name: 'Grace Hopper', email: 'grace@school.edu', role: 'teacher', avatar: '👩‍💻', bio: '', suspended: false, projectCount: 2, createdAt: Date.now() - 60 * 864e5 },
    { id: 'u3', name: 'Alan Turing', email: 'alan@school.edu', role: 'user', avatar: '🧑‍🎓', bio: '', suspended: true, projectCount: 1, createdAt: Date.now() - 20 * 864e5 }
  ] });
  if (p === '/api/admin/projects' && req.method === 'GET') return send(200, { projects: [Object.assign(projectRow(), { owner: { name: 'Ada Lovelace', email: 'ada@circuittecture.dev' }, public: true, official: false, forks: 4, likes: 12 })] });
  if (p === '/api/admin/feature-flags' && req.method === 'GET') return send(200, { flags: { communityEnabled: { enabled: true, description: 'Let users publish to the community gallery' } } });
  if (/^\/api\/admin\/users\/[^/]+\/reset-password$/.test(p) && req.method === 'POST') return send(200, { ok: true, tempPassword: 'TmpK7x29Qw', email: 'grace@school.edu', csrf: 'dev' });
  if (p === '/api/admin/settings' && req.method === 'GET') return send(200, { settings: { signupOpen: true, communityEnabled: true, maintenanceMode: false, siteName: 'CircuitTecture', defaultAvatar: '🧑‍🔧', maxProjectsPerUser: 50, sessionTTL: 86400000, rateLimitSignup: 8, rateLimitLogin: 48 } });
  if (p === '/api/admin/audit') return send(200, { logs: [] });
  if (p.indexOf('/api/admin/') === 0) return send(200, { ok: true, csrf: 'dev' });
  if (p === '/api/admin/audit' && req.method === 'GET') return send(200, { logs: [
    { id: 'log1', ts: Date.now() - 36e5, action: 'create_class', userEmail: 'grace@school.edu', target: 'cl1', details: {} },
    { id: 'log2', ts: Date.now() - 72e5, action: 'admin_update_project', userEmail: 'ada@circuittecture.dev', target: 'prj-adm', details: { fields: ['public'], reason: 'moderation' } }
  ] });
  if (p.indexOf('/api/admin/') === 0) return send(200, { ok: true, csrf: 'dev' });
  if (req.method !== 'GET') return send(200, { ok: true, csrf: 'dev' });
  send(404, { error: 'mock 404' });
}

http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.startsWith('/api/')) return mockApi(req, res);
    let rel = ROUTES[urlPath] || urlPath;
    let file = path.join(PUB, rel);
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(process.env.PORT || 8080, '0.0.0.0', () => console.log('preview server ready'));
