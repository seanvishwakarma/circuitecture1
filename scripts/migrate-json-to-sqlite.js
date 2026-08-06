/* CircuitTecture — Migration script: db.json -> SQLite */
'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../db');

function migrate() {
  const jsonPath = path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('ℹ️ No db.json found at', jsonPath, '— skipping JSON migration.');
    return;
  }

  console.log('🔄 Starting migration from JSON to SQLite...');
  const raw = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('❌ Failed to parse db.json:', err.message);
    process.exit(1);
  }

  const counts = {
    users: 0,
    projects: 0,
    sessions: 0,
    assignments: 0,
    submissions: 0,
    audit: 0,
    settings: 0
  };

  const sqliteRaw = db.raw;

  const txn = sqliteRaw.transaction(() => {
    // 1. Settings
    if (data.settings && typeof data.settings === 'object') {
      db.updateSettings(data.settings);
      counts.settings = Object.keys(data.settings).length;
    }

    // 2. Users
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        if (!u.id || !u.email) continue;
        db.createUser({
          id: u.id,
          name: u.name || 'User',
          email: u.email,
          pass: u.pass || 'disabled',
          role: u.role || 'user',
          bio: u.bio || '',
          suspended: !!u.suspended,
          avatar: u.avatar || '🤖',
          createdAt: u.createdAt || Date.now(),
          updatedAt: u.updatedAt || Date.now()
        });
        counts.users++;
      }
    }

    // 3. Projects & Templates
    if (Array.isArray(data.projects)) {
      for (const p of data.projects) {
        if (!p.id || !p.ownerId) continue;
        db.saveProject({
          id: p.id,
          ownerId: p.ownerId,
          name: p.name || 'Untitled Project',
          desc: p.desc || '',
          board: p.board || 'uno',
          lang: p.lang || 'cpp',
          code: p.code || '',
          thumb: p.thumb || '',
          components: p.components || [],
          wires: p.wires || [],
          tags: p.tags || [],
          viewport: p.viewport || { x: 0, y: 0, z: 1 },
          public: !!p.public,
          forkable: p.forkable !== false,
          official: !!p.official,
          shareId: p.shareId || null,
          likers: p.likers || [],
          forks: p.forks || 0,
          version: p.version || 1,
          createdAt: p.createdAt || Date.now(),
          updatedAt: p.updatedAt || Date.now()
        });
        counts.projects++;
      }
    }

    // 4. Sessions
    if (data.sessions && typeof data.sessions === 'object') {
      for (const [sid, s] of Object.entries(data.sessions)) {
        if (!s || !s.userId) continue;
        // Ensure session's user exists in users table
        if (!db.getUser(s.userId)) continue;
        db.saveSession(sid, {
          userId: s.userId,
          createdAt: s.createdAt || Date.now(),
          exp: s.exp || (Date.now() + 86400000),
          adminUid: s.adminUid
        });
        counts.sessions++;
      }
    }

    // 5. Assignments
    if (Array.isArray(data.assignments)) {
      for (const a of data.assignments) {
        if (!a.id || !a.ownerId) continue;
        if (!db.getUser(a.ownerId)) continue;
        db.saveAssignment({
          id: a.id,
          ownerId: a.ownerId,
          title: a.title || 'Assignment',
          brief: a.brief || '',
          due: a.due || null,
          rubric: a.rubric || '',
          createdAt: a.createdAt || Date.now()
        });
        counts.assignments++;
      }
    }

    // 6. Submissions
    if (Array.isArray(data.submissions)) {
      for (const s of data.submissions) {
        if (!s.id || !s.assignmentId || !s.userId || !s.projectId) continue;
        if (!db.getAssignment(s.assignmentId) || !db.getUser(s.userId) || !db.getProject(s.projectId)) continue;
        db.saveSubmission({
          id: s.id,
          assignmentId: s.assignmentId,
          userId: s.userId,
          projectId: s.projectId,
          grade: s.grade,
          feedback: s.feedback,
          submittedAt: s.submittedAt || Date.now()
        });
        counts.submissions++;
      }
    }

    // 7. Audit log
    if (Array.isArray(data.audit)) {
      for (const entry of data.audit) {
        db.addAuditLog(entry);
        counts.audit++;
      }
    }
  });

  txn();

  // Verification & Spot Checking
  console.log('✅ Migration Transaction Complete. Verifying SQLite counts...');
  const verifyUsers = db.countUsers();
  const verifyProjects = db.countProjects();
  const verifyAudit = db.countAuditLogs();

  console.log(`📊 Migrated Stats:
  - Users: ${counts.users} (DB count: ${verifyUsers})
  - Projects: ${counts.projects} (DB count: ${verifyProjects})
  - Sessions: ${counts.sessions}
  - Assignments: ${counts.assignments}
  - Submissions: ${counts.submissions}
  - Audit Logs: ${counts.audit} (DB count: ${verifyAudit})
  - Settings: ${counts.settings}`);

  if (counts.users !== verifyUsers || counts.projects !== verifyProjects) {
    console.error('❌ Verification check failed! Row counts do not match.');
    process.exit(1);
  }

  // Spot-check first user & project if available
  if (data.users && data.users.length > 0) {
    const firstU = db.getUser(data.users[0].id);
    if (!firstU || firstU.email !== data.users[0].email.toLowerCase()) {
      console.error('❌ Spot check failed for user:', data.users[0].id);
      process.exit(1);
    }
  }
  if (data.projects && data.projects.length > 0) {
    const firstP = db.getProject(data.projects[0].id);
    if (!firstP || firstP.name !== data.projects[0].name) {
      console.error('❌ Spot check failed for project:', data.projects[0].id);
      process.exit(1);
    }
  }

  console.log('🎉 Verification passed successfully!');

  // Rename db.json to db.json.migrated
  const backupPath = jsonPath + '.migrated';
  fs.renameSync(jsonPath, backupPath);
  console.log(`📦 Archived original ${jsonPath} -> ${backupPath}`);
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
