/* CircuitTecture — full-stack IoT & microcontroller circuit simulator
   Zero-dependency Node server: static hosting + SQLite REST API.
   Run:  node server.js   (then open http://localhost:8080) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const db = require('./db');

/* ==================== LOGGER ==================== */
const logger = {
  info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args)
};

/* ==================== CONFIG ==================== */
const CONFIG = {
  ROOT: __dirname,
  PUB: path.join(__dirname, 'public'),
  DATA: path.join(__dirname, 'data'),
  PORT: parseInt(process.env.PORT || '8080', 10),
  IS_PROD: process.env.NODE_ENV === 'production',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-in-prod-1234567890',
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  PASSWORD_MIN_LENGTH: 8,
  RATE_LIMIT_SIGNUP: parseInt(process.env.RATE_LIMIT_SIGNUP || '8', 10),
  RATE_LIMIT_LOGIN: parseInt(process.env.RATE_LIMIT_LOGIN || '10', 10),
  ADMIN_SEED_EMAIL: process.env.ADMIN_SEED_EMAIL || 'admin@circuittecture.local',
  ADMIN_SEED_PASSWORD: process.env.ADMIN_SEED_PASSWORD || 'admin1234',
  BACKUP_INTERVAL_MS: parseInt(process.env.BACKUP_INTERVAL_MS || '3600000', 10),
  BACKUP_RETENTION_COUNT: parseInt(process.env.BACKUP_RETENTION_COUNT || '10', 10)
};

if (CONFIG.IS_PROD) {
  if (CONFIG.SESSION_SECRET === 'dev-secret-change-in-prod-1234567890') {
    logger.error('Refusing to boot in production mode with default SESSION_SECRET.');
    process.exit(1);
  }
  if (CONFIG.ADMIN_SEED_PASSWORD === 'admin1234') {
    logger.error('Refusing to boot in production mode with default ADMIN_SEED_PASSWORD.');
    process.exit(1);
  }
}

const RATE = new Map();
const uid = (n = 10) => crypto.randomBytes(n).toString('base64url');
const now = () => Date.now();

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: blob: https://cdnjs.cloudflare.com; font-src 'self' data: https://cdnjs.cloudflare.com; connect-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob:; frame-ancestors 'none'";

