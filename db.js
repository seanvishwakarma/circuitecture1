/* CircuitTecture — SQLite Database Layer */
'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const isTest = !!process.env.VITEST || process.env.NODE_ENV === 'test';
const DB_PATH = process.env.DB_PATH || (isTest ? ':memory:' : path.join(__dirname, 'data', 'circuittecture.db'));

// Ensure data dir exists if not in-memory
if (DB_PATH !== ':memory:') {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const sqlite = new Database(DB_PATH);

if (DB_PATH !== ':memory:') {
  sqlite.pragma('journal_mode = WAL');
}
sqlite.pragma('foreign_keys = ON');

// Initialize Schema
function initSchema() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      bio TEXT DEFAULT '',
      suspended INTEGER NOT NULL DEFAULT 0,
      avatar TEXT DEFAULT '🤖',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      exp INTEGER NOT NULL,
      csrf TEXT,
      adminUid TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(exp);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      name TEXT NOT NULL,
      desc TEXT DEFAULT '',
      board TEXT DEFAULT 'uno',
      lang TEXT DEFAULT 'cpp',
      code TEXT DEFAULT '',
      sketches TEXT NOT NULL DEFAULT '{}',
      thumb TEXT DEFAULT '',
      components TEXT NOT NULL DEFAULT '[]',
      wires TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      viewport TEXT NOT NULL DEFAULT '{"x":0,"y":0,"z":1}',
      public INTEGER NOT NULL DEFAULT 0,
      forkable INTEGER NOT NULL DEFAULT 1,
      official INTEGER NOT NULL DEFAULT 0,
      shareId TEXT UNIQUE,
      likers TEXT NOT NULL DEFAULT '[]',
      forks INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects(ownerId);
    CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(public);
    CREATE INDEX IF NOT EXISTS idx_projects_official ON projects(official);
    CREATE INDEX IF NOT EXISTS idx_projects_shareId ON projects(shareId);

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      title TEXT NOT NULL,
      brief TEXT DEFAULT '',
      due INTEGER,
      rubric TEXT DEFAULT '',
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_ownerId ON assignments(ownerId);

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      assignmentId TEXT NOT NULL,
      userId TEXT NOT NULL,
      projectId TEXT NOT NULL,
      grade REAL,
      feedback TEXT DEFAULT '',
      submittedAt INTEGER NOT NULL,
      FOREIGN KEY (assignmentId) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_assignmentId ON submissions(assignmentId);
    CREATE INDEX IF NOT EXISTS idx_submissions_userId ON submissions(userId);

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      ownerId TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_classes_ownerId ON classes(ownerId);

    CREATE TABLE IF NOT EXISTS class_members (
      classId TEXT NOT NULL,
      userId TEXT NOT NULL,
      joinedAt INTEGER NOT NULL,
      PRIMARY KEY (classId, userId),
      FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_class_members_userId ON class_members(userId);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      userId TEXT,
      userEmail TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      ts INTEGER NOT NULL,
      adminUid TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts);
    CREATE INDEX IF NOT EXISTS idx_audit_log_userId ON audit_log(userId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_queue (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      reporterId TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON moderation_queue(status);

    CREATE TABLE IF NOT EXISTS custom_components (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      label TEXT DEFAULT '',
      category TEXT DEFAULT 'Custom',
      pinDefs TEXT NOT NULL DEFAULT '[]',
      renderSvg TEXT DEFAULT '',
      logicJs TEXT DEFAULT '',
      public INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_custom_components_userId ON custom_components(userId);

    CREATE TABLE IF NOT EXISTS backups_meta (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      size INTEGER NOT NULL,
      isAuto INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT '',
      updatedAt INTEGER NOT NULL
    );
  `);
}

initSchema();

// Legacy cleanup — version history was removed; drop the leftover table from old databases.
sqlite.exec('DROP TABLE IF EXISTS project_versions');

// Auto-migrate missing columns if table already existed
try {
  sqlite.exec('ALTER TABLE sessions ADD COLUMN csrf TEXT');
} catch (_e) {
  // Column already exists or table freshly created
}
try {
  sqlite.exec("ALTER TABLE projects ADD COLUMN sketches TEXT NOT NULL DEFAULT '{}'");
} catch (_e) {
  // Column already exists or table freshly created
}
try {
  sqlite.exec("ALTER TABLE assignments ADD COLUMN classId TEXT");
} catch (_e) {
  // Column already exists or table freshly created
}

// Helper statement caches
const STMT = {
  // Settings
  getAllSettings: sqlite.prepare(`SELECT key, value FROM settings`),
  getSetting: sqlite.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: sqlite.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`),

  // Users
  getUserById: sqlite.prepare(`SELECT * FROM users WHERE id = ?`),
  getUserByEmail: sqlite.prepare(`SELECT * FROM users WHERE email = ?`),
  getAllUsers: sqlite.prepare(`SELECT * FROM users ORDER BY createdAt DESC`),
  countUsers: sqlite.prepare(`SELECT COUNT(*) as count FROM users`),
  insertUser: sqlite.prepare(`
    INSERT INTO users (id, name, email, pass, role, bio, suspended, avatar, createdAt, updatedAt)
    VALUES (@id, @name, @email, @pass, @role, @bio, @suspended, @avatar, @createdAt, @updatedAt)
  `),
  updateUser: sqlite.prepare(`
    UPDATE users SET name = COALESCE(@name, name), email = COALESCE(@email, email), pass = COALESCE(@pass, pass),
    role = COALESCE(@role, role), bio = COALESCE(@bio, bio), suspended = COALESCE(@suspended, suspended),
    avatar = COALESCE(@avatar, avatar), updatedAt = @updatedAt WHERE id = @id
  `),
  deleteUser: sqlite.prepare(`DELETE FROM users WHERE id = ?`),
  reassignProjects: sqlite.prepare(`UPDATE projects SET ownerId = ? WHERE ownerId = ?`),

  // Sessions
  getSession: sqlite.prepare(`SELECT * FROM sessions WHERE sid = ?`),
  getAllSessions: sqlite.prepare(`SELECT * FROM sessions`),
  insertSession: sqlite.prepare(`INSERT OR REPLACE INTO sessions (sid, userId, createdAt, exp, csrf, adminUid) VALUES (?, ?, ?, ?, ?, ?)`),
  deleteSession: sqlite.prepare(`DELETE FROM sessions WHERE sid = ?`),
  deleteSessionsByUserId: sqlite.prepare(`DELETE FROM sessions WHERE userId = ?`),
  deleteSessionsByAdminUid: sqlite.prepare(`DELETE FROM sessions WHERE adminUid = ?`),
  cleanExpiredSessions: sqlite.prepare(`DELETE FROM sessions WHERE exp < ?`),
  deleteAllSessionsExcept: sqlite.prepare(`DELETE FROM sessions WHERE sid != ?`),
  deleteProjectsByOwner: sqlite.prepare(`DELETE FROM projects WHERE ownerId = ?`),
  updateSession: sqlite.prepare(`UPDATE sessions SET userId = ?, adminUid = ? WHERE sid = ?`),

  // Projects
  getProjectById: sqlite.prepare(`SELECT * FROM projects WHERE id = ?`),
  getProjectByShareId: sqlite.prepare(`SELECT * FROM projects WHERE shareId = ?`),
  getAllProjects: sqlite.prepare(`SELECT * FROM projects ORDER BY updatedAt DESC`),
  getUserProjects: sqlite.prepare(`SELECT * FROM projects WHERE ownerId = ? ORDER BY updatedAt DESC`),
  getCommunityProjects: sqlite.prepare(`SELECT * FROM projects WHERE public = 1 ORDER BY updatedAt DESC`),
  getOfficialTemplates: sqlite.prepare(`SELECT * FROM projects WHERE official = 1 ORDER BY updatedAt DESC`),
  countProjects: sqlite.prepare(`SELECT COUNT(*) as count FROM projects`),
  countUserProjects: sqlite.prepare(`SELECT COUNT(*) as count FROM projects WHERE ownerId = ?`),
  insertProject: sqlite.prepare(`
    INSERT INTO projects (id, ownerId, name, desc, board, lang, code, sketches, thumb, components, wires, tags, viewport, public, forkable, official, shareId, likers, forks, version, createdAt, updatedAt)
    VALUES (@id, @ownerId, @name, @desc, @board, @lang, @code, @sketches, @thumb, @components, @wires, @tags, @viewport, @public, @forkable, @official, @shareId, @likers, @forks, @version, @createdAt, @updatedAt)
  `),
  updateProject: sqlite.prepare(`
    UPDATE projects SET name = COALESCE(@name, name), desc = COALESCE(@desc, desc), board = COALESCE(@board, board),
    lang = COALESCE(@lang, lang), code = COALESCE(@code, code), sketches = COALESCE(@sketches, sketches), thumb = COALESCE(@thumb, thumb),
    components = COALESCE(@components, components), wires = COALESCE(@wires, wires), tags = COALESCE(@tags, tags),
    viewport = COALESCE(@viewport, viewport), public = COALESCE(@public, public), forkable = COALESCE(@forkable, forkable),
    official = COALESCE(@official, official), shareId = COALESCE(@shareId, shareId), likers = COALESCE(@likers, likers),
    forks = COALESCE(@forks, forks), version = COALESCE(@version, version), updatedAt = @updatedAt WHERE id = @id
  `),
  deleteProject: sqlite.prepare(`DELETE FROM projects WHERE id = ?`),


  // Assignments & Submissions
  getAllAssignments: sqlite.prepare(`SELECT * FROM assignments ORDER BY createdAt DESC`),
  getAssignmentById: sqlite.prepare(`SELECT * FROM assignments WHERE id = ?`),
  insertAssignment: sqlite.prepare(`INSERT INTO assignments (id, ownerId, classId, title, brief, due, rubric, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  deleteAssignment: sqlite.prepare(`DELETE FROM assignments WHERE id = ?`),
  getAssignmentsByOwner: sqlite.prepare(`SELECT * FROM assignments WHERE ownerId = ? ORDER BY createdAt DESC`),
  getAssignmentsByClass: sqlite.prepare(`SELECT * FROM assignments WHERE classId = ? ORDER BY createdAt DESC`),
  deleteAssignmentsForClass: sqlite.prepare(`DELETE FROM assignments WHERE classId = ?`),

  // Classes
  getClassById: sqlite.prepare(`SELECT * FROM classes WHERE id = ?`),
  getClassByCode: sqlite.prepare(`SELECT * FROM classes WHERE code = ?`),
  getClassesByOwner: sqlite.prepare(`SELECT * FROM classes WHERE ownerId = ? ORDER BY createdAt DESC`),
  insertClass: sqlite.prepare(`INSERT INTO classes (id, name, code, ownerId, createdAt) VALUES (?, ?, ?, ?, ?)`),
  deleteClassRow: sqlite.prepare(`DELETE FROM classes WHERE id = ?`),
  getRoster: sqlite.prepare(`SELECT u.id, u.name, u.email, u.avatar, u.role, m.joinedAt FROM class_members m JOIN users u ON u.id = m.userId WHERE m.classId = ? ORDER BY u.name`),
  getMembership: sqlite.prepare(`SELECT * FROM class_members WHERE classId = ? AND userId = ?`),
  insertMember: sqlite.prepare(`INSERT OR IGNORE INTO class_members (classId, userId, joinedAt) VALUES (?, ?, ?)`),
  deleteMember: sqlite.prepare(`DELETE FROM class_members WHERE classId = ? AND userId = ?`),
  countMembers: sqlite.prepare(`SELECT COUNT(*) as count FROM class_members WHERE classId = ?`),
  getClassesForStudent: sqlite.prepare(`SELECT c.* FROM classes c JOIN class_members m ON m.classId = c.id WHERE m.userId = ? ORDER BY c.createdAt DESC`),
  getSubmissionsForAssignment: sqlite.prepare(`SELECT * FROM submissions WHERE assignmentId = ? ORDER BY submittedAt DESC`),
  getSubmission: sqlite.prepare(`SELECT * FROM submissions WHERE assignmentId = ? AND userId = ?`),
  insertSubmission: sqlite.prepare(`INSERT INTO submissions (id, assignmentId, userId, projectId, grade, feedback, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  updateSubmissionGrade: sqlite.prepare(`UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?`),

  // Audit
  insertAuditLog: sqlite.prepare(`INSERT INTO audit_log (id, userId, userEmail, action, target, details, ip, ts, adminUid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getAuditLogs: sqlite.prepare(`SELECT * FROM audit_log ORDER BY ts DESC LIMIT ? OFFSET ?`),
  countAuditLogs: sqlite.prepare(`SELECT COUNT(*) as count FROM audit_log`),

  // Moderation
  insertModeration: sqlite.prepare(`INSERT INTO moderation_queue (id, projectId, reporterId, reason, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`),
  getModerationQueue: sqlite.prepare(`SELECT * FROM moderation_queue ORDER BY createdAt DESC`),
  updateModerationStatus: sqlite.prepare(`UPDATE moderation_queue SET status = ?, updatedAt = ? WHERE id = ?`),

  // Custom Components
  insertCustomComponent: sqlite.prepare(`INSERT INTO custom_components (id, userId, name, label, category, pinDefs, renderSvg, logicJs, public, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  getUserCustomComponents: sqlite.prepare(`SELECT * FROM custom_components WHERE userId = ? OR public = 1 ORDER BY updatedAt DESC`),
  getCustomComponentById: sqlite.prepare(`SELECT * FROM custom_components WHERE id = ?`),

  // Feature Flags
  getAllFeatureFlags: sqlite.prepare(`SELECT * FROM feature_flags ORDER BY key`),
  getFeatureFlag: sqlite.prepare(`SELECT * FROM feature_flags WHERE key = ?`),
  setFeatureFlag: sqlite.prepare(`INSERT OR REPLACE INTO feature_flags (key, enabled, description, updatedAt) VALUES (?, ?, ?, ?)`),
  deleteFeatureFlag: sqlite.prepare(`DELETE FROM feature_flags WHERE key = ?`),

  // Backups meta
  insertBackupMeta: sqlite.prepare(`INSERT INTO backups_meta (id, filename, createdAt, size, isAuto) VALUES (?, ?, ?, ?, ?)`),
  getBackupsMeta: sqlite.prepare(`SELECT * FROM backups_meta ORDER BY createdAt DESC`),
  deleteBackupMeta: sqlite.prepare(`DELETE FROM backups_meta WHERE id = ?`)
};

// High Level DB API
const dbApi = {
  raw: sqlite,
  safeJSON(str, def) { try { return JSON.parse(str || 'null') || def; } catch { return def; } },
  // Settings
  getSettings() {
    const rows = STMT.getAllSettings.all();
    const settings = {
      signupOpen: true,
      communityEnabled: true,
      maxProjectsPerUser: 10,
      maxUsers: 100,
      rateLimitSignup: 8,
      rateLimitLogin: 10,
      maintenanceMode: false
    };
    for (const r of rows) {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch (e) {
        settings[r.key] = r.value;
      }
    }
    return settings;
  },

  updateSettings(newSettings) {
    const txn = sqlite.transaction((settingsObj) => {
      for (const [k, v] of Object.entries(settingsObj)) {
        STMT.setSetting.run(k, JSON.stringify(v));
      }
    });
    txn(newSettings);
    return dbApi.getSettings();
  },

  // Users
  getUser(id) {
    const u = STMT.getUserById.get(id);
    if (u) u.suspended = !!u.suspended;
    return u || null;
  },

  getUserByEmail(email) {
    if (!email) return null;
    const u = STMT.getUserByEmail.get(email.toLowerCase());
    if (u) u.suspended = !!u.suspended;
    return u || null;
  },

  getAllUsers() {
    return STMT.getAllUsers.all().map(u => ({ ...u, suspended: !!u.suspended }));
  },

  countUsers() {
    return STMT.countUsers.get().count;
  },

  createUser(user) {
    const now = Date.now();
    const u = {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      pass: user.pass,
      role: user.role || 'user',
      bio: user.bio || '',
      suspended: user.suspended ? 1 : 0,
      avatar: user.avatar || '🤖',
      createdAt: user.createdAt || now,
      updatedAt: user.updatedAt || now
    };
    STMT.insertUser.run(u);
    return dbApi.getUser(u.id);
  },

  updateUser(id, changes) {
    const now = Date.now();
    const payload = {
      id,
      name: changes.name !== undefined ? changes.name : null,
      email: changes.email !== undefined ? changes.email.toLowerCase() : null,
      pass: changes.pass !== undefined ? changes.pass : null,
      role: changes.role !== undefined ? changes.role : null,
      bio: changes.bio !== undefined ? changes.bio : null,
      suspended: changes.suspended !== undefined ? (changes.suspended ? 1 : 0) : null,
      avatar: changes.avatar !== undefined ? changes.avatar : null,
      updatedAt: now
    };
    STMT.updateUser.run(payload);
    return dbApi.getUser(id);
  },

  deleteUser(id) {
    const txn = sqlite.transaction((userId) => {
      STMT.deleteUser.run(userId);
    });
    txn(id);
  },

  reassignUserProjects(fromUserId, toUserId) {
    STMT.reassignProjects.run(toUserId, fromUserId);
  },

  // Sessions
  getSession(sid) {
    const s = STMT.getSession.get(sid);
    if (!s) return null;
    return {
      id: s.sid,
      userId: s.userId,
      createdAt: s.createdAt,
      exp: s.exp,
      csrf: s.csrf || null,
      adminUid: s.adminUid || undefined
    };
  },

  getAllSessions() {
    const rows = STMT.getAllSessions.all();
    const map = {};
    for (const r of rows) {
      map[r.sid] = {
        id: r.sid,
        userId: r.userId,
        createdAt: r.createdAt,
        exp: r.exp,
        csrf: r.csrf || null,
        adminUid: r.adminUid || undefined
      };
    }
    return map;
  },

  saveSession(sid, session) {
    STMT.insertSession.run(sid, session.userId, session.createdAt || Date.now(), session.exp, session.csrf || null, session.adminUid || null);
  },

  deleteSession(sid) {
    STMT.deleteSession.run(sid);
  },

  deleteSessionsByUserId(userId) {
    STMT.deleteSessionsByUserId.run(userId);
  },

  deleteSessionsByAdminUid(adminUid) {
    STMT.deleteSessionsByAdminUid.run(adminUid);
  },

  deleteAllSessionsExcept(sid) {
    if (sid) {
      STMT.deleteAllSessionsExcept.run(sid);
    } else {
      sqlite.prepare('DELETE FROM sessions').run();
    }
  },

  deleteProjectsByOwner(ownerId) {
    STMT.deleteProjectsByOwner.run(ownerId);
  },

  updateSession(sid, data) {
    STMT.updateSession.run(data.userId || null, data.adminUid || null, sid);
  },

  optimize() {
    sqlite.pragma('optimize');
  },

  getAuditLog(limit = 100) {
    return dbApi.getAuditLogs(limit, 0);
  },

  cleanExpiredSessions(cutoff) {
    STMT.cleanExpiredSessions.run(cutoff);
  },

  // Projects
  parseProject(p) {
    if (!p) return null;
    const s = (str, def) => dbApi.safeJSON(str, def);
    return {
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      desc: p.desc || '',
      board: p.board || 'uno',
      lang: p.lang || 'cpp',
      code: p.code || '',
      sketches: s(p.sketches, {}),
      thumb: p.thumb || '',
      components: s(p.components, []),
      wires: s(p.wires, []),
      tags: s(p.tags, []),
      viewport: s(p.viewport, { x: 0, y: 0, z: 1 }),
      public: !!p.public,
      forkable: !!p.forkable,
      official: !!p.official,
      shareId: p.shareId || null,
      likers: s(p.likers, []),
      forks: p.forks || 0,
      version: p.version || 1,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    };
  },

  getProject(id) {
    return dbApi.parseProject(STMT.getProjectById.get(id));
  },

  getProjectByShareId(shareId) {
    return dbApi.parseProject(STMT.getProjectByShareId.get(shareId));
  },

  getAllProjects() {
    return STMT.getAllProjects.all().map(dbApi.parseProject);
  },

  getUserProjects(ownerId) {
    return STMT.getUserProjects.all(ownerId).map(dbApi.parseProject);
  },

  getCommunityProjects() {
    return STMT.getCommunityProjects.all().map(dbApi.parseProject);
  },

  getOfficialTemplates() {
    return STMT.getOfficialTemplates.all().map(dbApi.parseProject);
  },

  countProjects() {
    return STMT.countProjects.get().count;
  },

  countUserProjects(userId) {
    return STMT.countUserProjects.get(userId).count;
  },

  saveProject(project) {
    const now = Date.now();
    const payload = {
      id: project.id,
      ownerId: project.ownerId,
      name: project.name,
      desc: project.desc || '',
      board: project.board || 'uno',
      lang: project.lang || 'cpp',
      code: project.code || '',
      sketches: JSON.stringify(project.sketches || {}),
      thumb: project.thumb || '',
      components: JSON.stringify(project.components || []),
      wires: JSON.stringify(project.wires || []),
      tags: JSON.stringify(project.tags || []),
      viewport: JSON.stringify(project.viewport || { x: 0, y: 0, z: 1 }),
      public: project.public ? 1 : 0,
      forkable: project.forkable !== false ? 1 : 0,
      official: project.official ? 1 : 0,
      shareId: project.shareId || null,
      likers: JSON.stringify(project.likers || []),
      forks: project.forks || 0,
      version: project.version || 1,
      createdAt: project.createdAt || now,
      updatedAt: project.updatedAt || now
    };

    const existing = STMT.getProjectById.get(project.id);
    if (existing) {
      STMT.updateProject.run(payload);
    } else {
      STMT.insertProject.run(payload);
    }
    return dbApi.getProject(project.id);
  },

  deleteProject(id) {
    STMT.deleteProject.run(id);
  },

  forkProject(sourceProjectId, newProjectId, newOwnerId, newName) {
    return sqlite.transaction(() => {
      const source = dbApi.getProject(sourceProjectId);
      if (!source) throw new Error('Source project not found');

      const now = Date.now();
      const newProj = {
        ...source,
        id: newProjectId,
        ownerId: newOwnerId,
        name: newName || (source.name + ' (Fork)'),
        public: false,
        official: false,
        shareId: null,
        likers: [],
        forks: 0,
        version: 1,
        createdAt: now,
        updatedAt: now
      };
      dbApi.saveProject(newProj);
      dbApi.saveProject({ ...source, forks: (source.forks || 0) + 1, updatedAt: now });
      return newProj;
    })();
  },

  // Audit
  addAuditLog(entry) {
    const id = entry.id || require('crypto').randomBytes(10).toString('base64url');
    STMT.insertAuditLog.run(
      id,
      entry.userId || null,
      entry.userEmail || null,
      entry.action,
      entry.target,
      typeof entry.details === 'object' ? JSON.stringify(entry.details) : (entry.details || null),
      entry.ip || null,
      entry.ts || Date.now(),
      entry.adminUid || null
    );
  },

  getAuditLogs(limit = 100, offset = 0) {
    return STMT.getAuditLogs.all(limit, offset).map(log => ({
      ...log,
      details: (() => {
        try { return JSON.parse(log.details); } catch (e) { return log.details; }
      })()
    }));
  },

  countAuditLogs() {
    return STMT.countAuditLogs.get().count;
  },

  // Assignments & Submissions
  getAllAssignments() {
    return STMT.getAllAssignments.all();
  },

  getAssignment(id) {
    return STMT.getAssignmentById.get(id) || null;
  },

  saveAssignment(a) {
    STMT.insertAssignment.run(a.id, a.ownerId, a.classId || null, a.title, a.brief || '', a.due || null, a.rubric || '', a.createdAt || Date.now());
    return dbApi.getAssignment(a.id);
  },

  getAssignmentsByOwner(ownerId) {
    return STMT.getAssignmentsByOwner.all(ownerId);
  },

  getAssignmentsByClass(classId) {
    return STMT.getAssignmentsByClass.all(classId);
  },

  // Classes
  createClass(c) {
    STMT.insertClass.run(c.id, c.name, c.code, c.ownerId, c.createdAt || Date.now());
    return STMT.getClassById.get(c.id);
  },

  getClass(id) {
    return STMT.getClassById.get(id) || null;
  },

  getClassByCode(code) {
    return STMT.getClassByCode.get(String(code || '').trim().toUpperCase()) || null;
  },

  getClassesForTeacher(ownerId) {
    return STMT.getClassesByOwner.all(ownerId).map(c => ({ ...c, members: STMT.countMembers.get(c.id).count }));
  },

  getClassesForStudent(userId) {
    return STMT.getClassesForStudent.all(userId).map(c => ({ ...c, members: STMT.countMembers.get(c.id).count }));
  },

  joinClass(classId, userId) {
    STMT.insertMember.run(classId, userId, Date.now());
  },

  leaveClass(classId, userId) {
    STMT.deleteMember.run(classId, userId);
  },

  isClassMember(classId, userId) {
    return !!STMT.getMembership.get(classId, userId);
  },

  getRoster(classId) {
    return STMT.getRoster.all(classId);
  },

  // removes the class, its memberships and its assignments (submissions cascade)
  deleteClass(classId) {
    return sqlite.transaction(() => {
      STMT.deleteAssignmentsForClass.run(classId);
      sqlite.prepare(`DELETE FROM class_members WHERE classId = ?`).run(classId);
      STMT.deleteClassRow.run(classId);
    })();
  },

  deleteAssignment(id) {
    STMT.deleteAssignment.run(id);
  },

  getSubmissionsForAssignment(assignmentId) {
    return STMT.getSubmissionsForAssignment.all(assignmentId);
  },

  getSubmission(assignmentId, userId) {
    return STMT.getSubmission.get(assignmentId, userId) || null;
  },

  saveSubmission(s) {
    const existing = STMT.getSubmission.get(s.assignmentId, s.userId);
    if (existing) {
      sqlite.prepare(`UPDATE submissions SET projectId = ?, grade = ?, feedback = ?, submittedAt = ? WHERE id = ?`)
        .run(s.projectId, s.grade !== undefined ? s.grade : existing.grade, s.feedback !== undefined ? s.feedback : existing.feedback, Date.now(), existing.id);
    } else {
      STMT.insertSubmission.run(s.id, s.assignmentId, s.userId, s.projectId, s.grade || null, s.feedback || '', s.submittedAt || Date.now());
    }
  },

  gradeSubmission(id, grade, feedback) {
    STMT.updateSubmissionGrade.run(grade, feedback, id);
  },

  // Moderation
  addModerationItem(item) {
    const id = item.id || require('crypto').randomBytes(10).toString('base64url');
    const now = Date.now();
    STMT.insertModeration.run(id, item.projectId, item.reporterId, item.reason, 'pending', now, now);
    return id;
  },

  getModerationQueue() {
    return STMT.getModerationQueue.all();
  },

  updateModerationStatus(id, status) {
    STMT.updateModerationStatus.run(status, Date.now(), id);
  },

  // Custom Components
  saveCustomComponent(comp) {
    const now = Date.now();
    STMT.insertCustomComponent.run(
      comp.id,
      comp.userId,
      comp.name,
      comp.label || '',
      comp.category || 'Custom',
      JSON.stringify(comp.pinDefs || []),
      comp.renderSvg || '',
      comp.logicJs || '',
      comp.public ? 1 : 0,
      comp.createdAt || now,
      now
    );
  },

  getUserCustomComponents(userId) {
    return STMT.getUserCustomComponents.all(userId).map(c => ({
      ...c,
      pinDefs: dbApi.safeJSON(c.pinDefs, []),
      public: !!c.public
    }));
  },

  getCustomComponentById(id) {
    const c = STMT.getCustomComponentById.get(id);
    if (!c) return null;
    return {
      ...c,
      pinDefs: dbApi.safeJSON(c.pinDefs, []),
      public: !!c.public
    };
  },

  // Feature Flags
  getFeatureFlags() {
    const rows = STMT.getAllFeatureFlags.all();
    const obj = {};
    for (const r of rows) {
      obj[r.key] = { enabled: !!r.enabled, description: r.description || '', updatedAt: r.updatedAt };
    }
    return obj;
  },

  setFeatureFlag(key, data) {
    STMT.setFeatureFlag.run(key, data.enabled ? 1 : 0, data.description || '', Date.now());
  },

  deleteFeatureFlag(key) {
    STMT.deleteFeatureFlag.run(key);
  },

  // SQLite Native Backup API
  async backupTo(targetPath) {
    const backupDir = path.dirname(targetPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    await sqlite.backup(targetPath);
    const stat = fs.statSync(targetPath);
    const backupId = require('crypto').randomBytes(8).toString('hex');
    STMT.insertBackupMeta.run(backupId, path.basename(targetPath), Date.now(), stat.size, 1);
    return { id: backupId, filename: path.basename(targetPath), size: stat.size };
  },

  getBackupsMeta() {
    return STMT.getBackupsMeta.all();
  },

  deleteBackupMeta(id) {
    STMT.deleteBackupMeta.run(id);
  },

  close() {
    try {
      sqlite.close();
    } catch (e) {
      // ignore if already closed
    }
  }
};

module.exports = dbApi;
