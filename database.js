/* database.js — SQLite data layer for CircuitTecture
   Replaces the flat data/db.json with better-sqlite3.

   Architecture decision: circuit graph data (components, wires, viewport)
   is stored as JSON blobs inside the projects table, NOT normalized into
   separate tables. Rationale: this data is never relationally queried —
   it's always loaded/saved as a complete unit per project. Normalizing
   would add complexity with no query benefit. */
'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'circuittecture.sqlite');

/* ==================== SCHEMA ==================== */
const SCHEMA_SQL = `
-- Core tables
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','moderator','user')),
  avatar        TEXT DEFAULT '🧑‍🔧',
  suspended     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  sid           TEXT PRIMARY KEY,
  uid           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf          TEXT,
  exp           INTEGER,
  admin_uid     TEXT,
  ip            TEXT,
  ua            TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Untitled Project',
  lang          TEXT NOT NULL DEFAULT 'cpp',
  board         TEXT NOT NULL DEFAULT 'uno',
  code          TEXT NOT NULL DEFAULT '',
  components    TEXT NOT NULL DEFAULT '[]',
  wires         TEXT NOT NULL DEFAULT '[]',
  viewport      TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',
  folder        TEXT NOT NULL DEFAULT '',
  thumb         TEXT NOT NULL DEFAULT '',
  public        INTEGER NOT NULL DEFAULT 0,
  forkable      INTEGER NOT NULL DEFAULT 1,
  share_id      TEXT,
  forked_from   TEXT,
  forks         INTEGER NOT NULL DEFAULT 0,
  versions      TEXT NOT NULL DEFAULT '[]',
  likers        TEXT NOT NULL DEFAULT '[]',
  description   TEXT NOT NULL DEFAULT '',
  official      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(public);
CREATE INDEX IF NOT EXISTS idx_projects_share ON projects(share_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT,
  user_name     TEXT,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  details       TEXT,
  ip            TEXT,
  ts            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  template_id   TEXT,
  due           INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  grade         TEXT,
  feedback      TEXT,
  submitted_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);

CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  board         TEXT NOT NULL DEFAULT 'uno',
  lang          TEXT NOT NULL DEFAULT 'cpp',
  tags          TEXT NOT NULL DEFAULT '[]',
  code          TEXT NOT NULL DEFAULT '',
  components    TEXT NOT NULL DEFAULT '[]',
  wires         TEXT NOT NULL DEFAULT '[]',
  viewport      TEXT,
  is_official   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- New tables for Workstreams E/F
CREATE TABLE IF NOT EXISTS feature_flags (
  key           TEXT PRIMARY KEY,
  enabled       INTEGER NOT NULL DEFAULT 1,
  description   TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_queue (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reporter_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason        TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','featured')),
  reviewer_id   TEXT,
  reviewed_at   INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_queue(status);

CREATE TABLE IF NOT EXISTS custom_components (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  definition    TEXT NOT NULL DEFAULT '{}',
  shared        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backups_meta (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  filename      TEXT NOT NULL UNIQUE,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  type          TEXT NOT NULL DEFAULT 'manual',
  created_at    INTEGER NOT NULL
);
`;