const MAINTENANCE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Maintenance — CircuitTecture</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0b1220,#101a2e);color:#e6edf7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{text-align:center;padding:48px 32px;max-width:420px}
  .wrench{font-size:56px}
  h1{margin:16px 0 8px;font-size:26px}
  p{margin:0 0 24px;color:#93a4bd;font-size:15px;line-height:1.6}
  .pill{display:inline-block;padding:8px 18px;border:1px solid #2a3b57;border-radius:999px;color:#93a4bd;font-size:13px}
</style>
</head>
<body><div class="card">
  <div class="wrench">🔧</div>
  <h1>We&rsquo;ll be right back</h1>
  <p>CircuitTecture is undergoing scheduled maintenance. Please check back shortly.</p>
  <div class="pill">Maintenance mode is active</div>
</div></body>
</html>`;

const VALIDATION = {
  isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')),
  isValidPassword: (pass) => pass && pass.length >= CONFIG.PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(pass) && /\d/.test(pass)
};

function hashPass(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.scryptSync(pass, salt, 32).toString('hex');
}
function checkPass(pass, stored) {
  const [salt, h] = String(stored || '').split('$');
  if (!salt || !h) return false;
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(pass, salt, 32));
}

function bootstrapAdmin() {
  const existing = db.getUserByEmail(CONFIG.ADMIN_SEED_EMAIL);
  if (!existing) {
    db.createUser({
      id: uid(10),
      name: 'CircuitTecture Admin',
      email: CONFIG.ADMIN_SEED_EMAIL,
      pass: hashPass(CONFIG.ADMIN_SEED_PASSWORD),
      role: 'admin',
      avatar: '🛡️',
      createdAt: now()
    });
    logger.info(`Seeded admin user: ${CONFIG.ADMIN_SEED_EMAIL}`);
  }
}
bootstrapAdmin();

// Scheduled Backups
const backupTimer = setInterval(async () => {
  try {
    const cutoff = now() - CONFIG.SESSION_MAX_AGE_MS;
    db.cleanExpiredSessions(cutoff);

    const backupName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
    const backupPath = path.join(CONFIG.DATA, 'backups', backupName);
    await db.backupTo(backupPath);

    const backups = db.getBackupsMeta();
    if (backups.length > CONFIG.BACKUP_RETENTION_COUNT) {
      const toRemove = backups.slice(CONFIG.BACKUP_RETENTION_COUNT);
      for (const b of toRemove) {
        const fp = path.join(CONFIG.DATA, 'backups', b.filename);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        db.deleteBackupMeta(b.id);
      }
    }
  } catch (e) {
    logger.error('Scheduled backup error:', e);
  }
}, CONFIG.BACKUP_INTERVAL_MS);

// Rate limit sweep
const rateSweepTimer = setInterval(() => {
  const cutoff = now() - 3600000;
  for (const [k, v] of RATE) {
    if (v.reset < cutoff) RATE.delete(k);
  }
}, 600000);

function normalizeIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = forwarded ? forwarded.split(',')[0].trim() : (req.socket && req.socket.remoteAddress || '127.0.0.1');
  return raw.replace(/^::1$/, '127.0.0.1').replace(/^::ffff:/, '');
}

function rateLimit(req, key, limit = 20, windowMs = 60000) {
  const ip = normalizeIp(req);
  const k = key + ':' + ip;
  const t = now();
  let r = RATE.get(k);
  if (!r || r.reset < t) r = { count: 0, reset: t + windowMs };
  r.count++;
  RATE.set(k, r);
  return r.count <= limit;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => {
      b += c;
      if (b.length > 25e6) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
      }
    });
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getSessionFromReq(req) {
  const sid = cookies(req).cf_session || cookies(req).cs_sid;
  if (!sid) return null;
  const s = db.getSession(sid);
  if (!s) return null;
  if (s.exp < now()) {
    db.deleteSession(sid);
    return null;
  }
  return s;
}

function authedUser(req) {
  const s = getSessionFromReq(req);
  if (!s) return null;
  const u = db.getUser(s.userId);
  if (!u || u.suspended) {
    db.deleteSession(s.id);
    return null;
  }
  if (s.adminUid) {
    u._impersonating = true;
    u._adminUid = s.adminUid;
  }
  return u;
}

function setSessionCookie(res, sid) {
  const secure = CONFIG.IS_PROD ? '; Secure' : '';
  const expires = new Date(now() + CONFIG.SESSION_MAX_AGE_MS).toUTCString();
  res.setHeader('Set-Cookie', `cf_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `cf_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function send(res, code, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, Object.assign({
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json' : 'text/plain',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': CSP
  }, headers));
  res.end(data);
}

function json(res, obj, code = 200) { send(res, code, obj); }

function finite(v, f = 0) { v = +v; return Number.isFinite(v) ? v : f; }
function sanitizeComponents(comps) {
  return (Array.isArray(comps) ? comps : []).map((c, i) => Object.assign({}, c, {
    x: finite(c.x, 40 + i * 30),
    y: finite(c.y, 40),
    r: ((finite(c.r, 0) % 360) + 360) % 360,
    props: c.props || {},
    label: c.label || ''
  }));
}
function sanitizeSketches(sk) {
  const out = {};
  if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
    for (const [k, v] of Object.entries(sk)) {
      if (!/^[\w-]{1,48}$/.test(k) || !v || typeof v !== 'object') continue;
      out[k] = { code: String(v.code || '').slice(0, 200000), lang: v.lang === 'py' ? 'py' : 'cpp' };
    }
  }
  return out;
}
function sanitizeWires(wires) {
  return (Array.isArray(wires) ? wires : []).map(w => {
    const out = Object.assign({}, w);
    if (Array.isArray(out.points)) out.points = out.points.filter(p => Number.isFinite(+p.x) && Number.isFinite(+p.y)).map(p => ({ x: +p.x, y: +p.y }));
    else delete out.points;
    return out;
  });
}

function pubUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || '🤖', bio: u.bio || '' };
}

function projectView(p, viewer, full = false) {
  if (!p) return null;
  const own = viewer && (p.ownerId === viewer.id || viewer.role === 'admin');
  const base = {
    id: p.id, name: p.name, desc: p.desc, board: p.board, lang: p.lang, thumb: p.thumb,
    public: p.public, forkable: p.forkable, official: p.official, shareId: p.shareId,
    owner: pubUser(db.getUser(p.ownerId)) || { name: 'CircuitTecture' },
    createdAt: p.createdAt, updatedAt: p.updatedAt, forks: p.forks || 0,
    likes: (p.likers || []).length,
    liked: !!(viewer && (p.likers || []).includes(viewer.id)),
    own: !!own
  };
  if (full) {
    Object.assign(base, {
      components: sanitizeComponents(p.components || []),
      wires: sanitizeWires(p.wires || []),
      code: p.code || '',
      sketches: sanitizeSketches(p.sketches || {}),
      viewport: p.viewport || null
    });
  }
  return base;
}

function canSee(p, u) { return p.official || p.public || p.shareId || (u && (p.ownerId === u.id || u.role === 'admin' || u.role === 'moderator')); }
function canEdit(p, u) {
  if (!u) return false;
  if (p.official && u.role !== 'admin') return false;
  return p.ownerId === u.id || u.role === 'admin';
}
function isAdmin(u) { return !!(u && u.role === 'admin' && !u.suspended); }
function isModerator(u) { return !!(u && (u.role === 'admin' || u.role === 'moderator' || u.role === 'teacher') && !u.suspended); }
function isTeacher(u) { return !!(u && (u.role === 'admin' || u.role === 'teacher') && !u.suspended); }

// Feature-flag enforcement. An explicit row in feature_flags wins; otherwise
// fall back to the legacy settings key (admin Settings panel); otherwise the default.
function flagEnabled(key, settingsKey, defaultOn = true) {
  try {
    const flags = db.getFeatureFlags() || {};
    if (flags[key]) return !!flags[key].enabled;
  } catch {}
  if (settingsKey) {
    const v = db.getSettings()[settingsKey];
    if (v !== undefined && v !== null) return !(v === false || v === 'false' || v === 0);
  }
  return defaultOn;
}

function requireAdmin(res, u) {
  if (!u) { json(res, { error: 'auth' }, 401); return false; }
  if (!isAdmin(u)) { json(res, { error: 'not found' }, 404); return false; }
  return true;
}

function requireModerator(res, u) {
  if (!u) { json(res, { error: 'auth' }, 401); return false; }
  if (!isModerator(u)) { json(res, { error: 'forbidden' }, 403); return false; }
  return true;
}

function audit(u, action, target, details) {
  const entry = {
    userId: u ? u.id : null,
    userEmail: u ? u.email : null,
    action,
    target,
    details,
    adminUid: u && u._impersonating ? u._adminUid : null
  };
  db.addAuditLog(entry);
}

/* ==================== ROUTING SYSTEM ==================== */
const routes = [];
function route(m, p, fn) {
  const keys = [];
  const reStr = '^' + p.replace(/:([a-zA-Z0-9_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$';
  routes.push({ m, re: new RegExp(reStr), keys, fn });
}

/* ==================== API ENDPOINTS ==================== */
route('GET', '/healthz', async (req, res) => {
  let dbOk = false;
  try {
    const row = db.raw.prepare('SELECT 1 as ok').get();
    dbOk = row && row.ok === 1;
  } catch { dbOk = false; }
  json(res, { ok: dbOk, version: '1.0.0', status: dbOk ? 'ok' : 'error', uptime: process.uptime(), dbOk }, dbOk ? 200 : 500);
});

route('GET', '/api/health', async (req, res) => {
  let dbOk = false;
  try {
    const row = db.raw.prepare('SELECT 1 as ok').get();
    dbOk = row && row.ok === 1;
  } catch { dbOk = false; }
  json(res, { ok: dbOk, version: '1.0.0', status: dbOk ? 'ok' : 'error', uptime: process.uptime(), dbOk }, dbOk ? 200 : 500);
});

route('GET', '/api/csrf', async (req, res, u) => {
  const s = getSessionFromReq(req);
  let token = uid(16);
  if (s) {
    if (!s.csrf) { s.csrf = token; db.saveSession(s.id, s); }
    else token = s.csrf;
  }
  json(res, { csrfToken: token, csrf: token });
});

 route('GET', '/api/me', async (req, res, u) => {
  if (!u) return json(res, { user: null, csrf: null });
  const s = getSessionFromReq(req);
  const settings = db.getSettings();
  const user = pubUser(u);
  if (u.role === 'admin' && checkPass(CONFIG.ADMIN_SEED_PASSWORD, u.pass)) user.defaultAdminPassActive = true;
  json(res, { user, csrf: s ? s.csrf : null, settings });
});

route('POST', '/api/signup', async (req, res) => {
  const settings = db.getSettings();
  if (!rateLimit(req, 'signup', settings.rateLimitSignup || CONFIG.RATE_LIMIT_SIGNUP, 10 * 60000)) {
    return json(res, { error: 'Too many signup attempts. Try again shortly.' }, 429);
  }
  if (!flagEnabled('signupOpen', 'signupOpen')) return json(res, { error: 'Signups are currently closed.' }, 403);

  const b = await parseBody(req);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const pass = String(b.pass || '');

  if (!name || !email || !pass || !VALIDATION.isValidEmail(email) || !VALIDATION.isValidPassword(pass)) {
    return json(res, { error: 'Name, valid email and password (8+ chars with letters and numbers) required.' }, 400);
  }
  if (db.getUserByEmail(email)) return json(res, { error: 'That email is already registered.' }, 409);
  if (settings.maxUsers && db.countUsers() >= settings.maxUsers) return json(res, { error: 'User limit reached.' }, 403);

  const newU = db.createUser({
    id: uid(10),
    name,
    email,
    pass: hashPass(pass),
    role: (b.role === 'teacher' && flagEnabled('teacherSignup', 'teacherSignup')) ? 'teacher' : 'user',
    avatar: '🚀',
    createdAt: now()
  });

  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: newU.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, sid);
  audit(newU, 'signup', newU.email);
  json(res, { user: pubUser(newU), csrf });
});

route('POST', '/api/login', async (req, res) => {
  const settings = db.getSettings();
  if (!rateLimit(req, 'login', settings.rateLimitLogin || CONFIG.RATE_LIMIT_LOGIN, 5 * 60000)) {
    return json(res, { error: 'Too many login attempts. Try again shortly.' }, 429);
  }
  const b = await parseBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const pass = String(b.pass || '');

  const u = db.getUserByEmail(email);
  if (!u || !checkPass(pass, u.pass)) return json(res, { error: 'Invalid email or password.' }, 401);
  if (u.suspended) return json(res, { error: 'Account suspended.' }, 403);
  if (db.getSettings().maintenanceMode && u.role !== 'admin') {
    return json(res, { error: 'Maintenance mode is active. Please try again later.' }, 503);
  }

  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: u.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, sid);
  audit(u, 'login', u.email);
  const user = pubUser(u);
  if (u.role === 'admin' && checkPass(CONFIG.ADMIN_SEED_PASSWORD, u.pass)) user.defaultAdminPassActive = true;
  json(res, { user, csrf });
});

route('POST', '/api/logout', async (req, res, u) => {
  const s = getSessionFromReq(req);
  if (s) db.deleteSession(s.id);
  clearSessionCookie(res);
  if (u) audit(u, 'logout', u.email);
  json(res, { ok: true });
});

route('POST', '/api/user/profile', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  if (!rateLimit(req, 'profile-change', 10, 10 * 60000)) return json(res, { error: 'Too many attempts. Try again shortly.' }, 429);
  const b = await parseBody(req);
  const changes = {};
  if (b.name) changes.name = String(b.name).trim();
  if (b.bio !== undefined) changes.bio = String(b.bio).slice(0, 500);
  if (b.avatar) changes.avatar = String(b.avatar).slice(0, 10);

  if (b.email && b.email.toLowerCase() !== u.email) {
    if (!checkPass(String(b.currentPass || ''), u.pass)) return json(res, { error: 'Current password required.' }, 403);
    const em = String(b.email).trim().toLowerCase();
    if (!VALIDATION.isValidEmail(em) || db.getUserByEmail(em)) return json(res, { error: 'Email unavailable or invalid.' }, 409);
    changes.email = em;
  }

  const updated = db.updateUser(u.id, changes);
  audit(u, 'update_profile', u.id, changes);
  json(res, { user: pubUser(updated) });
});

route('POST', '/api/user/password', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  if (!rateLimit(req, 'password-change', 5, 10 * 60000)) return json(res, { error: 'Too many attempts. Try again shortly.' }, 429);
  const b = await parseBody(req);
  if (!checkPass(String(b.currentPass || ''), u.pass)) return json(res, { error: 'Current password is incorrect.' }, 403);
  if (!b.newPass || !VALIDATION.isValidPassword(b.newPass)) return json(res, { error: 'New password must be 8+ characters with letters and numbers.' }, 400);

  db.updateUser(u.id, { pass: hashPass(b.newPass) });
  db.deleteSessionsByUserId(u.id);
  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: u.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, sid);
  audit(u, 'change_password', u.id);
  json(res, { ok: true });
});

route('GET', '/api/projects', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const projects = db.getUserProjects(u.id).map(p => projectView(p, u));
  json(res, { projects });
});

route('POST', '/api/projects', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  if (!rateLimit(req, 'create-project', 20, 60000)) return json(res, { error: 'Too many requests' }, 429);
  const settings = db.getSettings();
  if (settings.maxProjectsPerUser && db.getUserProjects(u.id).length >= settings.maxProjectsPerUser && u.role !== 'admin') {
    return json(res, { error: 'Project limit reached.' }, 403);
  }
  const b = await parseBody(req);
  const id = uid(8);
  const p = db.saveProject({
    id,
    ownerId: u.id,
    name: String(b.name || 'Untitled Project').slice(0, 100),
    desc: String(b.desc || '').slice(0, 500),
    board: b.board || 'uno',
    lang: b.lang || 'cpp',
    code: b.code || '',
    sketches: sanitizeSketches(b.sketches),
    components: b.components || [],
    wires: b.wires || [],
    public: false,
    forkable: true,
    createdAt: now(),
    updatedAt: now()
  });
  audit(u, 'create_project', id);
  json(res, { project: projectView(p, u, true) });
});

route('GET', '/api/projects/:id', async (req, res, u, m) => {
  const p = db.getProject(m[0]);
  if (!p || !canSee(p, u)) return json(res, { error: 'not found' }, 404);
  json(res, { project: projectView(p, u, true) });
});

route('PUT', '/api/projects/:id', async (req, res, u, m) => {
  const p = db.getProject(m[0]);
  if (!p || !canEdit(p, u)) return json(res, { error: 'not found' }, 404);
  const b = await parseBody(req);
  const changes = { updatedAt: now() };
  if (b.name !== undefined) changes.name = String(b.name).slice(0, 100);
  if (b.desc !== undefined) changes.desc = String(b.desc).slice(0, 500);
  if (b.board !== undefined) changes.board = String(b.board);
  if (b.lang !== undefined) changes.lang = String(b.lang);
  if (b.code !== undefined) changes.code = String(b.code);
  if (b.sketches !== undefined) changes.sketches = sanitizeSketches(b.sketches);
  if (b.components !== undefined) changes.components = sanitizeComponents(b.components);
  if (b.wires !== undefined) changes.wires = sanitizeWires(b.wires);
  if (b.viewport !== undefined) changes.viewport = b.viewport;

  if (b.public !== undefined) {
    if (b.public && !flagEnabled('communityEnabled', 'communityEnabled') && u.role !== 'admin') {
      return json(res, { error: 'Community publishing is disabled.' }, 403);
    }
    changes.public = !!b.public;
  }

  const updated = db.saveProject({ ...p, ...changes });
  json(res, { project: projectView(updated, u, true) });
});

route('DELETE', '/api/projects/:id', async (req, res, u, m) => {
  const p = db.getProject(m[0]);
  if (!p || !canEdit(p, u)) return json(res, { error: 'not found' }, 404);
  db.deleteProject(m[0]);
  audit(u, 'delete_project', m[0]);
  json(res, { ok: true });
});

route('POST', '/api/projects/:id/fork', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  if (!rateLimit(req, 'fork-project', 20, 60000)) return json(res, { error: 'Too many requests' }, 429);
  if (!flagEnabled('allowForking', 'allowForking')) return json(res, { error: 'Forking is disabled by an administrator.' }, 403);
  const source = db.getProject(m[0]);
  if (!source || !canSee(source, u) || source.forkable === false) return json(res, { error: 'not found' }, 404);

  const forked = db.forkProject(source.id, uid(8), u.id, source.name + ' (Fork)');
  audit(u, 'fork_project', source.id, { newId: forked.id });
  json(res, { project: projectView(forked, u, true) });
});

route('GET', '/api/community', async (req, res, u) => {
  const projects = db.getCommunityProjects().map(p => projectView(p, u));
  json(res, { projects, total: projects.length });
});

route('GET', '/api/templates', async (req, res, u) => {
  const templates = db.getOfficialTemplates().map(p => projectView(p, u, true));
  json(res, { templates });
});

route('POST', '/api/templates/:id/fork', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const p = db.getProject(m[0]);
  if (!p || (!p.official && !canSee(p, u))) return json(res, { error: 'not found' }, 404);
  const forked = db.forkProject(p.id, uid(8), u.id, p.name + ' (My Copy)');
  json(res, { project: projectView(forked, u, true) });
});

route('GET', '/api/stats', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const projects = db.getUserProjects(u.id);
  const stats = {
    projects: projects.length,
    public: projects.filter(p => p.public).length,
    forks: projects.reduce((s, p) => s + (p.forks || 0), 0),
    likes: projects.reduce((s, p) => s + (p.likes || 0), 0)
  };
  json(res, { stats });
});

route('POST', '/api/projects/:id/share', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const p = db.getProject(m[0]);
  if (!p || !canEdit(p, u)) return json(res, { error: 'not found' }, 404);
  if (!flagEnabled('allowSharing', 'allowSharing')) return json(res, { error: 'Sharing is disabled by an administrator.' }, 403);
  const b = await parseBody(req);
  if (b && b.off) {
    db.saveProject({ ...p, shareId: null, updatedAt: now() });
    return json(res, { ok: true });
  }
  const shareId = p.shareId || uid(12);
  if (!p.shareId) db.saveProject({ ...p, shareId, updatedAt: now() });
  json(res, { shareId });
});

route('POST', '/api/sim/run', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  // lightweight usage counter → admin overview sparklines
  try {
    const st = db.getSettings();
    const day = new Date().toISOString().slice(0, 10);
    db.updateSettings({
      simRuns: (st.simRuns || 0) + 1,
      ['simRuns:' + day]: (st['simRuns:' + day] || 0) + 1
    });
  } catch {}
  json(res, { ok: true });
});

route('PUT', '/api/me', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  const changes = {};
  if (b.name) changes.name = String(b.name).trim().slice(0, 50);
  if (b.avatar !== undefined) changes.avatar = String(b.avatar).slice(0, 10);
  if (b.bio !== undefined) changes.bio = String(b.bio).slice(0, 500);
  if (b.email && b.email.toLowerCase() !== u.email) {
    if (!b.currentPass || !checkPass(String(b.currentPass), u.pass)) return json(res, { error: 'Current password required' }, 403);
    const em = String(b.email).trim().toLowerCase();
    if (!VALIDATION.isValidEmail(em) || db.getUserByEmail(em)) return json(res, { error: 'Email unavailable' }, 409);
    changes.email = em;
  }
  const updated = db.updateUser(u.id, changes);
  audit(u, 'update_profile', u.id);
  json(res, { user: pubUser(updated) });
});

route('DELETE', '/api/me', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  if (!b.currentPass || !checkPass(String(b.currentPass), u.pass)) return json(res, { error: 'Current password required' }, 403);
  db.deleteSessionsByUserId(u.id);
  db.deleteUser(u.id);
  db.deleteProjectsByOwner(u.id);
  audit(u, 'delete_account', u.id);
  clearSessionCookie(res);
  json(res, { ok: true });
});

route('POST', '/api/me/password', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  if (!b.currentPass || !checkPass(String(b.currentPass), u.pass)) return json(res, { error: 'Current password is incorrect' }, 403);
  if (!b.newPass || !VALIDATION.isValidPassword(b.newPass)) return json(res, { error: 'New password must be 8+ characters with letters and numbers' }, 400);
  db.updateUser(u.id, { pass: hashPass(b.newPass) });
  db.deleteSessionsByUserId(u.id);
  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: u.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, sid);
  audit(u, 'change_password', u.id);
  json(res, { ok: true, csrf });
});

route('POST', '/api/me/logout-all', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  db.deleteSessionsByUserId(u.id);
  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: u.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, sid);
  json(res, { ok: true, csrf });
});

route('POST', '/api/impersonate/stop', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const s = getSessionFromReq(req);
  if (s && s.adminUid) {
    db.updateSession(s.id, { userId: s.adminUid, adminUid: null });
    clearSessionCookie(res);
    const ns = db.getSession(s.id);
    if (ns) setSessionCookie(res, s.id);
  }
  json(res, { ok: true });
});

route('GET', '/api/share/:sid', async (req, res, u, m) => {
  const p = db.getProjectByShareId(m[0]);
  if (!p) return json(res, { error: 'not found' }, 404);
  json(res, { project: projectView(p, u) });
});

/* Classroom / Assignments */
route('GET', '/api/assignments', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  let list;
  if (isTeacher(u)) {
    list = db.getAssignmentsByOwner(u.id);
  } else {
    list = [];
    const seen = new Set();
    db.getClassesForStudent(u.id).forEach(c => db.getAssignmentsByClass(c.id).forEach(a => {
      if (!seen.has(a.id)) { seen.add(a.id); list.push(a); }
    }));
  }
  // legacy global assignments (no class) stay visible to everyone
  db.getAllAssignments().forEach(a => { if (!a.classId && !list.some(x => x.id === a.id)) list.push(a); });
  const out = list.map(a => ({
    id: a.id,
    title: a.title,
    brief: a.brief,
    due: a.due,
    rubric: a.rubric,
    classId: a.classId || null,
    className: a.classId ? ((db.getClass(a.classId) || {}).name || '(class deleted)') : null,
    owner: pubUser(db.getUser(a.ownerId)),
    mine: a.ownerId === u.id,
    submission: db.getSubmission(a.id, u.id),
    count: db.getSubmissionsForAssignment(a.id).length
  })).sort((x, y) => (x.due || Infinity) - (y.due || Infinity));
  json(res, { assignments: out });
});

route('POST', '/api/assignments', async (req, res, u) => {
  if (!u || (!isTeacher(u) && !isAdmin(u))) return json(res, { error: 'forbidden' }, 403);
  const b = await parseBody(req);
  if (!b.title) return json(res, { error: 'title required' }, 400);
  let classId = null;
  if (b.classId) {
    const cls = db.getClass(String(b.classId));
    if (!cls || (cls.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'class not found' }, 404);
    classId = cls.id;
  }
  const a = db.saveAssignment({
    id: uid(8),
    ownerId: u.id,
    classId,
    title: String(b.title).slice(0, 100),
    brief: String(b.brief || '').slice(0, 1000),
    due: b.due ? +b.due : null,
    rubric: String(b.rubric || '').slice(0, 1000),
    createdAt: now()
  });
  audit(u, 'create_assignment', a.id);
  json(res, { assignment: a });
});

route('DELETE', '/api/assignments/:id', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const a = db.getAssignment(m[0]);
  if (!a || (a.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  db.deleteAssignment(a.id);
  audit(u, 'delete_assignment', a.id);
  json(res, { ok: true });
});

route('POST', '/api/assignments/:id/submit', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const a = db.getAssignment(m[0]);
  if (!a) return json(res, { error: 'not found' }, 404);
  if (a.classId && !db.isClassMember(a.classId, u.id) && u.role !== 'admin') {
    return json(res, { error: 'Join the class first to submit here.' }, 403);
  }
  const b = await parseBody(req);
  const proj = db.getProject(String(b.projectId || ''));
  if (!proj || proj.ownerId !== u.id) return json(res, { error: 'Pick one of your own projects.' }, 400);
  db.saveSubmission({
    id: uid(10),
    assignmentId: a.id,
    userId: u.id,
    projectId: proj.id,
    grade: null,        // resubmission clears the previous grade
    feedback: '',
    submittedAt: now()
  });
  audit(u, 'submit_assignment', a.id, { projectId: proj.id });
  json(res, { submission: db.getSubmission(a.id, u.id) });
});

route('GET', '/api/assignments/:id/submissions', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const a = db.getAssignment(m[0]);
  if (!a || (a.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  const subs = db.getSubmissionsForAssignment(a.id).map(sv => ({
    ...sv,
    student: pubUser(db.getUser(sv.userId)),
    project: (pp => pp ? { id: pp.id, name: pp.name, thumb: pp.thumb, updatedAt: pp.updatedAt } : null)(db.getProject(sv.projectId))
  }));
  const roster = a.classId ? db.getRoster(a.classId) : [];
  json(res, { submissions: subs, roster, assignment: a });
});

route('POST', '/api/assignments/:id/grade', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const a = db.getAssignment(m[0]);
  if (!a || (a.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  const b = await parseBody(req);
  const sv = db.getSubmission(a.id, String(b.userId || ''));
  if (!sv) return json(res, { error: 'submission not found' }, 404);
  const grade = (b.grade === null || b.grade === undefined || b.grade === '') ? null : Math.max(0, Math.min(100, +b.grade || 0));
  db.gradeSubmission(sv.id, grade, String(b.feedback || '').slice(0, 1000));
  audit(u, 'grade_submission', a.id, { userId: sv.userId, grade });
  json(res, { ok: true });
});

/* ---------- Classroom (classes & invite codes) ---------- */
route('GET', '/api/classes', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  let classes;
  if (isTeacher(u)) {
    classes = db.getClassesForTeacher(u.id).map(c => ({ id: c.id, name: c.name, code: c.code, members: c.members, createdAt: c.createdAt, role: 'teacher' }));
  } else {
    classes = db.getClassesForStudent(u.id).map(c => {
      const t = pubUser(db.getUser(c.ownerId));
      return { id: c.id, name: c.name, members: c.members, createdAt: c.createdAt, role: 'student', teacher: t ? t.name : 'Teacher' };
    });
  }
  json(res, { classes });
});

route('POST', '/api/classes', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  if (!isTeacher(u)) return json(res, { error: 'Only teachers can create classes.' }, 403);
  if (!flagEnabled('classroomEnabled', 'classroomEnabled') && u.role !== 'admin') return json(res, { error: 'Classroom is disabled by an administrator.' }, 403);
  const b = await parseBody(req);
  const name = String(b.name || '').trim().slice(0, 80);
  if (!name) return json(res, { error: 'Class name required' }, 400);
  if (db.getClassesForTeacher(u.id).length >= 50) return json(res, { error: 'Class limit reached.' }, 403);
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join(''); } while (db.getClassByCode(code));
  const c = db.createClass({ id: uid(8), name, code, ownerId: u.id, createdAt: now() });
  audit(u, 'create_class', c.id);
  json(res, { class: { id: c.id, name: c.name, code: c.code, members: 0, createdAt: c.createdAt, role: 'teacher' } });
});

route('POST', '/api/classes/join', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  const c = db.getClassByCode(b.code);
  if (!c) return json(res, { error: 'No class with that code — check the spelling.' }, 404);
  if (c.ownerId === u.id) return json(res, { error: 'You teach this class already!' }, 400);
  db.joinClass(c.id, u.id);
  audit(u, 'join_class', c.id);
  json(res, { class: { id: c.id, name: c.name } });
});

route('GET', '/api/classes/:id', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const c = db.getClass(m[0]);
  if (!c || (c.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  json(res, {
    class: { id: c.id, name: c.name, code: c.code, createdAt: c.createdAt },
    roster: db.getRoster(c.id).map(r => ({ id: r.id, name: r.name, email: r.email, avatar: r.avatar, joinedAt: r.joinedAt }))
  });
});

route('POST', '/api/classes/:id/leave', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  db.leaveClass(m[0], u.id);
  json(res, { ok: true });
});

route('DELETE', '/api/classes/:id/members/:uid', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const c = db.getClass(m[0]);
  if (!c || (c.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  db.leaveClass(c.id, m[1]);
  audit(u, 'remove_class_member', c.id, { userId: m[1] });
  json(res, { ok: true });
});

route('DELETE', '/api/classes/:id', async (req, res, u, m) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const c = db.getClass(m[0]);
  if (!c || (c.ownerId !== u.id && u.role !== 'admin')) return json(res, { error: 'not found' }, 404);
  db.deleteClass(c.id);
  audit(u, 'delete_class', c.id);
  json(res, { ok: true });
});

/* Moderation Queue Endpoints */
route('POST', '/api/moderation/report', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  if (!b.projectId || !b.reason) return json(res, { error: 'projectId and reason required' }, 400);
  const p = db.getProject(b.projectId);
  if (!p) return json(res, { error: 'project not found' }, 404);

  const id = db.addModerationItem({
    projectId: b.projectId,
    reporterId: u.id,
    reason: String(b.reason).slice(0, 500)
  });
  json(res, { id, status: 'pending' });
});

route('GET', '/api/admin/moderation', async (req, res, u) => {
  if (!requireModerator(res, u)) return;
  const queue = db.getModerationQueue().map(item => ({
    ...item,
    project: projectView(db.getProject(item.projectId), u),
    reporter: pubUser(db.getUser(item.reporterId))
  }));
  json(res, { queue });
});

route('POST', '/api/admin/moderation/:id/action', async (req, res, u, m) => {
  if (!requireModerator(res, u)) return;
  const b = await parseBody(req);
  const action = b.action;
  if (!['approve', 'reject', 'feature'].includes(action)) return json(res, { error: 'invalid action' }, 400);

  db.updateModerationStatus(m[0], action);
  audit(u, 'moderation_action', m[0], { action });
  json(res, { ok: true });
});

/* Custom Components Endpoints */
route('GET', '/api/custom-components', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const list = db.getUserCustomComponents(u.id);
  json(res, { components: list });
});

route('POST', '/api/custom-components', async (req, res, u) => {
  if (!u) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  if (!b.name || !b.pinDefs) return json(res, { error: 'name and pinDefs required' }, 400);

  const id = uid(8);
  db.saveCustomComponent({
    id,
    userId: u.id,
    name: String(b.name).slice(0, 50),
    label: String(b.label || '').slice(0, 20),
    category: String(b.category || 'Custom').slice(0, 30),
    pinDefs: b.pinDefs,
    renderSvg: String(b.renderSvg || ''),
    logicJs: String(b.logicJs || ''),
    public: !!b.public
  });
  json(res, { component: db.getCustomComponentById(id) });
});

/* Admin Panel API */
route('GET', '/api/admin/stats', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const allUsers = db.getAllUsers();
  const allProjects = db.getAllProjects();
  const sessions = db.getAllSessions();
  const settings = db.getSettings();
  const activeSessions = Object.keys(sessions).length;
  // users holding at least one live session right now
  const activeUsers = new Set(Object.values(sessions).map(x => x && x.userId).filter(Boolean)).size;
  const suspended = allUsers.filter(x => x.suspended).length;
  const publicProjects = allProjects.filter(x => x.public).length;
  const storageBytes = allProjects.reduce((sum, x) =>
    sum + JSON.stringify(x.components || []).length + JSON.stringify(x.wires || []).length +
    (x.code || '').length + JSON.stringify(x.sketches || {}).length, 0);
  // 14-day activity history: signups from user rows, sims from the sim/run counters
  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const dayOf = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  const activityHistory = [...Array(14)].map((_, i) => {
    const d = new Date(day0.getTime() - 864e5 * (13 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      day: key,
      signups: allUsers.filter(x => dayOf(x.createdAt || 0) === key).length,
      sims: settings['simRuns:' + key] || 0
    };
  });
  const compCounts = {};
  for (const pr of allProjects) for (const c of (pr.components || [])) compCounts[c.type] = (compCounts[c.type] || 0) + 1;
  const topComponents = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const stats = {
    users: allUsers.length, projects: allProjects.length,
    activeSessions, activeUsers, suspended, publicProjects,
    storageBytes, simRuns: settings.simRuns || 0,
    activityHistory, topComponents,
    uptime: process.uptime()
  };
  json(res, { stats });
});

route('GET', '/api/admin/users', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  json(res, { users: db.getAllUsers().map(x => ({
    id: x.id, name: x.name, email: x.email, role: x.role,
    avatar: x.avatar || '🤖', bio: x.bio || '',
    suspended: !!x.suspended, projectCount: db.countUserProjects(x.id), createdAt: x.createdAt
  })) });
});

route('PUT', '/api/admin/users/:id', async (req, res, u, m) => {
  if (!requireAdmin(res, u)) return;
  const b = await parseBody(req);
  const target = db.getUser(m[0]);
  if (!target) return json(res, { error: 'not found' }, 404);

  const updated = db.updateUser(m[0], b);
  audit(u, 'admin_update_user', m[0], b);
  json(res, { user: pubUser(updated) });
});

route('DELETE', '/api/admin/users/:id', async (req, res, u, m) => {
  if (!requireAdmin(res, u)) return;
  const b = await parseBody(req);
  if (b.confirm !== 'DELETE') return json(res, { error: 'Confirmation token "DELETE" required' }, 400);
  if (u.id === m[0]) return json(res, { error: 'cannot delete yourself' }, 400);
  const target = db.getUser(m[0]);
  if (!target) return json(res, { error: 'User not found' }, 404);
  if (b.mode === 'reassign') {
    db.reassignUserProjects(target.id, u.id);
  }
  db.deleteUser(m[0]);
  audit(u, 'admin_delete_user', m[0], { mode: b.mode || 'cascade' });
  json(res, { ok: true });
});

// Force a password reset: generates a one-time temporary password the admin
// can hand to the user (returned once, never stored in clear text).
route('POST', '/api/admin/users/:id/reset-password', async (req, res, u, m) => {
  if (!requireAdmin(res, u)) return;
  const target = db.getUser(m[0]);
  if (!target) return json(res, { error: 'User not found' }, 404);
  if (u.id === m[0]) return json(res, { error: 'Change your own password from account settings.' }, 400);
  const temp = Array.from({ length: 10 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 55)]).join('');
  db.updateUser(m[0], { pass: hashPass(temp) });
  db.deleteSessionsByUserId(m[0]); // force re-login with the new password
  audit(u, 'admin_reset_password', m[0], { email: target.email });
  json(res, { ok: true, tempPassword: temp, email: target.email });
});

route('GET', '/api/admin/settings', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  json(res, { settings: db.getSettings() });
});

route('PUT', '/api/admin/settings', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const b = await parseBody(req);
  const updated = db.updateSettings(b);
  audit(u, 'admin_update_settings', 'system', b);
  json(res, { settings: updated });
});

route('POST', '/api/admin/impersonate/:id', async (req, res, u, m) => {
  if (!requireAdmin(res, u)) return;
  const target = db.getUser(m[0]);
  if (!target) return json(res, { error: 'User not found' }, 404);
  if (target.role === 'admin') return json(res, { error: 'Cannot impersonate an admin' }, 400);

  const sid = uid(24);
  const csrf = uid(16);
  db.saveSession(sid, { userId: target.id, csrf, createdAt: now(), exp: now() + 3600000, adminUid: u.id });
  setSessionCookie(res, sid);
  audit(u, 'impersonate_start', target.id);
  json(res, { user: pubUser(target) });
});

route('POST', '/api/admin/impersonate/stop', async (req, res, u) => {
  if (!u || !u._impersonating) return json(res, { error: 'Not impersonating' }, 400);
  const s = getSessionFromReq(req);
  if (s) db.deleteSession(s.id);

  const admin = db.getUser(u._adminUid);
  const newSid = uid(24);
  const csrf = uid(16);
  db.saveSession(newSid, { userId: admin.id, csrf, createdAt: now(), exp: now() + CONFIG.SESSION_MAX_AGE_MS });
  setSessionCookie(res, newSid);
  audit(admin, 'impersonate_stop', u.id);
  json(res, { user: pubUser(admin) });
});

route('GET', '/api/admin/audit', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const logs = db.getAuditLogs(100, 0);
  json(res, { logs });
});

// Full audit-trail CSV download (powers the admin "Export Audit" quick action)
route('GET', '/api/admin/export/audit', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const logs = db.getAuditLogs(10000, 0) || [];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [['Timestamp', 'User ID', 'Email', 'Action', 'Target', 'Details', 'Admin (impersonator)'].map(q).join(',')];
  for (const l of logs) {
    const details = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || '');
    lines.push([new Date(l.ts || 0).toISOString(), l.userId || '', l.userEmail || '', l.action, l.target, details, l.adminUid || ''].map(q).join(','));
  }
  audit(u, 'admin_export_audit', 'audit_log', { rows: logs.length });
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="audit-' + new Date().toISOString().slice(0, 10) + '.csv"'
  });
  res.end('\ufeff' + lines.join('\n'));
});

route('POST', '/api/admin/db/backup', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const name = `manual-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
  const fp = path.join(CONFIG.DATA, 'backups', name);
  const meta = await db.backupTo(fp);
  audit(u, 'admin_backup_db', name);
  json(res, { ok: true, backup: meta });
});

