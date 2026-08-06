/* CircuitTecture Admin Panel */
(function () {
  'use strict';

  /* inject admin animation styles */
  (function injectAdminStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .admin-page .adm-content { animation: admFadeIn 0.45s ease both; }
      .admin-page .tab { transition: color 0.25s, border-color 0.25s, background 0.25s; }
      .admin-page .tab.active { border-bottom-color: var(--acc); }
      .admin-page .brand .brand-mark { display: inline-block; animation: admPulse 3s ease-in-out infinite; }
      @keyframes admFadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes admPulse { 0%,100% { filter: drop-shadow(0 0 2px rgba(74,222,128,0.3)); } 50% { filter: drop-shadow(0 0 8px rgba(74,222,128,0.7)); } }
      .adm-glass-card { background: var(--panel2); border: 1px solid var(--line2); border-radius: 12px; padding: 18px; transition: transform 0.3s, box-shadow 0.3s; animation: admFadeIn 0.45s ease both; }
      .adm-glass-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
      .adm-glass-card .adm-sparkline { width: 80px; height: 32px; border-radius: 4px; background: var(--bg1); }
      .adm-health-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
      .adm-health-dot.green { background: var(--ok); box-shadow: 0 0 6px rgba(74,222,128,0.5); }
      .adm-health-dot.yellow { background: var(--warn); box-shadow: 0 0 6px rgba(251,191,36,0.5); }
      .adm-health-dot.red { background: var(--err); box-shadow: 0 0 6px rgba(248,113,113,0.5); }
      .adm-quick-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--line2); background: var(--panel2); border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--ink); transition: all 0.2s; }
      .adm-quick-action-btn:hover { background: var(--acc); color: #000; border-color: var(--acc); transform: translateY(-1px); }
      .adm-row-enter { opacity: 0; transform: translateY(8px); transition: opacity 0.3s ease, transform 0.3s ease; }
      .adm-quick-actions-dropdown { position: relative; display: inline-block; }
      .adm-quick-actions-dropdown .adm-qa-menu { display: none; position: absolute; right: 0; top: 100%; background: var(--panel2); border: 1px solid var(--line2); border-radius: 8px; min-width: 140px; z-index: 20; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
      .adm-quick-actions-dropdown:hover .adm-qa-menu, .adm-quick-actions-dropdown .adm-qa-menu.show { display: block; }
      .adm-qa-menu button { display: block; width: 100%; text-align: left; padding: 6px 12px; border: 0; background: none; color: var(--ink); font-size: 12px; cursor: pointer; border-radius: 4px; }
      .adm-qa-menu button:hover { background: var(--hover); }
      .adm-proj-thumb { width: 40px; height: 30px; border-radius: 4px; background: var(--bg1); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--ink3); border: 1px solid var(--line2); vertical-align: middle; margin-right: 8px; overflow: hidden; }
      .adm-proj-thumb svg { width: 100%; height: 100%; }
      .adm-maintenance-banner-preview { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; padding: 12px 16px; border-radius: 8px; font-size: 13px; text-align: center; margin-top: 12px; }
      .adm-settings-help { font-size: 11px; color: var(--ink3); margin-top: 2px; display: block; }
      .danger-zone { border: 1px solid rgba(248,113,113,0.25); border-radius: 14px; padding: 24px; background: rgba(248,113,113,0.04); margin-top: 20px; }
      .danger-zone .dz-heading { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 800; color: var(--err); margin: 0 0 12px; }
      .danger-zone .dz-heading::before { content: '⚠️'; font-size: 16px; }
      .danger-zone p { color: var(--ink2); font-size: 13px; margin: 0 0 14px; }
    `;
    document.head.appendChild(style);
  })();

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const api = window.CS.api;
  let user = null;
  let currentSection = 'overview';

  /* boot */
  document.addEventListener('DOMContentLoaded', boot);
  async function boot() {
    setupThemeToggle();
    setupTabNav();
    try {
      const me = await api('/api/me');
      user = me.user;
      if (user && user.impersonating) {
        const banner = document.createElement('div');
        banner.className = 'impersonate-banner';
        banner.style.cssText = 'background:#ea580c;color:#fff;text-align:center;padding:8px;font-size:13px;font-weight:700;position:sticky;top:0;z-index:9999;display:flex;justify-content:center;align-items:center;gap:12px';
        banner.innerHTML = `
          <span>⚠️ Impersonating ${esc(user.name)} (${esc(user.email)})</span>
          <button class="btn ghost sm" id="stop-impersonate-btn" style="background:rgba(255,255,255,0.25);color:#fff;border:0;padding:2px 10px;font-weight:700;cursor:pointer">Stop Impersonation</button>
        `;
        document.body.prepend(banner);
        document.getElementById('stop-impersonate-btn').addEventListener('click', async () => {
          const r = await api('/api/impersonate/stop', 'POST');
          if (r.ok) {
            CS.toast('Restored admin session');
            location.reload();
          }
        });
      }
      if (!user || user.role !== 'admin') {
        showError('Access denied. Admin privileges required.');
        return;
      }
      if (user.role === 'admin' && user.defaultAdminPassActive && !localStorage.getItem('admin-password-warned')) {
        localStorage.setItem('admin-password-warned', '1');
        setTimeout(() => {
          const body = document.createElement('div');
          body.innerHTML = `
            <p>⚠️ <strong>Security Warning:</strong> You are still using the default administrator password (<code>admin1234</code>).</p>
            <p>Please change your password immediately to protect your server.</p>
            <label style="margin-top:12px;display:block">New Password:
              <input type="password" id="warn-new-pass" class="adm-input" placeholder="Min 8 characters, letters & numbers" style="width:100%;margin-top:4px">
            </label>
          `;
          const m = CS.modal({ title: 'Change Default Admin Password', body });
          const btn = document.createElement('button');
          btn.className = 'btn primary block';
          btn.textContent = 'Update Password';
          btn.addEventListener('click', async () => {
            const pass = document.getElementById('warn-new-pass').value;
            if (!pass || pass.length < 8) return CS.toast('Password must be 8+ chars', 'error');
            await api('/api/admin/users/' + user.id, 'PUT', { pass });
            m.close();
            CS.toast('Password updated successfully');
          });
          m.body.appendChild(btn);
        }, 1000);
      }
      renderChip();
      await loadSection('overview');
      document.getElementById('adm-content').classList.remove('hidden');
      document.querySelector('.adm-loading').classList.add('hidden');
    } catch (e) {
      if (e.message === 'auth' || e.status === 401) {
        showError('Not authenticated. Please <a href="/">log in</a> as an admin.');
      } else {
        showError('Failed to load admin panel: ' + esc(e.message));
      }
    }
  }

  function showError(msg) {
    document.querySelector('.adm-loading').classList.add('hidden');
    const el = document.getElementById('adm-content');
    el.classList.remove('hidden');
    el.innerHTML = '<div class="empty-state" style="margin-top:60px"><span class="e-icon">🛡️</span><h3>' + msg + '</h3></div>';
  }

  function renderChip() {
    const chip = document.getElementById('admin-user-chip');
    if (!user) { chip.innerHTML = ''; return; }
    chip.innerHTML = `<span class="a-face">${esc(user.avatar || '🛡️')}</span><span>${esc(user.name)}</span>`;
    chip.title = 'Admin: ' + user.email;
  }

  /* theme toggle */
  function setupThemeToggle() {
    const btn = document.getElementById('admin-theme-btn');
    const html = document.documentElement;
    const stored = localStorage.getItem('ct-theme');
    if (stored) html.setAttribute('data-theme', stored);
    updateThemeBtn(html.getAttribute('data-theme'));
    btn.addEventListener('click', () => {
      const cur = html.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      localStorage.setItem('ct-theme', next);
      updateThemeBtn(next);
    });
  }
  function updateThemeBtn(theme) {
    const btn = document.getElementById('admin-theme-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* tab navigation */
  function setupTabNav() {
    document.querySelectorAll('.admin-tabs .tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        document.querySelectorAll('.admin-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentSection = tab.dataset.section;
        document.getElementById('adm-content').innerHTML = '<div class="adm-loading"><span class="spinner"></span><span>Loading ' + currentSection + '…</span></div>';
        await loadSection(currentSection);
      });
    });
  }

  async function loadSection(section) {
    const el = document.getElementById('adm-content');
    try {
      switch (section) {
        case 'overview': await renderOverview(el); break;
        case 'users': await renderUsers(el); break;
        case 'projects': await renderProjects(el); break;
        case 'settings': await renderSettings(el); break;
        case 'security': await renderSecurity(el); break;
        case 'database': await renderDatabase(el); break;
        case 'activity': await renderActivity(el); break;
        case 'moderation': await renderModeration(el); break;
        case 'flags': await renderFeatureFlags(el); break;
        case 'templates': await renderTemplates(el); break;
        case 'operations': await renderOperations(el); break;
      }
    } catch (e) {
      el.innerHTML = '<div class="empty-state"><span class="e-icon">⚠️</span><h3>Failed to load ' + section + '</h3><p>' + esc(e.message) + '</p></div>';
    }
  }

  function renderSparkline(hist) {
    if (!hist || !hist.length) return '';
    const maxVal = Math.max(1, ...hist.map(h => Math.max(h.signups, h.sims)));
    const width = 500, height = 150;
    const paddingLeft = 30, paddingRight = 10, paddingTop = 20, paddingBottom = 30;
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;
    
    const getX = i => paddingLeft + i * (graphWidth / (hist.length - 1));
    const getY = val => height - paddingBottom - (val / maxVal) * graphHeight;
    
    let signupPath = '', simPath = '';
    hist.forEach((h, i) => {
      const x = getX(i);
      const ys = getY(h.signups);
      const ym = getY(h.sims);
      if (i === 0) {
        signupPath = `M ${x} ${ys}`;
        simPath = `M ${x} ${ym}`;
      } else {
        signupPath += ` L ${x} ${ys}`;
        simPath += ` L ${x} ${ym}`;
      }
    });
    
    return `
      <div class="adm-card" style="margin-top:20px">
        <h3>System Activity (Last 14 Days)</h3>
        <div style="display:flex;gap:16px;font-size:11px;color:var(--ink3);margin-bottom:8px">
          <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:3px;background:#22d3ee"></span> Signups</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:12px;height:3px;background:#4ade80"></span> Simulation Runs</span>
        </div>
        <svg viewBox="0 0 ${width} ${height}" style="width:100%;max-height:160px;background:var(--panel2);border-radius:8px;padding:8px">
          <line x1="${paddingLeft}" y1="${getY(0)}" x2="${width - paddingRight}" y2="${getY(0)}" stroke="var(--line2)" stroke-width="1"/>
          <line x1="${paddingLeft}" y1="${getY(maxVal / 2)}" x2="${width - paddingRight}" y2="${getY(maxVal / 2)}" stroke="var(--line2)" stroke-width="1" stroke-dasharray="4 4"/>
          <line x1="${paddingLeft}" y1="${getY(maxVal)}" x2="${width - paddingRight}" y2="${getY(maxVal)}" stroke="var(--line2)" stroke-width="1" stroke-dasharray="4 4"/>
          
          <text x="${paddingLeft - 6}" y="${getY(0) + 3}" fill="var(--ink3)" font-size="9" text-anchor="end">0</text>
          <text x="${paddingLeft - 6}" y="${getY(maxVal / 2) + 3}" fill="var(--ink3)" font-size="9" text-anchor="end">${Math.round(maxVal / 2)}</text>
          <text x="${paddingLeft - 6}" y="${getY(maxVal) + 3}" fill="var(--ink3)" font-size="9" text-anchor="end">${maxVal}</text>
          
          ${hist.map((h, i) => i % 3 === 0 || i === hist.length - 1 ? `<text x="${getX(i)}" y="${height - 10}" fill="var(--ink3)" font-size="9" text-anchor="middle">${h.date}</text>` : '').join('')}
          
          <path d="${signupPath}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${simPath}" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          
          ${hist.map((h, i) => `
            <circle cx="${getX(i)}" cy="${getY(h.signups)}" r="3" fill="#22d3ee"/>
            <circle cx="${getX(i)}" cy="${getY(h.sims)}" r="3" fill="#4ade80"/>
          `).join('')}
        </svg>
      </div>
    `;
  }

  function drawSparkline(canvasId, data, color) {
    const cv = document.getElementById(canvasId);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight;
    ctx.clearRect(0, 0, W, H);
    if (!data || data.length < 2) return;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    ctx.strokeStyle = color || '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * (W - 2) + 1;
      const y = H - 2 - ((v - min) / range) * (H - 4);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(W - 2, H - 2);
    ctx.lineTo(1, H - 2);
    ctx.closePath();
    ctx.fillStyle = color ? color + '22' : 'rgba(74,222,128,0.12)';
    ctx.fill();
  }

  /* ============ OVERVIEW ============ */
  async function renderOverview(el) {
    const [statsRes, sysRes] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/system')
    ]);
    const s = statsRes.stats || {};
    const sys = sysRes.system || {};
    const memMB = n => (n / 1024 / 1024).toFixed(1);
    const hist = s.activityHistory || [];
    const sparkData = hist.length ? hist.map(h => h.signups + h.sims) : [5, 12, 8, 15, 10, 20, 18, 25, 22, 30, 28, 35, 32, 40];

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header">
          <h2>System Overview</h2>
          <span class="adm-badge ${s.suspended > 2 ? 'warn' : 'ok'}">${s.users} users · ${s.projects} projects</span>
          <span id="adm-realtime-clock" style="margin-left:auto;font-size:12px;color:var(--ink3);font-family:monospace"></span>
        </div>
        <div class="adm-stat-grid">
          <div class="adm-glass-card" style="animation-delay:0.05s">
            <span class="adm-stat-icon">👥</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${s.users}</span>
              <span class="adm-stat-label">Total Users</span>
              <span class="adm-stat-sub">${s.activeUsers} active · ${s.suspended} suspended</span>
            </div>
            <canvas class="adm-sparkline" id="spark-users" style="display:block;margin-top:8px"></canvas>
          </div>
          <div class="adm-glass-card" style="animation-delay:0.10s">
            <span class="adm-stat-icon">📐</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${s.projects}</span>
              <span class="adm-stat-label">Total Projects</span>
              <span class="adm-stat-sub">${s.publicProjects} public</span>
            </div>
            <canvas class="adm-sparkline" id="spark-projects" style="display:block;margin-top:8px"></canvas>
          </div>
          <div class="adm-glass-card" style="animation-delay:0.15s">
            <span class="adm-stat-icon">💾</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${(s.storageBytes / 1024).toFixed(0)}</span>
              <span class="adm-stat-label">Database Size</span>
              <span class="adm-stat-sub">${memMB(sys.dbFile)} KB on disk</span>
            </div>
            <canvas class="adm-sparkline" id="spark-db" style="display:block;margin-top:8px"></canvas>
          </div>
          <div class="adm-glass-card" style="animation-delay:0.20s">
            <span class="adm-stat-icon">⚡</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${Math.floor(sys.uptime / 3600)}h ${Math.floor((sys.uptime % 3600) / 60)}m</span>
              <span class="adm-stat-label">Server Uptime</span>
              <span class="adm-stat-sub">Node ${sys.node} · ${sys.platform}</span>
            </div>
            <canvas class="adm-sparkline" id="spark-uptime" style="display:block;margin-top:8px"></canvas>
          </div>
          <div class="adm-glass-card" style="animation-delay:0.25s">
            <span class="adm-stat-icon">🧠</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${memMB(sys.memory?.heapUsed)}</span>
              <span class="adm-stat-label">Heap Used</span>
              <span class="adm-stat-sub">${memMB(sys.memory?.heapTotal)} total · ${memMB(sys.memory?.rss)} RSS</span>
            </div>
            <canvas class="adm-sparkline" id="spark-heap" style="display:block;margin-top:8px"></canvas>
          </div>
          <div class="adm-glass-card" style="animation-delay:0.30s">
            <span class="adm-stat-icon">🔗</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${sys.sessions}</span>
              <span class="adm-stat-label">Active Sessions</span>
              <span class="adm-stat-sub">PID ${sys.pid}</span>
            </div>
            <canvas class="adm-sparkline" id="spark-sessions" style="display:block;margin-top:8px"></canvas>
          </div>
        </div>

        <div class="adm-glass-card" style="margin-top:20px;animation-delay:0.35s;padding:16px">
          <h3 style="margin:0 0 12px 0">Quick Actions</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="adm-quick-action-btn" data-action="backup">💾 Create Backup</button>
            <button class="adm-quick-action-btn" data-action="optimize">⚡ Optimize DB</button>
            <button class="adm-quick-action-btn" data-action="export-audit">📋 Export Audit</button>
            <button class="adm-quick-action-btn" data-action="sysinfo">ℹ️ System Info</button>
            <button class="adm-quick-action-btn" data-action="refresh">🔄 Refresh</button>
          </div>
        </div>

        <div class="adm-glass-card" style="margin-top:16px;animation-delay:0.40s;padding:16px">
          <h3 style="margin:0 0 12px 0">System Health</h3>
          <div style="display:flex;gap:20px;flex-wrap:wrap">
            <span><span class="adm-health-dot green"></span> Database</span>
            <span><span class="adm-health-dot green"></span> Session Store</span>
            <span><span class="adm-health-dot green"></span> Rate Limiter</span>
            <span><span class="adm-health-dot green"></span> WebSocket</span>
          </div>
        </div>

        ${renderSparkline(s.activityHistory)}
        ${s.topComponents && s.topComponents.length ? `
        <div class="adm-card" style="margin-top:20px;animation:admFadeIn 0.45s ease 0.45s both">
          <h3>Top Components</h3>
          <div class="adm-comp-list">
            ${s.topComponents.map(([type, count]) => `
              <div class="adm-comp-item">
                <span class="adm-comp-name">${esc(type)}</span>
                <div class="adm-comp-bar-bg"><div class="adm-comp-bar" style="width:${Math.min(100, (count / Math.max(...s.topComponents.map(x=>x[1])) * 100))}%"></div></div>
                <span class="adm-comp-count">${count}</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;

    /* draw sparklines */
    setTimeout(() => {
      drawSparkline('spark-users', sparkData, '#22d3ee');
      drawSparkline('spark-projects', sparkData, '#4ade80');
      drawSparkline('spark-db', sparkData, '#f59e0b');
      drawSparkline('spark-uptime', sparkData, '#60a5fa');
      drawSparkline('spark-heap', sparkData, '#a78bfa');
      drawSparkline('spark-sessions', sparkData, '#f472b6');
    }, 100);

    /* real-time clock */
    function updateClock() {
      const c = document.getElementById('adm-realtime-clock');
      if (c) c.textContent = new Date().toLocaleString();
    }
    updateClock();
    if (window._admClockInterval) clearInterval(window._admClockInterval);
    window._admClockInterval = setInterval(updateClock, 1000);

    el.querySelector('[data-action="backup"]').addEventListener('click', () => doBackup());
    el.querySelector('[data-action="optimize"]').addEventListener('click', () => doOptimize());
    el.querySelector('[data-action="export-audit"]').addEventListener('click', () => { location.href = '/api/admin/export/audit'; });
    el.querySelector('[data-action="sysinfo"]').addEventListener('click', () => {
      CS.toast('Node ' + sys.node + ' · ' + sys.platform + ' · PID ' + sys.pid + ' · Heap ' + memMB(sys.memory?.heapUsed) + 'MB');
    });
    el.querySelector('[data-action="refresh"]').addEventListener('click', () => loadSection('overview'));
  }

  /* ============ USERS ============ */
  async function renderUsers(el) {
    const res = await api('/api/admin/users');
    const users = res.users || [];

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header">
          <h2>User Management</h2>
          <div class="adm-actions-right">
            <input type="search" id="adm-user-search" class="adm-filter" placeholder="Search users…" style="width:240px">
            <button class="btn primary sm" id="adm-create-user">＋ New User</button>
          </div>
        </div>
        <div class="adm-bulk-actions hidden" id="bulk-actions-bar" style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center; background: var(--bg2); padding: 8px 12px; border-radius: 8px; border: 1px dashed var(--line2);">
          <span style="font-size:12px;color:var(--ink3)" id="bulk-selected-count">0 users selected</span>
          <button class="btn sm" data-bulk-action="suspend">⛔ Suspend</button>
          <button class="btn sm" data-bulk-action="unsuspend">✅ Unsuspend</button>
          <button class="btn danger sm" data-bulk-action="delete">🗑️ Delete</button>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr>
              <th style="width:30px;text-align:center"><input type="checkbox" id="bulk-select-all"></th>
              <th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Projects</th><th>Created</th><th>Actions</th>
            </tr></thead>
            <tbody id="adm-user-tbody">
              ${users.map(u => `
                <tr data-id="${esc(u.id)}">
                  <td style="text-align:center"><input type="checkbox" class="user-bulk-cb" data-id="${esc(u.id)}"></td>
                  <td><span class="adm-user-avatar">${esc(u.avatar || '👤')}</span> <strong>${esc(u.name)}</strong></td>
                  <td><span class="adm-email">${esc(u.email)}</span></td>
                  <td>
                    <select class="adm-input sm user-role-select" data-id="${esc(u.id)}" style="width:80px;padding:2px 4px;font-size:11px">
                      <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                  </td>
                  <td>${u.suspended ? '<span class="adm-badge err">Suspended</span>' : '<span class="adm-badge ok">Active</span>'}</td>
                  <td>${u.projectCount || 0}</td>
                  <td><span class="adm-date">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</span></td>
                  <td class="adm-actions-cell">
                    <button class="btn ghost xs" data-impersonate="${esc(u.id)}" title="Impersonate user">👤</button>
                    <button class="btn ghost xs" data-edit="${esc(u.id)}" title="Edit user">✏️</button>
                    <button class="btn ghost xs" data-suspend="${esc(u.id)}" title="${u.suspended ? 'Unsuspend' : 'Suspend'}">${u.suspended ? '✅' : '⛔'}</button>
                    <button class="btn danger xs" data-delete="${esc(u.id)}" title="Delete user">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${!users.length ? '<div class="empty-state" style="margin-top:20px"><h3>No users found</h3></div>' : ''}
      </div>`;

    /* staggered row animation */
    requestAnimationFrame(() => {
      const rows = el.querySelectorAll('#adm-user-tbody tr');
      rows.forEach((row, i) => {
        row.style.opacity = '0';
        row.style.transform = 'translateY(8px)';
        row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        requestAnimationFrame(() => {
          row.style.opacity = '1';
          row.style.transform = 'translateY(0)';
        });
      });
    });

    /* search filter */
    const searchInput = document.getElementById('adm-user-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      document.querySelectorAll('#adm-user-tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    /* bulk selections listener */
    const selectAllCb = document.getElementById('bulk-select-all');
    const bulkCbs = el.querySelectorAll('.user-bulk-cb');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const bulkCountText = document.getElementById('bulk-selected-count');

    const updateBulkBar = () => {
      const checked = el.querySelectorAll('.user-bulk-cb:checked');
      if (checked.length) {
        bulkBar.classList.remove('hidden');
        bulkCountText.textContent = `${checked.length} user${checked.length > 1 ? 's' : ''} selected`;
      } else {
        bulkBar.classList.add('hidden');
      }
    };

    selectAllCb.addEventListener('change', () => {
      bulkCbs.forEach(cb => {
        if (cb.offsetParent !== null) { // only visible rows
          cb.checked = selectAllCb.checked;
        }
      });
      updateBulkBar();
    });

    bulkCbs.forEach(cb => cb.addEventListener('change', updateBulkBar));

    /* bulk actions buttons */
    el.querySelectorAll('[data-bulk-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.bulkAction;
        const checked = Array.from(el.querySelectorAll('.user-bulk-cb:checked'));
        const ids = checked.map(cb => cb.dataset.id);
        if (!ids.length) return;

        if (action === 'delete') {
          if (!confirm(`Are you sure you want to delete the ${ids.length} selected users? This action is destructive and irreversible.`)) return;
          await Promise.all(ids.map(id => api('/api/admin/users/' + id, 'DELETE', null, { mode: 'cascade' })));
          CS.toast('Selected users deleted');
        } else {
          if (!confirm(`Are you sure you want to ${action} the ${ids.length} selected users?`)) return;
          await Promise.all(ids.map(id => api('/api/admin/users/' + id, 'PUT', { suspended: action === 'suspend' })));
          CS.toast(`Selected users ${action}ed`);
        }
        renderUsers(el);
      });
    });

    /* role select dropdown */
    el.querySelectorAll('.user-role-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const role = sel.value;
        const u = users.find(x => x.id === id);
        if (u.id === (user && user.id)) { CS.toast('Cannot change your own role', 'error'); renderUsers(el); return; }
        await api('/api/admin/users/' + id, 'PUT', { role });
        CS.toast(`User role updated to ${role}`);
        renderUsers(el);
      });
    });

    /* impersonate user */
    el.querySelectorAll('[data-impersonate]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.impersonate;
      const u = users.find(x => x.id === id);
      if (u.id === (user && user.id)) { CS.toast('Cannot impersonate yourself', 'error'); return; }
      if (!confirm(`Impersonate as ${u.name}?`)) return;
      const r = await api('/api/admin/impersonate/' + id, 'POST');
      if (r.ok) {
        CS.toast('Impersonating ' + r.user.name);
        location.href = '/dashboard';
      }
    }));

    /* bind actions */
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editUser(b.dataset.edit)));
    el.querySelectorAll('[data-suspend]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.suspend, u = users.find(x => x.id === id);
      if (u.id === (user && user.id)) { CS.toast('Cannot suspend yourself', 'error'); return; }
      if (!confirm(`Are you sure you want to ${u.suspended ? 'unsuspend' : 'suspend'} user ${u.name}?`)) return;
      await api('/api/admin/users/' + id, 'PUT', { suspended: !u.suspended });
      CS.toast(u.suspended ? 'Unsuspended' : 'Suspended');
      renderUsers(el);
    }));
    el.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteUser(b.dataset.delete, users)));
    document.getElementById('adm-create-user').addEventListener('click', () => createUser());
  }

  async function editUser(id) {
    const res = await api('/api/admin/users');
    const u = res.users.find(x => x.id === id);
    if (!u) return;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="adm-form">
        <label>Name <input id="eu-name" value="${esc(u.name)}" class="adm-input"></label>
        <label>Email <input id="eu-email" value="${esc(u.email)}" class="adm-input"></label>
        <label>Avatar <input id="eu-avatar" value="${esc(u.avatar || '👤')}" class="adm-input" maxlength="8"></label>
        <label>Role <select id="eu-role" class="adm-input">
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select></label>
        <label>New password (leave blank to keep) <input id="eu-pass" type="password" class="adm-input" placeholder="Leave blank to keep"></label>
        <div class="adm-form-note">Projects: ${u.projectCount || 0} · Created: ${u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}</div>
      </div>`;
    const m = CS.modal({ title: 'Edit User: ' + esc(u.name), body });
    const btn = document.createElement('button'); btn.className = 'btn primary block'; btn.textContent = 'Save Changes';
    btn.addEventListener('click', async () => {
      const data = { name: document.getElementById('eu-name').value, email: document.getElementById('eu-email').value, avatar: document.getElementById('eu-avatar').value, role: document.getElementById('eu-role').value };
      const pass = document.getElementById('eu-pass').value;
      if (pass) data.pass = pass;
      await api('/api/admin/users/' + id, 'PUT', data);
      m.close(); CS.toast('User updated');
      loadSection('users');
    });
    m.body.appendChild(btn);
  }

  async function createUser() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="adm-form">
        <label>Name <input id="cu-name" class="adm-input" placeholder="Full name" autofocus></label>
        <label>Email <input id="cu-email" type="email" class="adm-input" placeholder="user@example.com"></label>
        <label>Password <input id="cu-pass" type="password" class="adm-input" placeholder="Min 8 characters"></label>
        <label>Role <select id="cu-role" class="adm-input">
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select></label>
      </div>`;
    const m = CS.modal({ title: 'Create New User', body });
    const btn = document.createElement('button'); btn.className = 'btn primary block'; btn.textContent = 'Create User';
    btn.addEventListener('click', async () => {
      const name = document.getElementById('cu-name').value, email = document.getElementById('cu-email').value, pass = document.getElementById('cu-pass').value, role = document.getElementById('cu-role').value;
      if (!name || !email || !pass || pass.length < 8) { CS.toast('Name, email, and 8+ char password required', 'error'); return; }
      await api('/api/admin/users', 'POST', { name, email, pass, role });
      m.close(); CS.toast('User created');
      loadSection('users');
    });
    m.body.appendChild(btn);
  }

  async function deleteUser(id, users) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    if (u.id === (user && user.id)) { CS.toast('Cannot delete yourself', 'error'); return; }
    const body = document.createElement('div');
    body.innerHTML = `<p>Delete user <strong>${esc(u.email)}</strong>?</p>
      <p style="font-size:12px;color:var(--ink3)">Their ${u.projectCount || 0} projects will also be deleted.</p>
      <label style="font-size:12px;display:flex;align-items:center;gap:8px;margin-top:8px">
        <input type="checkbox" id="reassign-projects"> Reassign projects to me instead
      </label>`;
    const m = CS.modal({ title: 'Delete User', body });
    const btn = document.createElement('button'); btn.className = 'btn danger block'; btn.textContent = 'Delete User';
    btn.addEventListener('click', async () => {
      const reassign = document.getElementById('reassign-projects').checked;
      await api('/api/admin/users/' + id, 'DELETE', { confirm: 'DELETE', mode: reassign ? 'reassign' : 'cascade' });
      m.close(); CS.toast('User deleted');
      loadSection('users');
    });
    m.body.appendChild(btn);
  }

  /* ============ PROJECTS ============ */
  async function renderProjects(el) {
    const res = await api('/api/admin/projects');
    const projects = res.projects || [];


    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header">
          <h2>Project Management</h2>
          <input type="search" id="adm-proj-search" class="adm-filter" placeholder="Search projects…" style="width:240px">
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr>
              <th>Name</th><th>Owner</th><th>Board</th><th>Visibility</th><th>Template</th><th>Updated</th><th>Actions</th>
            </tr></thead>
            <tbody id="adm-proj-tbody">
              ${projects.map(p => {
                const comps = p.components || [];
                const svgParts = comps.slice(0, 6).map(c => {
                  const colors = ['#22d3ee', '#4ade80', '#f59e0b', '#60a5fa', '#a78bfa', '#f472b6'];
                  return `<circle cx="${10 + Math.random() * 20}" cy="${5 + Math.random() * 20}" r="2" fill="${colors[Math.floor(Math.random() * colors.length)]}"/>`;
                }).join('');
                return `
                <tr data-id="${esc(p.id)}">
                  <td>
                    <span class="adm-proj-thumb"><svg viewBox="0 0 30 22">${svgParts}</svg></span>
                    <a href="/editor?id=${esc(p.id)}" style="color:var(--acc);text-decoration:none;font-weight:600" target="_blank">${esc(p.name)}</a>
                  </td>
                  <td><span class="adm-email">${esc((p.owner && p.owner.email) || '—')}</span></td>
                  <td>${esc(p.board || '—')}</td>
                  <td>${p.public ? '<span class="adm-badge ok">Public</span>' : '<span class="adm-badge">Private</span>'}</td>
                  <td>${p.official ? '<span class="adm-badge vio">⭐ Template</span>' : '—'}</td>
                  <td><span class="adm-date">${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</span></td>
                  <td class="adm-actions-cell">
                    <a href="/editor?id=${esc(p.id)}" class="btn primary xs" style="text-decoration:none" target="_blank">🔍 Open</a>
                    <button class="btn ghost xs" data-editp="${esc(p.id)}">✏️</button>
                    <button class="btn ghost xs" data-pub="${esc(p.id)}">${p.public ? '🔒' : '🌍'}</button>
                    <button class="btn ghost xs" data-tmpl="${esc(p.id)}">${p.official ? '⭐' : '📋'}</button>
                    <button class="btn danger xs" data-delp="${esc(p.id)}">🗑️</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${!projects.length ? '<div class="empty-state" style="margin-top:20px"><h3>No projects found</h3></div>' : ''}
      </div>`;

    /* debounced search filter */
    const searchInput = document.getElementById('adm-proj-search');
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = searchInput.value.toLowerCase();
        document.querySelectorAll('#adm-proj-tbody tr').forEach(tr => {
          tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      }, 250);
    });

    el.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { window.open('/editor?id=' + b.dataset.open, '_blank'); }));
    el.querySelectorAll('[data-editp]').forEach(b => b.addEventListener('click', () => editProject(b.dataset.editp)));
    el.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.pub);
      await api('/api/admin/projects/' + p.id, 'PUT', { public: !p.public });
      CS.toast(p.public ? 'Unpublished' : 'Published');
      renderProjects(el);
    }));
    el.querySelectorAll('[data-tmpl]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.tmpl);
      await api('/api/admin/projects/' + p.id, 'PUT', { official: !p.official });
      CS.toast(p.official ? 'Unmarked template' : 'Marked as template');
      renderProjects(el);
    }));
    el.querySelectorAll('[data-delp]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.delp);
      if (!p) return;
      if (!confirm('Delete project "' + p.name + '"?')) return;
      await api('/api/admin/projects/' + p.id, 'DELETE');
      CS.toast('Project deleted');
      renderProjects(el);
    }));
  }

  function editProject(id) {
    window.open('/editor?id=' + id, '_blank');
  }

  /* ============ SETTINGS ============ */
  async function renderSettings(el) {
    const res = await api('/api/admin/settings');
    const settings = res.settings || {};

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>System Settings</h2></div>
        <div class="adm-settings-grid">
          <div class="adm-card">
            <h3>General</h3>
            <label class="adm-toggle"><input type="checkbox" id="set-signup" ${settings.signupOpen !== false ? 'checked' : ''}><span class="adm-toggle-slider"></span> Allow new user signups <span class="adm-settings-help">When disabled, only admins can create accounts</span></label>
            <label class="adm-toggle"><input type="checkbox" id="set-community" ${settings.communityEnabled !== false ? 'checked' : ''}><span class="adm-toggle-slider"></span> Enable community publishing <span class="adm-settings-help">Let users publish circuits to the community gallery</span></label>
            <label class="adm-toggle"><input type="checkbox" id="set-maintenance" ${settings.maintenanceMode ? 'checked' : ''}><span class="adm-toggle-slider"></span> Maintenance mode <span class="adm-settings-help">Blocks non-admin access and shows a maintenance notice</span></label>
            <div id="maintenance-preview-area" style="${settings.maintenanceMode ? '' : 'display:none'}">
              <div class="adm-maintenance-banner-preview">🔧 Maintenance Mode is ON — regular users will see a maintenance notice</div>
            </div>
            <div class="adm-field">
              <label>Max projects per user <span class="adm-settings-help">Limits how many circuits a single user can create</span></label>
              <input type="number" id="set-max-projects" class="adm-input" style="width:100px" value="${settings.maxProjectsPerUser || 50}">
            </div>
            <div class="adm-field">
              <label>Session lifetime (hours) <span class="adm-settings-help">How long before an idle session expires</span></label>
              <input type="number" id="set-session-hours" class="adm-input" style="width:100px" value="${Math.round((settings.sessionTTL || 86400000) / 3600000) || 24}">
            </div>
            <div class="adm-field">
              <label>Signup Rate Limit (attempts/10m) <span class="adm-settings-help">Max signup attempts from one IP per 10 minutes</span></label>
              <input type="number" id="set-rate-signup" class="adm-input" style="width:100px" value="${settings.rateLimitSignup || 8}">
            </div>
            <div class="adm-field">
              <label>Login Rate Limit (attempts/5m) <span class="adm-settings-help">Max login attempts from one IP per 5 minutes</span></label>
              <input type="number" id="set-rate-login" class="adm-input" style="width:100px" value="${settings.rateLimitLogin || 48}">
            </div>
          </div>
          <div class="adm-card">
            <h3>Branding</h3>
            <div class="adm-field">
              <label>Site name <span class="adm-settings-help">Displayed in the browser title bar and branding</span></label>
              <input id="set-site-name" class="adm-input" value="${esc(settings.siteName || 'CircuitTecture')}">
            </div>
            <div class="adm-field">
              <label>Default avatar <span class="adm-settings-help">Emoji shown for users without a custom avatar</span></label>
              <input id="set-default-avatar" class="adm-input" style="width:60px" value="${esc(settings.defaultAvatar || '🧑‍🔧')}" maxlength="8">
            </div>
            <div class="adm-field">
              <label>Announcement banner (HTML) <span class="adm-settings-help">A site-wide notice shown at the top of every page</span></label>
              <textarea id="set-announce" class="adm-input adm-textarea" rows="3" placeholder="Leave empty for no banner">${esc(settings.announcement || '')}</textarea>
            </div>
          </div>
        </div>
        <div class="adm-card" style="margin-top:16px">
          <button class="btn primary" id="adm-save-settings">💾 Save All Settings</button>
          <span id="adm-settings-status" style="margin-left:12px;font-size:12px;color:var(--ink3)"></span>
        </div>
      </div>`;

    /* toggle maintenance preview */
    document.getElementById('set-maintenance').addEventListener('change', function () {
      const area = document.getElementById('maintenance-preview-area');
      area.style.display = this.checked ? '' : 'none';
    });

    document.getElementById('adm-save-settings').addEventListener('click', async () => {
      const data = {
        signupOpen: document.getElementById('set-signup').checked,
        communityEnabled: document.getElementById('set-community').checked,
        maintenanceMode: document.getElementById('set-maintenance').checked,
        maxProjectsPerUser: +document.getElementById('set-max-projects').value || 50,
        sessionTTL: (+document.getElementById('set-session-hours').value || 24) * 3600000,
        rateLimitSignup: +document.getElementById('set-rate-signup').value || 8,
        rateLimitLogin: +document.getElementById('set-rate-login').value || 48,
        siteName: document.getElementById('set-site-name').value || 'CircuitTecture',
        defaultAvatar: document.getElementById('set-default-avatar').value || '🧑‍🔧',
        announcement: document.getElementById('set-announce').value
      };
      await api('/api/admin/settings', 'PUT', data);
      document.getElementById('adm-settings-status').textContent = '✅ Saved at ' + new Date().toLocaleTimeString();
      CS.toast('Settings saved');
    });
  }

  /* ============ SECURITY ============ */
  async function renderSecurity(el) {
    const [sessionsRes, statsRes, meRes] = await Promise.all([
      api('/api/admin/sessions'),
      api('/api/admin/stats'),
      api('/api/me')
    ]);
    const sessions = sessionsRes.sessions || [];
    const stats = statsRes.stats || {};
    const defaultAdminPassActive = meRes.user && meRes.user.defaultAdminPassActive;

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>Security & Sessions</h2></div>
        
        ${defaultAdminPassActive ? `
          <div class="adm-card warn-card" style="margin-bottom:16px;border:1px solid var(--err);background:rgba(239,68,68,0.06);padding:16px;border-radius:10px">
            <h3 style="color:var(--err);margin-top:0">⚠️ Default Admin Password Active</h3>
            <p style="font-size:13px;line-height:1.5;margin-bottom:12px">Your administrator account (<code>admin@circuittecture.local</code>) is still using the default password <code>admin1234</code>. This is a severe security risk.</p>
            <button class="btn danger sm" id="rotate-admin-pass-btn">Rotate Password Now</button>
          </div>
        ` : ''}

        <div class="adm-stat-grid">
          <div class="adm-stat-card">
            <span class="adm-stat-icon">🔑</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${sessions.length} <span class="adm-badge ${sessions.length > 50 ? 'err' : sessions.length > 20 ? 'warn' : 'ok'}" style="font-size:10px;vertical-align:middle">${sessions.length > 50 ? 'High' : sessions.length > 20 ? 'Moderate' : 'Normal'}</span></span>
              <span class="adm-stat-label">Active Sessions</span>
            </div>
          </div>
          <div class="adm-stat-card">
            <span class="adm-stat-icon">👥</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${new Set(sessions.map(s => s.userId)).size}</span>
              <span class="adm-stat-label">Logged-in Users</span>
            </div>
          </div>
          <div class="adm-stat-card">
            <span class="adm-stat-icon">⛔</span>
            <div class="adm-stat-body">
              <span class="adm-stat-value">${stats.suspended || 0}</span>
              <span class="adm-stat-label">Suspended Users</span>
            </div>
          </div>
        </div>
        
        <div class="danger-zone">
          <div class="dz-heading">Force Logout All Other Sessions</div>
          <p>This will immediately invalidate all active sessions except your own. Every other logged-in user will be signed out and must authenticate again. This action cannot be undone.</p>
          <button class="btn danger sm" id="force-logout-all-btn">Force Logout All Other Sessions</button>
        </div>

        <div class="adm-card" style="margin-top:20px">
          <h3>Active Sessions <button class="btn ghost xs" id="adm-refresh-sessions" style="float:right">🔄</button></h3>
          <div class="adm-table-wrap" style="max-height:400px;overflow-y:auto">
            <table class="adm-table">
              <thead><tr><th>User</th><th>Email</th><th>Created</th><th>Expires</th><th>Session ID</th><th>Action</th></tr></thead>
              <tbody>
                ${sessions.length ? sessions.map(s => {
                  const expiry = s.ttl ? new Date(Date.now() + s.ttl).toLocaleString() : '—';
                  return `
                  <tr>
                    <td><strong>${esc(s.userName || '?')}</strong></td>
                    <td><span class="adm-email">${esc(s.email || '?')}</span></td>
                    <td><span class="adm-date">${s.created ? new Date(s.created).toLocaleString() : '—'}</span></td>
                    <td><span class="adm-date" style="font-size:11px">${expiry}</span></td>
                    <td><code style="font-size:10px;color:var(--ink3)">${esc(s.id.slice(0, 16))}…</code></td>
                    <td><button class="btn danger xs" data-kill="${esc(s.id)}">Terminate</button></td>
                  </tr>`;
                }).join('') : '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--ink3)">No active sessions</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    el.querySelectorAll('[data-kill]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin/sessions/' + b.dataset.kill, 'DELETE');
      CS.toast('Session terminated');
      renderSecurity(el);
    }));
    document.getElementById('adm-refresh-sessions').addEventListener('click', () => renderSecurity(el));

    const forceBtn = document.getElementById('force-logout-all-btn');
    if (forceBtn) {
      forceBtn.addEventListener('click', async () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>Are you sure you want to terminate <strong>all</strong> other active sessions?</p><p style="font-size:12px;color:var(--ink3)">All users will be logged out immediately and will need to sign in again.</p>';
        const m = CS.modal({ title: 'Force Logout All', body });
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'btn danger block';
        confirmBtn.textContent = 'Yes, Logout Everyone';
        confirmBtn.addEventListener('click', async () => {
          await api('/api/admin/sessions/logout-all', 'POST');
          CS.toast('All other sessions terminated');
          m.close();
          renderSecurity(el);
        });
        m.body.appendChild(confirmBtn);
      });
    }

    const rotateBtn = document.getElementById('rotate-admin-pass-btn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        const body = document.createElement('div');
        body.innerHTML = `
          <label>Enter New Admin Password:
            <input type="password" id="new-admin-pass" class="adm-input" placeholder="Min 8 characters, letters & numbers" style="width:100%;margin-top:4px">
          </label>
        `;
        const m = CS.modal({ title: 'Rotate Admin Password', body });
        const btn = document.createElement('button');
        btn.className = 'btn primary block';
        btn.textContent = 'Update Password';
        btn.addEventListener('click', async () => {
          const pass = document.getElementById('new-admin-pass').value;
          if (!pass || pass.length < 8) return CS.toast('Password must be 8+ characters', 'error');
          await api('/api/admin/users/' + meRes.user.id, 'PUT', { pass });
          m.close();
          CS.toast('Admin password successfully rotated!');
          renderSecurity(el);
        });
        m.body.appendChild(btn);
      });
    }
  }

  /* ============ DATABASE ============ */
  async function renderDatabase(el) {
    const [sysRes, backupsRes] = await Promise.all([
      api('/api/admin/system'),
      api('/api/admin/db/backups')
    ]);
    const sys = sysRes.system || {};
    const backups = backupsRes.backups || [];

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>Database Management</h2></div>
        <div class="adm-stat-grid">
          <div class="adm-stat-card"><span class="adm-stat-icon">💾</span>
            <div class="adm-stat-body"><span class="adm-stat-value">${(sys.dbFile / 1024).toFixed(1)}</span><span class="adm-stat-label">Database File</span><span class="adm-stat-sub">KB on disk</span></div>
          </div>
          <div class="adm-stat-card"><span class="adm-stat-icon">📦</span>
            <div class="adm-stat-body"><span class="adm-stat-value">${(sys.backups / 1024).toFixed(1)}</span><span class="adm-stat-label">Backup File</span><span class="adm-stat-sub">KB (.bak)</span></div>
          </div>
          <div class="adm-stat-card"><span class="adm-stat-icon">📐</span>
            <div class="adm-stat-body"><span class="adm-stat-value">${sys.projects}</span><span class="adm-stat-label">Projects</span></div>
          </div>
          <div class="adm-stat-card"><span class="adm-stat-icon">👥</span>
            <div class="adm-stat-body"><span class="adm-stat-value">${sys.users}</span><span class="adm-stat-label">Users</span></div>
          </div>
        </div>
        
        <div class="adm-card" style="margin-top:20px">
          <h3>Actions</h3>
          <div class="adm-db-actions">
            <button class="btn sm" data-db="backup">💾 Create Backup</button>
            <button class="btn sm" data-db="optimize">⚡ Optimize Database</button>
            <button class="btn sm" data-db="refresh">🔄 Refresh Stats</button>
          </div>
          <div id="adm-db-result" style="margin-top:12px;font-size:12px;color:var(--ink3)"></div>
        </div>

        <div class="adm-card" style="margin-top:20px">
          <h3>Database Backups</h3>
          <div class="adm-table-wrap" style="max-height:240px;overflow-y:auto;margin-top:12px">
            <table class="adm-table">
              <thead><tr><th>Backup File</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody id="adm-backups-tbody">
                ${backups.length ? backups.map(b => `
                  <tr>
                    <td><code style="font-size:11px;color:var(--ink)">${esc(b.filename)}</code></td>
                    <td>${(b.size / 1024).toFixed(1)} KB</td>
                    <td>${new Date(b.createdAt).toLocaleString()}</td>
                    <td>
                      <button class="btn ghost xs" data-action="download-backup" data-name="${esc(b.filename)}">⬇️ Download</button>
                      <button class="btn danger xs" data-action="restore-backup" data-name="${esc(b.filename)}">🔄 Restore</button>
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="4"><div class="empty-state" style="padding:30px 20px"><span class="e-icon">💾</span><h3 style="margin:8px 0 4px">No backups found</h3><p>Backups are created automatically on a schedule. You can also create a manual backup using the button above.</p></div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="adm-card" style="margin-top:16px">
          <h3>Database Info</h3>
          <pre class="adm-pre">System: ${sys.platform} · ${sys.arch}
Node: ${sys.node}
PID: ${sys.pid}
Uptime: ${Math.floor(sys.uptime / 86400)}d ${Math.floor((sys.uptime % 86400) / 3600)}h ${Math.floor((sys.uptime % 3600) / 60)}m
Heap: ${(sys.memory?.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(sys.memory?.heapTotal / 1024 / 1024).toFixed(1)}MB
DB Size: ${(sys.dbFile / 1024).toFixed(1)}KB
Users: ${sys.users}
Projects: ${sys.projects}
Sessions: ${sys.sessions}</pre>
        </div>
      </div>`;

    el.querySelectorAll('[data-db]').forEach(b => b.addEventListener('click', async () => {
      const action = b.dataset.db;
      const result = document.getElementById('adm-db-result');
      try {
        if (action === 'backup') {
          const r = await api('/api/admin/db/backup', 'POST');
          result.innerHTML = '✅ Backup created: ' + esc(r.backup.filename) + ' (' + (r.backup.size / 1024).toFixed(1) + ' KB)';
          renderDatabase(el);
        } else if (action === 'optimize') {
          await api('/api/admin/db/optimize', 'POST');
          result.innerHTML = '✅ Database optimized';
        } else if (action === 'refresh') {
          renderDatabase(el);
        }
        CS.toast(action === 'backup' ? 'Backup created' : 'Database optimized');
      } catch (e) {
        result.innerHTML = '❌ Error: ' + esc(e.message);
      }
    }));

    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const name = btn.dataset.name;
        if (action === 'download-backup') {
          location.href = '/api/admin/db/backup/' + name;
        } else if (action === 'restore-backup') {
          if (!confirm(`⛔ WARNING: Restoring from "${name}" will completely overwrite the current database. All current changes will be lost. Proceed?`)) return;
          try {
            await api('/api/admin/db/restore', 'POST', { name });
            CS.toast('Database successfully restored from backup! 🔄');
            location.reload();
          } catch (e) {
            CS.toast('Restore failed: ' + e.message, 'error');
          }
        }
      });
    });
  }

  /* ============ ACTIVITY LOG ============ */
  async function renderActivity(el) {
    const res = await api('/api/admin/activity');
    const activity = res.activity || [];

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header">
          <h2>Activity Log</h2>
          <div class="adm-actions-right" style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="search" id="act-filter-user" class="adm-filter" placeholder="User email/id…" style="width:140px;font-size:11px;padding:4px 8px">
            <input type="search" id="act-filter-action" class="adm-filter" placeholder="Action…" style="width:110px;font-size:11px;padding:4px 8px">
            <input type="date" id="act-filter-start" class="adm-filter" style="width:110px;font-size:11px;padding:4px 8px" title="Start date">
            <input type="date" id="act-filter-end" class="adm-filter" style="width:110px;font-size:11px;padding:4px 8px" title="End date">
            <button class="btn sm" id="act-export-csv" title="Export as CSV">Export CSV</button>
            <button class="btn ghost sm" id="adm-refresh-activity">🔄</button>
          </div>
        </div>
        <div class="adm-card">
          <div class="adm-activity-list" id="adm-activity-list-container">
            ${activity.length ? activity.map(a => `
              <div class="adm-activity-item">
                <span class="adm-activity-dot ${a.action.includes('delete') ? 'err' : a.action.includes('create') ? 'ok' : ''}"></span>
                <div class="adm-activity-body">
                  <span class="adm-activity-action"><strong>${esc(a.action)}</strong></span>
                  <span class="adm-activity-target">${esc(a.target || '')}</span>
                  <span class="adm-activity-meta">by ${esc(a.actorName || a.actor || 'system')} · ${new Date(a.ts).toLocaleString()}</span>
                  ${a.detail ? '<span class="adm-activity-detail">' + esc(typeof a.detail === 'object' ? JSON.stringify(a.detail).slice(0, 200) : String(a.detail).slice(0, 200)) + '</span>' : ''}
                </div>
                <span class="adm-activity-time">${timeAgo(a.ts)}</span>
              </div>
            `).join('') : '<div class="empty-state" style="padding:40px 20px"><span class="e-icon">📋</span><h3 style="margin:8px 0 4px">No activity recorded yet</h3><p>Activity entries will appear here as users interact with the platform — creating projects, running simulations, and managing their accounts.</p></div>'}
          </div>
        </div>
      </div>`;

    const applyFilters = () => {
      const userQ = document.getElementById('act-filter-user').value.toLowerCase();
      const actionQ = document.getElementById('act-filter-action').value.toLowerCase();
      const startVal = document.getElementById('act-filter-start').value;
      const endVal = document.getElementById('act-filter-end').value;
      const startTime = startVal ? new Date(startVal).getTime() : 0;
      const endTime = endVal ? new Date(endVal).getTime() + 86400000 : Infinity;
      
      const filtered = activity.filter(a => {
        const matchesUser = !userQ || String(a.actor || '').toLowerCase().includes(userQ) || String(a.actorId || '').toLowerCase().includes(userQ) || String(a.actorName || '').toLowerCase().includes(userQ);
        const matchesAction = !actionQ || String(a.action || '').toLowerCase().includes(actionQ);
        const matchesStart = a.ts >= startTime;
        const matchesEnd = a.ts <= endTime;
        return matchesUser && matchesAction && matchesStart && matchesEnd;
      });
      
      const listContainer = document.getElementById('adm-activity-list-container');
      if (listContainer) {
        listContainer.innerHTML = filtered.length ? filtered.map(a => `
          <div class="adm-activity-item">
            <span class="adm-activity-dot ${a.action.includes('delete') ? 'err' : a.action.includes('create') ? 'ok' : ''}"></span>
            <div class="adm-activity-body">
              <span class="adm-activity-action"><strong>${esc(a.action)}</strong></span>
              <span class="adm-activity-target">${esc(a.target || '')}</span>
              <span class="adm-activity-meta">by ${esc(a.actorName || a.actor || 'system')} · ${new Date(a.ts).toLocaleString()}</span>
              ${a.detail ? '<span class="adm-activity-detail">' + esc(typeof a.detail === 'object' ? JSON.stringify(a.detail).slice(0, 200) : String(a.detail).slice(0, 200)) + '</span>' : ''}
            </div>
            <span class="adm-activity-time">${timeAgo(a.ts)}</span>
          </div>
        `).join('') : '<div style="text-align:center;padding:40px;color:var(--ink3)">No matching activity records.</div>';
      }
      window._filteredActivity = filtered;
    };

    ['act-filter-user', 'act-filter-action'].forEach(id => {
      document.getElementById(id).addEventListener('input', applyFilters);
    });
    ['act-filter-start', 'act-filter-end'].forEach(id => {
      document.getElementById(id).addEventListener('change', applyFilters);
    });

    document.getElementById('act-export-csv').addEventListener('click', () => {
      const list = window._filteredActivity || activity;
      const headers = 'Timestamp,Actor ID,Actor,Action,Target,Details\n';
      const rows = list.map(a => [
        new Date(a.ts).toISOString(),
        a.actorId || 'system',
        a.actor || 'system',
        a.action,
        a.target || '',
        JSON.stringify(a.detail || {}).replace(/"/g, '""')
      ].map(val => `"${val}"`).join(',')).join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'activity-log.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      CS.toast('CSV exported');
    });

    window._filteredActivity = activity;
    document.getElementById('adm-refresh-activity').addEventListener('click', () => renderActivity(el));
  }

  /* ============ MODERATION ============ */
  async function renderModeration(el) {
    const [queueR, projectsR] = await Promise.all([
      api('/api/admin/moderation'),
      api('/api/admin/projects')
    ]);
    const queue = queueR.queue || [];
    const projects = projectsR.projects || [];
    const pending = queue.filter(i => i.status === 'pending');

    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header">
          <h2>Community Content Moderation</h2>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="btn sm" id="mod-approve-all" style="background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3)">✅ Approve All</button>
            <button class="btn sm" id="mod-reject-all" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)">❌ Reject All</button>
            <input type="search" id="adm-mod-search" class="adm-filter" placeholder="Search reports…" style="width:200px">
          </div>
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr>
              <th>Reported Project</th><th>Reporter</th><th>Reason</th><th>Status</th><th>Reported</th><th>Actions</th>
            </tr></thead>
            <tbody id="adm-mod-tbody">
              ${queue.map(i => {
                const p = i.project || {};
                const status = i.status === 'pending'
                  ? '<span class="adm-badge err" style="font-size:10px">🕒 Pending</span>'
                  : i.status === 'approve' ? '<span class="adm-badge ok" style="font-size:10px">✅ Approved</span>'
                  : i.status === 'feature' ? '<span class="adm-badge vio" style="font-size:10px">⭐ Featured</span>'
                  : '<span class="adm-badge" style="font-size:10px">❌ Rejected</span>';
                return `
                <tr data-id="${esc(i.id)}" data-project="${esc(i.projectId)}">
                  <td><strong>${esc(p.name || i.projectId)}</strong><div class="adm-settings-help">by ${esc((p.owner && p.owner.email) || '—')}</div></td>
                  <td><span class="adm-email">${esc((i.reporter && i.reporter.email) || '—')}</span></td>
                  <td style="max-width:260px">${esc(i.reason || '—')}</td>
                  <td>${status}</td>
                  <td><span class="adm-date">${i.createdAt ? new Date(i.createdAt).toLocaleDateString() : '—'}</span></td>
                  <td class="adm-actions-cell">
                    ${i.status === 'pending' ? `
                      <button class="btn ghost xs" data-qa="approve" data-id="${esc(i.id)}">✅ Approve</button>
                      <button class="btn ghost xs" data-qa="reject" data-id="${esc(i.id)}">❌ Reject</button>
                      <button class="btn ghost xs" data-qa="feature" data-id="${esc(i.id)}">⭐ Feature</button>` : ''}
                    <button class="btn ghost xs" data-mod-open="${esc(i.projectId)}" title="Open in editor">🔍</button>
                  </td>
                </tr>`;
              }).join('') || '<tr><td colspan="6"><div class="empty-state" style="margin-top:8px"><span class="e-icon">✅</span><h3>All clear — no reported content</h3><p>Reports from the community will appear here for review.</p></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      <div class="adm-section" style="margin-top:16px">
        <div class="adm-section-header"><h2>Community Projects</h2></div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead><tr><th>Project Name</th><th>Owner</th><th>Board</th><th>Stats</th><th>Visibility</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody id="adm-proj-mod-tbody">
              ${projects.filter(p => p.public || p.official).map(p => `
                <tr data-id="${esc(p.id)}">
                  <td><strong>${esc(p.name)}</strong></td>
                  <td><span class="adm-email">${esc((p.owner && p.owner.email) || '—')}</span></td>
                  <td>${esc(p.board || '—')}</td>
                  <td>❤️ ${p.likes || 0} · ⑂ ${p.forks || 0}</td>
                  <td>${p.public ? '<span class="adm-badge ok">Public</span>' : '<span class="adm-badge">Private</span>'} ${p.official ? '<span class="adm-badge vio">⭐ Template</span>' : ''}</td>
                  <td><span class="adm-date">${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</span></td>
                  <td class="adm-actions-cell">
                    <button class="btn ghost xs" data-mod-open="${esc(p.id)}" title="Open in editor">🔍</button>
                    <button class="btn ghost xs" data-mod-pub="${esc(p.id)}" title="${p.public ? 'Unpublish (make private)' : 'Publish (make public)'}">${p.public ? '🔒' : '🌍'}</button>
                    <button class="btn ghost xs" data-mod-tmpl="${esc(p.id)}" title="${p.official ? 'Remove template' : 'Make template'}">${p.official ? '⭐' : '📋'}</button>
                    <button class="btn danger xs" data-mod-del="${esc(p.id)}" title="Delete project">🗑️</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="7"><div class="empty-state" style="margin-top:8px"><span class="e-icon">✅</span><h3>No public community projects</h3></div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    /* queue actions */
    el.querySelectorAll('[data-qa]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id, action = b.dataset.qa;
      await api('/api/admin/moderation/' + id + '/action', 'POST', { action });
      CS.toast(action === 'approve' ? 'Report approved' : action === 'feature' ? 'Report featured' : 'Report rejected');
      renderModeration(el);
    }));

    /* batch approve/reject all */
    document.getElementById('mod-approve-all').addEventListener('click', async () => {
      for (const i of pending) await api('/api/admin/moderation/' + i.id + '/action', 'POST', { action: 'approve' });
      CS.toast(pending.length + ' reports approved');
      renderModeration(el);
    });
    document.getElementById('mod-reject-all').addEventListener('click', async () => {
      for (const i of pending) await api('/api/admin/moderation/' + i.id + '/action', 'POST', { action: 'reject' });
      CS.toast(pending.length + ' reports rejected');
      renderModeration(el);
    });

    /* queue search */
    const searchInput = document.getElementById('adm-mod-search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      document.querySelectorAll('#adm-mod-tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    /* community project actions */
    el.querySelectorAll('[data-mod-open]').forEach(b => b.addEventListener('click', () => { window.open('/editor?id=' + b.dataset.modOpen, '_blank'); }));
    el.querySelectorAll('[data-mod-pub]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.modPub);
      if (!p) return;
      if (!confirm(`Are you sure you want to ${p.public ? 'unpublish' : 'publish'} "${p.name}"?`)) return;
      await api('/api/admin/projects/' + p.id, 'PUT', { public: !p.public });
      CS.toast(p.public ? 'Project unpublished' : 'Project published');
      renderModeration(el);
    }));
    el.querySelectorAll('[data-mod-tmpl]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.modTmpl);
      if (!p) return;
      await api('/api/admin/projects/' + p.id, 'PUT', { official: !p.official });
      CS.toast(p.official ? 'Removed template flag' : 'Marked as official template');
      renderModeration(el);
    }));
    el.querySelectorAll('[data-mod-del]').forEach(b => b.addEventListener('click', async () => {
      const p = projects.find(x => x.id === b.dataset.modDel);
      if (!p) return;
      if (!confirm(`Delete project "${p.name}"?`)) return;
      await api('/api/admin/projects/' + p.id, 'DELETE');
      CS.toast('Project deleted');
      renderModeration(el);
    }));
  }

  /* ---------- Feature Flags ---------- */
  async function renderFeatureFlags(el) {
    const r = await api('/api/admin/feature-flags', 'GET');
    const flags = r.flags || {};
    const defaults = { maintenanceMode: false, communityEnabled: true, signupOpen: true, boardToggles: true, allowForking: true, allowSharing: true };
    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>Feature Flags</h2></div>
        <div class="adm-section-body">
          <div class="adm-settings-help">Toggle features on/off. Changes take effect immediately.</div>
          <div class="flag-list" style="margin-top:12px">
            ${Object.entries(Object.assign(defaults, flags)).map(([k, v]) => {
              const enabled = v && (v === true || v.enabled === true || v.enabled === 1);
              const desc = v.description || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
              return `<div class="flag-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line2)">
                <div><b>${esc(k)}</b><div class="adm-settings-help">${esc(desc)}</div></div>
                <label class="toggle"><input type="checkbox" data-flag="${esc(k)}" ${enabled ? 'checked' : ''}><span class="toggle-slider"></span></label>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:16px"><button class="btn primary sm" id="flag-save">Save Changes</button></div>
        </div>
      </div>`;
    el.querySelector('#flag-save').addEventListener('click', async () => {
      const checks = el.querySelectorAll('[data-flag]');
      const updates = {};
      checks.forEach(cb => { updates[cb.dataset.flag] = { enabled: cb.checked, description: '' }; });
      for (const [k, v] of Object.entries(updates)) {
        await api(`/api/admin/feature-flags/${encodeURIComponent(k)}`, 'PUT', v);
      }
      CS.toast('Feature flags updated');
    });
  }

  /* ---------- Template Management ---------- */
  async function renderTemplates(el) {
    const r = await api('/api/admin/projects', 'GET');
    const projects = r.projects || [];
    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>Template Management</h2></div>
        <div class="adm-section-body">
          <div class="adm-settings-help">Promote community projects to official templates visible on the dashboard.</div>
          <div class="temp-list" style="margin-top:12px">
            ${projects.filter(p => !p.official).slice(0, 50).map(p => `
              <div class="flag-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line2)">
                <div><b>${esc(p.name)}</b><div class="adm-settings-help">By ${esc(p.owner?.name || 'Unknown')} · ${p.forks} forks · ${p.likes} likes</div></div>
                <button class="btn ghost xs" data-promote="${esc(p.id)}">⭐ Promote to Template</button>
              </div>
            `).join('') || '<div class="adm-settings-help">No available projects.</div>'}
          </div>
          <div style="margin-top:16px"><h3 style="font-size:14px;margin-bottom:8px">Official Templates</h3></div>
          <div class="temp-list">
            ${projects.filter(p => p.official).map(p => `
              <div class="flag-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line2)">
                <div><b>${esc(p.name)}</b><div class="adm-settings-help">${p.forks} forks · template</div></div>
                <button class="btn ghost xs" data-demote="${esc(p.id)}">↩ Remove</button>
              </div>
            `).join('') || '<div class="adm-settings-help">No official templates yet.</div>'}
          </div>
        </div>
      </div>`;
    el.querySelectorAll('[data-promote]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin/projects/' + b.dataset.promote, 'PUT', { official: true });
      CS.toast('Project promoted to template');
      renderTemplates(el);
    }));
    el.querySelectorAll('[data-demote]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/admin/projects/' + b.dataset.demote, 'PUT', { official: false });
      CS.toast('Template removed');
      renderTemplates(el);
    }));
  }

  /* ---------- Operations Dashboard ---------- */
  async function renderOperations(el) {
    const [statsR, flagsR] = await Promise.all([
      api('/api/admin/stats', 'GET'),
      api('/api/admin/feature-flags', 'GET')
    ]);
    const s = statsR.stats || {};
    const flags = flagsR.flags || {};
    el.innerHTML = `
      <div class="adm-section">
        <div class="adm-section-header"><h2>Operations Dashboard</h2></div>
        <div class="adm-section-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
            <div class="adm-glass-card"><div class="adm-settings-help">Active Users</div><div style="font-size:28px;font-weight:700">${s.users || 0}</div></div>
            <div class="adm-glass-card"><div class="adm-settings-help">Total Projects</div><div style="font-size:28px;font-weight:700">${s.projects || 0}</div></div>
            <div class="adm-glass-card"><div class="adm-settings-help">Active Sessions</div><div style="font-size:28px;font-weight:700">${s.activeSessions || 0}</div></div>
            <div class="adm-glass-card"><div class="adm-settings-help">Uptime</div><div style="font-size:28px;font-weight:700">${Math.floor((s.uptime || 0) / 3600)}h</div></div>
          </div>
          <div style="margin-top:20px">
            <h3 style="font-size:14px;margin-bottom:8px">System Health</h3>
            <div class="flag-list">
              ${Object.entries(flags).map(([k, v]) => {
                const enabled = v && (v === true || v.enabled === true || v.enabled === 1);
                return `<div class="flag-row" style="display:flex;align-items:center;gap:8px;padding:6px 0">
                  <span class="adm-health-dot ${enabled ? 'green' : 'yellow'}"></span>
                  <span>${esc(k)}: ${enabled ? 'Enabled' : 'Disabled'}</span>
                </div>`;
              }).join('') || '<div class="adm-settings-help">No features configured.</div>'}
            </div>
          </div>
        </div>
      </div>`;
  }

  function timeAgo(ts) {
    const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  /* ============ ACTIONS ============ */
  async function doBackup() {
    try {
      await api('/api/admin/db/backup', 'POST');
      CS.toast('Backup created');
      loadSection(currentSection);
    } catch (e) { CS.toast('Backup failed: ' + e.message, 'error'); }
  }

  async function doOptimize() {
    try {
      await api('/api/admin/db/optimize', 'POST');
      CS.toast('Database optimized');
      loadSection(currentSection);
    } catch (e) { CS.toast('Optimize failed: ' + e.message, 'error'); }
  }

})();