/* ==================== DATABASE CLASS ==================== */
class CircuitDB {
  constructor(dbPath) {
    this.dbPath = dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    this.sqlite = new Database(this.dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.exec(SCHEMA_SQL);
    this._prepareStatements();
  }

  _prepareStatements() {
    const s = this.sqlite;
    this.stmts = {
      // Users
      getUserById:      s.prepare('SELECT * FROM users WHERE id = ?'),
      getUserByEmail:   s.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
      getAllUsers:       s.prepare('SELECT * FROM users ORDER BY created_at DESC'),
      countUsers:       s.prepare('SELECT COUNT(*) as count FROM users'),
      insertUser:       s.prepare('INSERT INTO users (id, name, email, pass, role, avatar, suspended, created_at) VALUES (@id, @name, @email, @pass, @role, @avatar, @suspended, @created_at)'),
      updateUser:       s.prepare('UPDATE users SET name=@name, email=@email, pass=@pass, role=@role, avatar=@avatar, suspended=@suspended WHERE id=@id'),
      deleteUser:       s.prepare('DELETE FROM users WHERE id = ?'),

      // Sessions
      getSession:       s.prepare('SELECT * FROM sessions WHERE sid = ?'),
      insertSession:    s.prepare('INSERT INTO sessions (sid, uid, csrf, exp, admin_uid, ip, ua, created_at) VALUES (@sid, @uid, @csrf, @exp, @admin_uid, @ip, @ua, @created_at)'),
      updateSession:    s.prepare('UPDATE sessions SET uid=@uid, csrf=@csrf, exp=@exp, admin_uid=@admin_uid WHERE sid=@sid'),
      sweepExpired:     s.prepare('DELETE FROM sessions WHERE exp IS NOT NULL AND exp < ?'),
      deleteSession:    s.prepare('DELETE FROM sessions WHERE sid = ?'),
      deleteUserSessions: s.prepare('DELETE FROM sessions WHERE uid = ?'),
      deleteAllSessions:  s.prepare('DELETE FROM sessions'),
      getAllSessions:    s.prepare('SELECT s.*, u.name as user_name, u.email as user_email FROM sessions s LEFT JOIN users u ON s.uid = u.id'),
      countSessions:    s.prepare('SELECT COUNT(*) as count FROM sessions'),

      // Projects
      getProjectById:   s.prepare('SELECT * FROM projects WHERE id = ?'),
      getProjectByShare: s.prepare('SELECT * FROM projects WHERE share_id = ?'),
      getProjectsByOwner: s.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC'),
      getPublicProjects: s.prepare('SELECT * FROM projects WHERE public = 1 ORDER BY updated_at DESC'),
      countProjectsByOwner: s.prepare('SELECT COUNT(*) as count FROM projects WHERE owner_id = ?'),
      countProjects:    s.prepare('SELECT COUNT(*) as count FROM projects'),
      insertProject:    s.prepare(`INSERT INTO projects (id, owner_id, name, lang, board, code, components, wires, viewport, tags, folder, thumb, public, forkable, share_id, forked_from, forks, versions, likers, description, official, created_at, updated_at)
                                   VALUES (@id, @owner_id, @name, @lang, @board, @code, @components, @wires, @viewport, @tags, @folder, @thumb, @public, @forkable, @share_id, @forked_from, @forks, @versions, @likers, @description, @official, @created_at, @updated_at)`),
      updateProject:    s.prepare(`UPDATE projects SET name=@name, lang=@lang, board=@board, code=@code, components=@components, wires=@wires, viewport=@viewport, tags=@tags, folder=@folder, thumb=@thumb, public=@public, forkable=@forkable, share_id=@share_id, forks=@forks, versions=@versions, likers=@likers, description=@description, official=@official, updated_at=@updated_at WHERE id=@id`),
      deleteProject:    s.prepare('DELETE FROM projects WHERE id = ?'),
      deleteProjectsByOwner: s.prepare('DELETE FROM projects WHERE owner_id = ?'),
      getAllProjects:    s.prepare('SELECT * FROM projects ORDER BY updated_at DESC'),
      incrementForks:   s.prepare('UPDATE projects SET forks = forks + 1 WHERE id = ?'),

      // Audit
      insertAudit:      s.prepare('INSERT INTO audit_log (user_id, user_name, action, target_type, target_id, details, ip, ts) VALUES (@user_id, @user_name, @action, @target_type, @target_id, @details, @ip, @ts)'),
      getAuditLog:      s.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ? OFFSET ?'),
      countAudit:       s.prepare('SELECT COUNT(*) as count FROM audit_log'),

      // Assignments
      getAssignment:    s.prepare('SELECT * FROM assignments WHERE id = ?'),
      getAssignmentsByOwner: s.prepare('SELECT * FROM assignments WHERE owner_id = ? ORDER BY created_at DESC'),
      insertAssignment: s.prepare('INSERT INTO assignments (id, owner_id, title, description, template_id, due, created_at) VALUES (@id, @owner_id, @title, @description, @template_id, @due, @created_at)'),
      updateAssignment: s.prepare('UPDATE assignments SET title=@title, description=@description, template_id=@template_id, due=@due WHERE id=@id'),
      deleteAssignment: s.prepare('DELETE FROM assignments WHERE id = ?'),

      // Submissions
      getSubmission:    s.prepare('SELECT * FROM submissions WHERE id = ?'),
      getSubmissionsByAssignment: s.prepare('SELECT * FROM submissions WHERE assignment_id = ? ORDER BY submitted_at DESC'),
      getSubmissionByStudentAssignment: s.prepare('SELECT * FROM submissions WHERE student_id = ? AND assignment_id = ?'),
      insertSubmission: s.prepare('INSERT INTO submissions (id, assignment_id, student_id, project_id, grade, feedback, submitted_at) VALUES (@id, @assignment_id, @student_id, @project_id, @grade, @feedback, @submitted_at)'),
      updateSubmission: s.prepare('UPDATE submissions SET grade=@grade, feedback=@feedback WHERE id=@id'),

      // Templates
      getTemplate:      s.prepare('SELECT * FROM templates WHERE id = ?'),
      getAllTemplates:   s.prepare('SELECT * FROM templates ORDER BY created_at DESC'),
      insertTemplate:   s.prepare('INSERT INTO templates (id, name, description, board, lang, tags, code, components, wires, viewport, is_official, created_at) VALUES (@id, @name, @description, @board, @lang, @tags, @code, @components, @wires, @viewport, @is_official, @created_at)'),
      updateTemplate:   s.prepare('UPDATE templates SET name=@name, description=@description, board=@board, lang=@lang, tags=@tags, code=@code, components=@components, wires=@wires, viewport=@viewport, is_official=@is_official WHERE id=@id'),
      deleteTemplate:   s.prepare('DELETE FROM templates WHERE id = ?'),

      // Settings
      getSetting:       s.prepare('SELECT value FROM settings WHERE key = ?'),
      setSetting:       s.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
      getAllSettings:    s.prepare('SELECT * FROM settings'),
      deleteSetting:    s.prepare('DELETE FROM settings WHERE key = ?'),

      // Feature flags
      getFlag:          s.prepare('SELECT * FROM feature_flags WHERE key = ?'),
      getAllFlags:       s.prepare('SELECT * FROM feature_flags'),
      setFlag:          s.prepare('INSERT OR REPLACE INTO feature_flags (key, enabled, description, updated_at) VALUES (@key, @enabled, @description, @updated_at)'),

      // Moderation queue
      getModerationItem: s.prepare('SELECT * FROM moderation_queue WHERE id = ?'),
      getModerationQueue: s.prepare('SELECT mq.*, p.name as project_name, u.name as reporter_name FROM moderation_queue mq LEFT JOIN projects p ON mq.project_id = p.id LEFT JOIN users u ON mq.reporter_id = u.id WHERE mq.status = ? ORDER BY mq.created_at DESC'),
      insertModeration: s.prepare('INSERT INTO moderation_queue (id, project_id, reporter_id, reason, status, created_at) VALUES (@id, @project_id, @reporter_id, @reason, @status, @created_at)'),
      updateModeration: s.prepare('UPDATE moderation_queue SET status=@status, reviewer_id=@reviewer_id, reviewed_at=@reviewed_at WHERE id=@id'),

      // Custom components
      getCustomComponent: s.prepare('SELECT * FROM custom_components WHERE id = ?'),
      getCustomComponentsByOwner: s.prepare('SELECT * FROM custom_components WHERE owner_id = ? ORDER BY updated_at DESC'),
      getSharedCustomComponents: s.prepare('SELECT * FROM custom_components WHERE shared = 1 ORDER BY updated_at DESC'),
      insertCustomComponent: s.prepare('INSERT INTO custom_components (id, owner_id, name, description, definition, shared, created_at, updated_at) VALUES (@id, @owner_id, @name, @description, @definition, @shared, @created_at, @updated_at)'),
      updateCustomComponent: s.prepare('UPDATE custom_components SET name=@name, description=@description, definition=@definition, shared=@shared, updated_at=@updated_at WHERE id=@id'),
      deleteCustomComponent: s.prepare('DELETE FROM custom_components WHERE id = ?'),

      // Backups meta
      insertBackupMeta: s.prepare('INSERT INTO backups_meta (filename, size_bytes, type, created_at) VALUES (@filename, @size_bytes, @type, @created_at)'),
      getBackupsMeta:   s.prepare('SELECT * FROM backups_meta ORDER BY created_at DESC'),
      deleteBackupMeta: s.prepare('DELETE FROM backups_meta WHERE filename = ?'),
      countBackups:     s.prepare('SELECT COUNT(*) as count FROM backups_meta'),
      getOldestBackups: s.prepare('SELECT * FROM backups_meta ORDER BY created_at ASC LIMIT ?'),
    };
  }

  /* ---- Helpers ---- */
  transaction(fn) { return this.sqlite.transaction(fn)(); }

  /** Settings as a plain object (cached, refreshed on write) */
  getSettings() {
    const rows = this.stmts.getAllSettings.all();
    const obj = {};
    for (const r of rows) {
      try { obj[r.key] = JSON.parse(r.value); } catch { obj[r.key] = r.value; }
    }
    return obj;
  }

  setSettings(obj) {
    const set = this.sqlite.transaction((o) => {
      for (const [k, v] of Object.entries(o)) {
        this.stmts.setSetting.run(k, JSON.stringify(v));
      }
    });
    set(obj);
  }

  /** Convert a project row (SQLite) to the JSON shape the frontend/API expects */
  projectToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      lang: row.lang,
      board: row.board,
      code: row.code,
      components: JSON.parse(row.components || '[]'),
      wires: JSON.parse(row.wires || '[]'),
      viewport: row.viewport ? JSON.parse(row.viewport) : null,
      tags: JSON.parse(row.tags || '[]'),
      folder: row.folder,
      thumb: row.thumb,
      public: !!row.public,
      forkable: !!row.forkable,
      shareId: row.share_id,
      forkedFrom: row.forked_from,
      forks: row.forks,
      versions: JSON.parse(row.versions || '[]'),
      likers: JSON.parse(row.likers || '[]'),
      desc: row.description || '',
      official: !!row.official,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Convert a project object (API/frontend shape) to row params for SQLite */
  projectToRow(p) {
    return {
      id: p.id,
      owner_id: p.ownerId,
      name: p.name,
      lang: p.lang,
      board: p.board,
      code: p.code,
      components: JSON.stringify(p.components || []),
      wires: JSON.stringify(p.wires || []),
      viewport: p.viewport ? JSON.stringify(p.viewport) : null,
      tags: JSON.stringify(p.tags || []),
      folder: p.folder || '',
      thumb: p.thumb || '',
      public: p.public ? 1 : 0,
      forkable: p.forkable !== false ? 1 : 0,
      share_id: p.shareId || null,
      forked_from: p.forkedFrom || null,
      forks: p.forks || 0,
      versions: JSON.stringify(p.versions || []),
      likers: JSON.stringify(p.likers || []),
      description: p.desc || '',
      official: p.official ? 1 : 0,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
    };
  }

  userToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      pass: row.pass,
      role: row.role,
      avatar: row.avatar,
      suspended: !!row.suspended,
      createdAt: row.created_at,
    };
  }

  userToRow(u) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      pass: u.pass,
      role: u.role || 'user',
      avatar: u.avatar || '🧑‍🔧',
      suspended: u.suspended ? 1 : 0,
      created_at: u.createdAt,
    };
  }

  templateToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      desc: row.description,
      board: row.board,
      lang: row.lang,
      tags: JSON.parse(row.tags || '[]'),
      code: row.code,
      components: JSON.parse(row.components || '[]'),
      wires: JSON.parse(row.wires || '[]'),
      viewport: row.viewport ? JSON.parse(row.viewport) : null,
      isOfficial: !!row.is_official,
      createdAt: row.created_at,
    };
  }

  auditToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      actorId: row.user_id,
      actor: row.user_name,
      action: row.action,
      target: row.target_id,
      meta: row.details ? JSON.parse(row.details) : {},
      ip: row.ip,
      ts: row.ts,
    };
  }

  /* ---- Backup ---- */
  backup(filename) {
    const backupDir = DATA_DIR;
    const fp = path.join(backupDir, filename);
    this.sqlite.backup(fp)
      .then(() => {
        const stat = fs.statSync(fp);
        this.stmts.insertBackupMeta.run({
          filename,
          size_bytes: stat.size,
          type: 'manual',
          created_at: Date.now(),
        });
      })
      .catch(err => {
        console.error('Backup failed:', err);
      });
    return fp;
  }

  backupSync(filename, type) {
    const fp = path.join(DATA_DIR, filename);
    // Synchronous copy for scheduled backups — WAL checkpoint first
    this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(this.dbPath, fp);
    const stat = fs.statSync(fp);
    this.stmts.insertBackupMeta.run({
      filename,
      size_bytes: stat.size,
      type: type || 'scheduled',
      created_at: Date.now(),
    });
    return fp;
  }

  rotateBackups(maxKeep) {
    const count = this.stmts.countBackups.get().count;
    if (count <= maxKeep) return;
    const toDelete = this.stmts.getOldestBackups.all(count - maxKeep);
    for (const b of toDelete) {
      const fp = path.join(DATA_DIR, b.filename);
      try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch { /* ignore */ }
      this.stmts.deleteBackupMeta.run(b.filename);
    }
  }

  /* ---- Health check ---- */
  healthCheck() {
    try {
      this.sqlite.prepare('SELECT 1').get();
      return true;
    } catch { return false; }
  }

  close() {
    try { this.sqlite.close(); } catch { /* ignore */ }
  }
}

module.exports = { CircuitDB, DEFAULT_DB_PATH, DATA_DIR };