route('GET', '/api/admin/db/backups', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  json(res, { backups: db.getBackupsMeta() });
});

route('POST', '/api/admin/db/restore', async (req, res, u) => {
  if (!requireAdmin(res, u)) return;
  const b = await parseBody(req);
  if (b.confirm !== 'RESTORE') return json(res, { error: 'Confirmation token "RESTORE" required' }, 400);
  audit(u, 'admin_restore_db', b.filename || 'unknown');
  json(res, { ok: true });
});

route('GET', '/api/admin/db/backup/:name', async (req, res, u, m) => {
  if (!requireAdmin(res, u)) return;
  const name = decodeURIComponent(m[0]);
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return json(res, { error: 'Invalid backup name' }, 400);
  const backupsDir = path.join(CONFIG.DATA, 'backups');
  const fp = path.join(backupsDir, name);
  if (!fp.startsWith(backupsDir + path.sep)) return json(res, { error: 'Invalid backup name' }, 400);
  if (!fs.existsSync(fp)) return json(res, { error: 'Backup not found' }, 404);
  const stat = fs.statSync(fp);
  audit(u, 'admin_download_db', name);
  send(res, 200, fs.readFileSync(fp), {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Content-Length': stat.size
  });
});

route('GET', '/api/admin/sessions', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const sessions = db.getAllSessions();
  json(res, { sessions });
});

route('DELETE', '/api/admin/sessions/:id', async (req, res, u, m) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  db.deleteSession(m[0]);
  json(res, { ok: true });
});

route('POST', '/api/admin/sessions/logout-all', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const s = getSessionFromReq(req);
  db.deleteAllSessionsExcept(s ? s.id : null);
  json(res, { ok: true });
});

route('GET', '/api/admin/projects', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const projects = db.getAllProjects().map(p => projectView(p, u, true));
  json(res, { projects });
});

route('PUT', '/api/admin/projects/:id', async (req, res, u, m) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const p = db.getProject(m[0]);
  if (!p) return json(res, { error: 'not found' }, 404);
  const b = await parseBody(req);
  const changes = { updatedAt: now() };
  if (b.public !== undefined) changes.public = !!b.public;
  if (b.official !== undefined) changes.official = !!b.official;
  if (b.tags !== undefined) changes.tags = b.tags;
  if (b.name !== undefined) changes.name = String(b.name);
  if (b.code !== undefined) changes.code = b.code;
  if (b.components !== undefined) changes.components = b.components;
  if (b.wires !== undefined) changes.wires = b.wires;
  const updated = db.saveProject({ ...p, ...changes });
  audit(u, 'admin_update_project', m[0], { fields: Object.keys(changes).filter(k => k !== 'updatedAt'), reason: typeof b.reason === 'string' ? b.reason.slice(0, 240) : undefined });
  json(res, { project: projectView(updated, u, true) });
});

route('DELETE', '/api/admin/projects/:id', async (req, res, u, m) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  db.deleteProject(m[0]);
  json(res, { ok: true });
});

route('GET', '/api/admin/activity', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const log = db.getAuditLog(200);
  json(res, { log });
});

route('POST', '/api/admin/db/optimize', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  db.optimize();
  json(res, { ok: true });
});

route('POST', '/api/admin/users', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim().toLowerCase();
  const pass = String(b.pass || '');
  if (!name || !email || !pass || !VALIDATION.isValidEmail(email)) return json(res, { error: 'Invalid input' }, 400);
  if (db.getUserByEmail(email)) return json(res, { error: 'Email exists' }, 409);
  const newU = db.createUser({ id: uid(10), name, email, pass: hashPass(pass), role: b.role || 'user', avatar: '👤', createdAt: now() });
  audit(u, 'admin_create_user', newU.id);
  json(res, { user: pubUser(newU) });
});

route('GET', '/api/admin/system', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  let dbFile = 0;
  try { dbFile = fs.statSync(db.raw.name).size; } catch {}
  json(res, {
    system: {
      node: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      cwd: process.cwd(),
      sessions: Object.keys(db.getAllSessions()).length,
      dbFile
    }
  });
});

/* Feature Flags */
route('GET', '/api/admin/feature-flags', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  json(res, { flags: db.getFeatureFlags() });
});

route('PUT', '/api/admin/feature-flags/:key', async (req, res, u, m) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  db.setFeatureFlag(m[0], { enabled: b.enabled !== false, description: b.description || '' });
  json(res, { ok: true });
});

route('DELETE', '/api/admin/feature-flags/:key', async (req, res, u, m) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  db.deleteFeatureFlag(m[0]);
  json(res, { ok: true });
});

route('POST', '/api/admin/feature-flags', async (req, res, u) => {
  if (!u || !isAdmin(u)) return json(res, { error: 'auth' }, 401);
  const b = await parseBody(req);
  if (!b.key) return json(res, { error: 'key required' }, 400);
  db.setFeatureFlag(b.key, { enabled: b.enabled !== false, description: b.description || '' });
  audit(u, 'admin_set_feature_flag', b.key);
  json(res, { ok: true });
});

/* Static File Server */
function serveStatic(req, res, overridePath = null) {
  let reqPath = overridePath || new URL(req.url, 'http://localhost').pathname;
  if (reqPath === '/') reqPath = '/index.html';
  const pageMap = {
    '/dashboard': '/dashboard.html',
    '/editor': '/editor.html',
    '/admin': '/admin.html',
    '/features': '/features.html',
    '/components': '/components.html',
    '/docs': '/docs.html',
  };
  if (pageMap[reqPath]) reqPath = pageMap[reqPath];
  const filePath = path.join(CONFIG.PUB, reqPath);

  if (!filePath.startsWith(CONFIG.PUB)) {
    return json(res, { error: 'forbidden' }, 403);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!overridePath && !reqPath.startsWith('/api')) {
        return serveStatic(req, res, '/index.html');
      }
      return json(res, { error: 'not found' }, 404);
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=UTF-8',
      '.js': 'text/javascript; charset=UTF-8',
      '.css': 'text/css; charset=UTF-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType };
    const compressible = ['.html', '.js', '.css', '.json', '.svg', '.txt', '.md'].includes(ext);
    const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
    if (compressible) {
      headers['Vary'] = 'Accept-Encoding';
      headers['Cache-Control'] = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    }

    const stream = fs.createReadStream(filePath);
    if (acceptsGzip && compressible) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      stream.pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      stream.pipe(res);
    }
  });
}

/* HTTP Request Listener */
const server = http.createServer(async (req, res) => {
  const startMs = Date.now();
  req.id = uid(6);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (CONFIG.IS_PROD && (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  res.on('finish', () => {
    const duration = Date.now() - startMs;
    logger.info(`[${req.id}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });

  try {
    const u = authedUser(req);

    // Maintenance mode: block non-admin access with a maintenance notice
    if (db.getSettings().maintenanceMode && !(u && u.role === 'admin')) {
      const isApi = req.url.startsWith('/api/') || req.url === '/healthz';
      const openApi = ['/api/login', '/api/csrf', '/api/health'];
      if (isApi) {
        if (!openApi.some(p => req.url === p || req.url.startsWith(p + '/'))) {
          return json(res, { error: 'Maintenance mode is active. Please try again later.' }, 503);
        }
      } else if (!req.url.startsWith('/share/')) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(MAINTENANCE_PAGE);
      }
    }

    // CSRF check on state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.url.startsWith('/api/')) {
      const skipCsrf = req.url === '/api/login' || req.url === '/api/signup';
      if (!skipCsrf) {
        const headerCsrf = req.headers['x-csrf-token'];
        const session = getSessionFromReq(req);
        if (!session || !headerCsrf || headerCsrf !== session.csrf) {
          return json(res, { error: 'CSRF protection triggered' }, 403);
        }
      }
    }

    if (req.url.startsWith('/api/') || req.url === '/healthz') {
      for (const r of routes) {
        if (r.m !== req.method) continue;
        const m = req.url.split('?')[0].match(r.re);
        if (m) return await r.fn(req, res, u, m.slice(1));
      }
      return json(res, { error: 'not found' }, 404);
    }

    if (req.url.startsWith('/share/')) return serveStatic(req, res, '/index.html');
    serveStatic(req, res);
  } catch (e) {
    logger.error('Request error:', e);
    json(res, { error: 'server error' }, 500);
  }
});

/* Graceful Shutdown */
let isShuttingDown = false;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal} — shutting down gracefully...`);
  clearInterval(backupTimer);
  clearInterval(rateSweepTimer);
  const forceExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out after 10s; forcing exit.');
    process.exit(1);
  }, 10000);
  forceExit.unref();
  server.close(() => {
    try { db.close(); } catch { /* ignore */ }
    logger.info('Shutdown complete.');
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(CONFIG.PORT, () => {
  logger.info(`⚡ CircuitTecture running at http://localhost:${CONFIG.PORT}`);
});

module.exports = server;
