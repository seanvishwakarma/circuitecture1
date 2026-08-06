/* CircuitTecture — application orchestrator. */
(function () {
  const CS = window.CS;
  const { $, $$, esc, api, toast, modal, menu, debounce } = CS;

  const app = {
    user: null, view: 'landing', project: null, dirty: false,
    dashTab: 'mine', folder: '', tag: '', search: '', sort: 'updated'
  };
  CS.app = app;

  /* ---------- Guided Onboarding Tour ---------- */
  (function() {
    const CS = window.CS;
    const { $, esc } = CS;
    
    CS.tour = {
      editor: function(force) {
        if (!force && localStorage.getItem('cf-toured-editor')) return;
        const steps = [
          { el: '#lib-panel', title: 'Component Library', text: 'Browse 50+ components — drag any onto the canvas to start your circuit.', pos: 'right', icon: '\u{1F9F0}' },
          { el: '#canvas-wrap', title: 'Circuit Canvas', text: 'This is your workspace. Click a pin and drag to another pin to wire components together.', pos: 'center', icon: '\u{1F50C}' },
          { el: '#sim-controls', title: 'Simulation Controls', text: 'Press \u25B6 Run to execute your code on the virtual microcontroller.', pos: 'bottom', icon: '\u25B6\uFE0F' },
          { el: '#right-dock', title: 'Code Editor & Tools', text: 'Write Arduino C++ or MicroPython code here. Switch between Code, Inspector, Wiring Guide, and Scope tabs.', pos: 'left', icon: '\u{1F4BB}' },
          { el: '.canvas-toolbar', title: 'Canvas Tools', text: 'Zoom, pan, undo, toggle grid, and probe pins for live voltage readings.', pos: 'top', icon: '\u{1F527}' },
          { el: '#proj-name', title: 'Name Your Project', text: 'Give your circuit a meaningful name before sharing or saving.', pos: 'bottom', icon: '\u270F\uFE0F' }
        ];
        this._startTour(steps, 'cf-toured-editor');
      },
      dashboard: function(force) {
        if (!force && localStorage.getItem('cf-toured-dash')) return;
        const steps = [
          { el: '#dash-greeting', title: 'Welcome to Your Dashboard', text: 'This is your command center. Create, manage, and organize all your circuit projects.', pos: 'bottom', icon: '\u{1F44B}' },
          { el: '.dash-side', title: 'Sidebar Navigation', text: 'Browse your projects, folders, tags, and templates. Quick stats at the top.', pos: 'right', icon: '\u{1F4C2}' },
          { el: '.project-grid', title: 'Your Projects', text: 'All your circuits appear here. Click any to continue editing, or hit "New Project" to start fresh.', pos: 'top', icon: '\u{1F4D0}' }
        ];
        this._startTour(steps, 'cf-toured-dash');
      },
      _startTour: function(steps, storageKey) {
        if (this._active) return;
        this._active = true;
        const self = this;
        let currentStep = 0;
        const root = $('#tour-root');
        
        const renderStep = () => {
          root.innerHTML = '';
          if (currentStep >= steps.length) {
            root.classList.add('hidden');
            localStorage.setItem(storageKey, '1');
            self._active = false;
            return;
          }
          root.classList.remove('hidden');
          
          const step = steps[currentStep];
          const overlay = document.createElement('div');
          overlay.className = 'tour-overlay';
          
          const card = document.createElement('div');
          card.className = 'tour-card glass-card';
          
          const target = $(step.el);
          if (target) {
            const rect = target.getBoundingClientRect();
            const pos = step.pos;
            
            card.style.position = 'fixed';
            card.style.zIndex = '401';
            card.style.maxWidth = '320px';
            card.style.animation = 'fadeUp 0.3s ease';
            
            if (pos === 'right') {
              card.style.left = (rect.right + 16) + 'px';
              card.style.top = Math.max(16, rect.top + rect.height / 2 - 60) + 'px';
            } else if (pos === 'left') {
              card.style.left = Math.max(16, rect.left - 336) + 'px';
              card.style.top = Math.max(16, rect.top + rect.height / 2 - 60) + 'px';
            } else if (pos === 'bottom') {
              card.style.left = Math.max(16, rect.left + rect.width / 2 - 160) + 'px';
              card.style.top = (rect.bottom + 16) + 'px';
            } else if (pos === 'top') {
              card.style.left = Math.max(16, rect.left + rect.width / 2 - 160) + 'px';
              card.style.top = Math.max(16, rect.top - 140) + 'px';
            } else {
              card.style.left = '50%';
              card.style.top = '40%';
              card.style.transform = 'translate(-50%, -50%)';
            }
            
            target.style.outline = '2px solid var(--acc)';
            target.style.outlineOffset = '3px';
            target.style.transition = 'outline 0.3s ease';
          }
          
          card.innerHTML = [
            '<div class="tour-step-indicator">',
            '<span class="tour-icon">', step.icon, '</span>',
            '<span class="tour-progress">', currentStep + 1, ' / ', steps.length, '</span>',
            '</div>',
            '<h3 class="tour-title">', esc(step.title), '</h3>',
            '<p class="tour-text">', esc(step.text), '</p>',
            '<div class="tour-actions">',
            '<button class="btn ghost xs tour-skip-btn">Skip tour</button>',
            '<button class="btn primary xs tour-next-btn">', currentStep < steps.length - 1 ? 'Next \u2192' : 'Done \u2713', '</button>',
            '</div>'
          ].join('');
          
          overlay.appendChild(card);
          root.appendChild(overlay);
          
          card.querySelector('.tour-next-btn').addEventListener('click', () => {
            if (target) { target.style.outline = ''; }
            currentStep++;
            renderStep();
          });
          
          card.querySelector('.tour-skip-btn').addEventListener('click', () => {
            if (target) { target.style.outline = ''; }
            root.classList.add('hidden');
            localStorage.setItem(storageKey, '1');
            self._active = false;
          });
        };
        
        renderStep();
      }
    };
  })();

  CS.bus.on('canvasRendered', () => {
    setTimeout(() => {
      if (CS.tour && CS.tour.editor && typeof CS.tour.editor === 'function') {
        CS.tour.editor();
      }
    }, 800);
  });

  /* ================= boot ================= */
  async function boot() {
    const page = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const shareM = location.pathname.match(/^\/share\/([\w-]+)/) || location.hash.match(/share\/([\w-]+)/);
    const embed = new URLSearchParams(location.search).get('embed') === '1' || location.hash.includes('embed=1');
    if (shareM) return bootShareViewer(shareM[1], embed);
    heroArt();
    initTheme();
    bindGlobal();
    await CS.fetchCsrf();
    let me = null;
    try { me = (await api('/api/me')).user; } catch { /* ignore */ }
    if (me) {
      if (me.impersonating) {
        const banner = document.createElement('div');
        banner.className = 'impersonate-banner';
        banner.style.cssText = 'background:#ea580c;color:#fff;text-align:center;padding:8px;font-size:13px;font-weight:700;position:sticky;top:0;z-index:9999;display:flex;justify-content:center;align-items:center;gap:12px';
        banner.innerHTML = `
          <span>⚠️ Impersonating ${esc(me.name)} (${esc(me.email)})</span>
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
      if (me.role === 'admin' && me.defaultAdminPassActive && !localStorage.getItem('admin-password-warned')) {
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
            await api('/api/admin/users/' + me.id, 'PUT', { pass });
            m.close();
            CS.toast('Password updated successfully');
          });
          m.body.appendChild(btn);
        }, 1000);
      }
    }

    // Multi-page routing
    if (page === '/admin') {
      return; // admin.html handles itself via admin.js
    }
    if (page === '/dashboard') {
      if (me) { app.user = me; enterDashboard(); }
      else { location.href = '/'; }
      return;
    }
    if (page === '/editor') {
      if (me) {
        app.user = me;
        const pid = new URLSearchParams(location.search).get('id');
        const share = new URLSearchParams(location.search).get('share') === '1';
        if (pid) openProject(pid, share);
        else openLatestOrCreate();
      } else {
        location.href = '/';
      }
      return;
    }
    // Landing / marketing pages (/, /features, /components, /docs)
    if ($('#landing')) {
      document.body.classList.add('landing-mode');
      initScrollReveal();
      if (me) {
        // User is logged in on landing page — update nav
        const acts = document.querySelector('.landing-nav-actions');
        if (acts) {
          acts.innerHTML = (me.role === 'admin' ? '<a href="/admin" class="btn ghost sm" style="text-decoration:none;font-size:12px">🛡️ Admin</a>' : '') + '<button class="btn ghost sm" id="theme-btn" title="Toggle theme">🌙</button><a href="/dashboard" class="btn primary" style="text-decoration:none">Go to Dashboard →</a><button class="mobile-burger-btn" id="mobile-burger-btn" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="mobile-nav-drawer"><span></span><span></span><span></span></button>';
          updateThemeBtn();
          const tb = acts.querySelector('#theme-btn');
          if (tb) tb.addEventListener('click', toggleTheme);
        }
        const navDashLink = $('#nav-dash-link');
        if (navDashLink) navDashLink.href = '/dashboard';
        // Add admin link to desktop nav links
        const mpLinks = document.querySelector('.mp-links');
        if (mpLinks && me.role === 'admin' && !mpLinks.querySelector('[href="/admin"]')) {
          const admLink = document.createElement('a');
          admLink.href = '/admin'; admLink.className = 'mp-nav-link';
          admLink.textContent = '🛡️ Admin';
          const dashLink = mpLinks.querySelector('#nav-dash-link');
          if (dashLink) mpLinks.insertBefore(admLink, dashLink.nextSibling);
        }
      } else {
        // Unauthenticated users — intercept restricted links
        document.querySelectorAll('a[href="/editor"], a[href="/dashboard"], #nav-dash-link').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            toast('Please log in or sign up free to continue', 'warn');
            authModal('login');
          });
        });
      }
      // Always init mobile nav last, after any DOM changes above
      initMobileNav();
    }
  }

/* ================= mobile dashboard toggle ================= */
  function initMobileNav() {
    const burger = $('#dash-burger');
    const drawer = $('#dash-side');
    if (!burger || !drawer) return;

    const openDrawer = () => {
      burger.classList.add('open');
      drawer.classList.add('open');
      document.body.classList.add('dash-nav-open');
    };
    const closeDrawer = () => {
      burger.classList.remove('open');
      drawer.classList.remove('open');
      document.body.classList.remove('dash-nav-open');
    };

    burger.onclick = (e) => {
      e.stopPropagation();
      if (drawer.classList.contains('open')) closeDrawer();
      else openDrawer();
    };
    
    // Close when clicking outside
    document.onclick = (e) => {
      if (!drawer.contains(e.target) && !burger.contains(e.target) && drawer.classList.contains('open')) {
        closeDrawer();
      }
    };
    
    // Close on escape key
    document.onkeypress = (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        closeDrawer();
      }
    };
    
    // Close drawer when clicking on nav links (mobile only)
    document.querySelectorAll('#dash-side .folder-item, #dash-side .tag-pill').forEach(item => {
      item.onclick = e => {
        if (window.innerWidth <= 768) closeDrawer();
      };
    });
    
    // Close drawer when clicking Dashboard tab to prevent page reload
    document.querySelectorAll('[data-tab="mine"]')[0].onclick = e => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        closeDrawer();
      }
    };
    document.querySelectorAll('[data-tab="templates"]')[0].onclick = e => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        closeDrawer();
      }
    };
    document.querySelectorAll('[data-tab="admin"]')[0].onclick = e => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        closeDrawer();
      }
    };
  }

/* ============ search with debounce and enhanced filtering ========= */

  function initScrollReveal() {
    const reveals = $$('.reveal');
    if (!reveals.length) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

      reveals.forEach(el => observer.observe(el));
    } else {
      reveals.forEach(el => el.classList.add('revealed'));
    }
  }

  function show(view) {
    app.view = view;
    $$('.view').forEach(v => v.classList.add('hidden'));
    $('#' + view).classList.remove('hidden');
  }

  /* ================= theme ================= */
  function effectiveTheme(pref) { return pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref; }
  function applyThemePref(pref) {
    const eff = effectiveTheme(pref || 'dark');
    document.documentElement.setAttribute('data-theme', eff);
    document.documentElement.dataset.themePref = pref || eff;
    if (CS.editor && CS.editor.setTheme) CS.editor.setTheme(eff === 'light' ? 'vs' : 'vs-dark');
    const et = $('#editor-theme'); if (et) et.value = (pref === 'system') ? 'system' : (eff === 'light' ? 'vs' : 'vs-dark');
    updateThemeBtn();
  }
  function initTheme() {
    const pref = localStorage.getItem('ct-theme') || localStorage.getItem('cf-theme') || 'dark';
    applyThemePref(pref);
    if (matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener && matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if ((localStorage.getItem('ct-theme') || '') === 'system') applyThemePref('system'); });
  }
  function toggleTheme() {
    const cur = document.documentElement.dataset.themePref || document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark';
    if (next === cur) return;
    localStorage.setItem('ct-theme', next);
    applyThemePref(next);
    updateThemeBtn();
    toast('Theme: ' + next, 'ok', 900);
  }
  function updateThemeBtn() {
    const b = $('#theme-btn'); if (b) { const pref = document.documentElement.dataset.themePref || document.documentElement.getAttribute('data-theme'); b.textContent = pref === 'system' ? '💻' : document.documentElement.getAttribute('data-theme') === 'dark' ? '🌙' : '☀️'; }
  }

  /* ================= landing & auth ================= */
  function heroArt() {
    const svg = $('#hero-svg'); if (!svg) return;
    svg.innerHTML = `
      <rect x="40" y="60" width="200" height="120" rx="10" fill="var(--acc)" opacity=".85" stroke="var(--acc2)" stroke-width="2"/>
      <rect x="60" y="80" width="40" height="30" rx="4" fill="var(--bg3)"/>
      <rect x="180" y="75" width="10" height="90" rx="3" fill="var(--bg)"/>
      <rect x="60" y="140" width="120" height="10" rx="3" fill="var(--bg)"/>
      <text x="60" y="130" fill="var(--ink)" font-size="18" font-family="monospace" opacity=".9">UNO R3</text>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle cx="${195}" cy="${82 + i * 12}" r="3.4" fill="var(--bg3)" stroke="var(--line2)"/>`).join('')}
      <circle cx="300" cy="110" r="14" fill="#ef4444"><animate attributeName="opacity" values="1;.35;1" dur="0.8s" repeatCount="indefinite"/></circle>
      <circle cx="300" cy="110" r="22" fill="#ef4444" opacity=".22"><animate attributeName="r" values="18;26;18" dur="0.8s" repeatCount="indefinite"/></circle>
      <rect x="360" y="70" width="120" height="70" rx="8" fill="var(--panel)" stroke="var(--acc)" stroke-width="2"/>
      <rect x="370" y="80" width="100" height="36" rx="3" fill="var(--bg3)"/>
      <text x="378" y="103" fill="var(--ink)" font-size="14" font-family="monospace" opacity=".9">Hello, maker!</text>
      <path class="hero-wire" d="M195 88 C 250 88, 260 110, 288 110" stroke="var(--acc)" stroke-width="2.5" fill="none"/>
      <path class="hero-wire" d="M195 160 C 300 200, 340 120, 362 105" stroke="var(--acc2)" stroke-width="2.5" fill="none"/>
      <circle r="4" fill="var(--bg)"><animateMotion dur="1.6s" repeatCount="indefinite" path="M195 88 C 250 88, 260 110, 288 110"/></circle>
      <circle r="4" fill="var(--bg)"><animateMotion dur="2.2s" repeatCount="indefinite" path="M195 160 C 300 200, 340 120, 362 105"/></circle>
      <circle cx="300" cy="110" r="3" fill="var(--bg)"><animate attributeName="opacity" values="0;1;0" dur="0.4s" begin="0.3s" repeatCount="indefinite"/></circle>
      <text x="40" y="250" fill="var(--ink3)" font-size="14" font-family="monospace">$ forge simulate --board uno ✓ running…</text>
    `;
    $$('[data-auth]').forEach(b => b.addEventListener('click', () => authModal(b.getAttribute('data-auth'))));
  }

  function authModal(mode) {
    const isUp = mode === 'signup';
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="auth-modal-desc">${isUp ? 'Create your free CircuitTecture account to start building and saving circuits.' : 'Sign in to access your saved circuits, templates, and workspace.'}</div>
      ${isUp ? `
      <div class="field">
        <label>Full Name</label>
        <div class="input-icon-wrap">
          <span class="input-icon">👤</span>
          <input id="af-name" type="text" placeholder="Ada Lovelace" autocomplete="name">
        </div>
      </div>` : ''}
      <div class="field">
        <label>Email address</label>
        <div class="input-icon-wrap">
          <span class="input-icon">✉️</span>
          <input id="af-email" type="email" placeholder="you@example.com" autocomplete="email">
        </div>
      </div>
      <div class="field">
        <div class="field-header-row">
          <label>Password</label>
          ${isUp ? '' : '<a href="#" class="auth-forgot-link" id="af-forgot">Forgot password?</a>'}
        </div>
        <div class="input-icon-wrap">
          <span class="input-icon">🔒</span>
          <input id="af-pass" type="password" placeholder="••••••••" autocomplete="${isUp ? 'new-password' : 'current-password'}">
        </div>
      </div>
      <div class="form-err" id="af-err"></div>
      <button class="btn primary block lg" id="af-go">${isUp ? 'Create Account 🚀' : 'Log In ⚡'}</button>
      <div class="auth-switch">${isUp ? 'Already have an account? <a href="#" id="af-switch">Log in</a>' : 'New to CircuitTecture? <a href="#" id="af-switch">Create free account</a>'}</div>`;

    const m = modal({ title: isUp ? '⚡ Join CircuitTecture' : '⚡ Welcome Back', body });
    const nameInput = body.querySelector('#af-name'), emailInput = body.querySelector('#af-email'), passInput = body.querySelector('#af-pass');
    
    body.querySelector('#af-switch').addEventListener('click', (e) => { e.preventDefault(); m.close(); authModal(isUp ? 'login' : 'signup'); });
    
    const forgotBtn = body.querySelector('#af-forgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const emailVal = emailInput ? emailInput.value.trim() : '';
        if (emailVal) {
          toast(`Password reset link requested for ${esc(emailVal)}`, 'ok', 4000);
        } else {
          toast('Enter your email address to receive password reset instructions.', 'warn', 4000);
          emailInput && emailInput.focus();
        }
      });
    }

    const submit = async () => {
      const err = body.querySelector('#af-err'); err.textContent = '';
      const goBtn = body.querySelector('#af-go');
      goBtn.disabled = true;
      goBtn.textContent = 'Please wait...';
      try {
        const r = isUp
          ? await api('/api/signup', 'POST', { name: nameInput ? nameInput.value.trim() : '', email: emailInput.value.trim(), pass: passInput.value })
          : await api('/api/login', 'POST', { email: emailInput.value.trim(), pass: passInput.value });
        app.user = r.user; m.close();
        toast(`Welcome, ${r.user.name.split(' ')[0]}!`, 'ok');
        const curPage = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
        if (curPage !== '/dashboard') location.href = '/dashboard';
        else enterDashboard(!isUp);
      } catch (e) {
    m.body.querySelector('#af-err').textContent = e.message;
        goBtn.disabled = false;
        goBtn.textContent = isUp ? 'Create Account 🚀' : 'Log In ⚡';
      }
    };

    body.querySelector('#af-go').addEventListener('click', submit);
    body.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    (isUp && nameInput ? nameInput : emailInput).focus();
  }

  /* ================= dashboard ================= */
  async function enterDashboard(firstLogin) {
    if (app.user.role !== 'admin' && app.dashTab === 'admin') app.dashTab = 'mine';
    show('dashboard');
    $('#user-chip').innerHTML = `<span class="a-face">${app.user.avatar || '🧑‍🔧'}</span><span>${esc(app.user.name.split(' ')[0])}</span>`;
    const dashAdminBtn = $('#dash-admin-btn');
    if (dashAdminBtn) dashAdminBtn.classList.toggle('hidden', app.user.role !== 'admin');
    $$('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === app.dashTab));
    renderDashHeader();
    loadStats();
    await loadProjects();
    if (firstLogin && !localStorage.getItem('cf-toured-dash')) setTimeout(() => CS.tour && CS.tour.dashboard(), 600);
  }
  function renderDashHeader() {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const projectCount = (app.myProjects || []).length;
    const subtitle = projectCount === 0
      ? 'Start your first circuit project — or pick a template to get going fast.'
      : projectCount === 1
        ? `You have 1 project. What are we building next?`
        : `You have ${projectCount} projects. What are we building today?`;
    $('#dash-greeting').innerHTML = `
      <div class="dash-greeting-row">
        <div>
          <h2>${greet}, ${esc(app.user.name.split(' ')[0])} 👋</h2>
          <p>${subtitle}</p>
        </div>
        <div class="dash-sort"><label>Sort</label><select id="dash-sort"><option value="updated">Recently edited</option><option value="name">Name</option><option value="created">Date created</option><option value="board">Board type</option><option value="folder">Folder</option><option value="forks">Most forked</option><option value="likes">Most liked</option></select></div>
      </div>`;
    const s = $('#dash-sort'); if (s) { s.value = app.sort; s.addEventListener('change', () => { app.sort = s.value; loadProjects(); }); }
  }
  async function loadStats() {
    try {
      const { stats } = await api('/api/stats');
      $('#dash-stats').innerHTML = `<div class="side-title">Your lab</div><div class="stat-grid">
        <div class="stat-card"><b>${stats.projects}</b><span>projects</span></div>
        <div class="stat-card"><b>${stats.public}</b><span>public</span></div>
        <div class="stat-card"><b>${stats.forks}</b><span>forks</span></div>
        <div class="stat-card"><b>${stats.likes}</b><span>likes</span></div></div>`;
    } catch { }
  }
  function renderRecents(projects) {
    const recentsDiv = $('#dash-recents');
    if (!recentsDiv) return;
    if (app.dashTab !== 'mine' || app.search || app.folder || app.tag || !projects || projects.length < 2) {
      recentsDiv.classList.add('hidden');
      recentsDiv.innerHTML = '';
      return;
    }
    const sorted = projects.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    recentsDiv.classList.remove('hidden');
    recentsDiv.innerHTML = `
      <div class="recents-title" style="margin: 24px 0 12px; font-size: 14px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: 0.5px;">Continue where you left off</div>
      <div class="recents-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
        ${sorted.map(p => `
          <div class="project-card recent-card" data-id="${p.id}" tabindex="0" style="display: flex; height: 80px; align-items: center; padding: 8px; gap: 12px;">
            <div class="pc-thumb-mini" style="width: 80px; height: 64px; flex-shrink: 0; background: var(--bg3); border-radius: 8px; overflow: hidden; display: grid; place-items: center; border: 1px solid var(--line2);">
              ${thumbSvg(p)}
            </div>
            <div class="recent-body" style="flex: 1; min-width: 0;">
              <h4 style="margin: 0 0 2px; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink);">${esc(p.name)}</h4>
              <div style="font-size: 11px; color: var(--ink3);">${boardName(p.board)}</div>
              <div style="font-size: 10px; color: var(--acc); margin-top: 4px;">Edited ${CS.fmtTime(p.updatedAt)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    recentsDiv.querySelectorAll('.recent-card').forEach(card => {
      card.addEventListener('click', () => openProject(card.getAttribute('data-id')));
      card.addEventListener('keypress', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProject(card.getAttribute('data-id')); } });
    });
  }

  async function loadProjects() {
    const grid = $('#dash-projects');
    const skelCount = app.myProjects ? Math.min(app.myProjects.length, 8) : 6;
    CS.skeletons(grid, skelCount < 1 ? 6 : skelCount);
    try {
      if (app.dashTab === 'templates') {
        const { templates } = await api('/api/templates');
        const filtered = templates.filter(p =>
          (!app.search || (p.name + ' ' + (p.tags || []).join(' ') + ' ' + boardName(p.board)).toLowerCase().includes(app.search)));
        return renderProjectGrid(grid, filtered, 'templates');
      }
      if (app.dashTab === 'community') {
        const { projects } = await api('/api/community');
        const filtered = projects.filter(p =>
          (!app.search || (p.name + ' ' + (p.tags || []).join(' ') + ' ' + boardName(p.board)).toLowerCase().includes(app.search)));
        return renderProjectGrid(grid, filtered, 'community');
      }
      const { projects } = await api('/api/projects');
      app.myProjects = projects;
      renderFolders(projects);
      renderRecents(projects);
      const filtered = sortProjects(projects.filter(p =>
        (!app.folder || p.folder === app.folder) && (!app.tag || (p.tags || []).includes(app.tag)) &&
        (!app.search || (p.name + ' ' + (p.tags || []).join(' ') + ' ' + boardName(p.board)).toLowerCase().includes(app.search))));
      let mainGridProjects = filtered;
      if (app.dashTab === 'mine' && !app.search && !app.folder && !app.tag && projects.length >= 2) {
        const recentIds = projects.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3).map(p => p.id);
        mainGridProjects = filtered.filter(p => !recentIds.includes(p.id));
      }
      renderProjectGrid(grid, mainGridProjects, 'mine');
    } catch (e) { grid.innerHTML = `<div class="empty-state"><span class="e-icon">😵</span><h3>Couldn't load</h3><p>${esc(e.message)}</p></div>`; }
  }
  function sortProjects(projects) {
    const arr = projects.slice();
    if (app.sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (app.sort === 'board') arr.sort((a, b) => boardName(a.board).localeCompare(boardName(b.board)) || b.updatedAt - a.updatedAt);
    else if (app.sort === 'folder') arr.sort((a, b) => (a.folder || '').localeCompare(b.folder || '') || b.updatedAt - a.updatedAt);
    else if (app.sort === 'created') arr.sort((a, b) => b.createdAt - a.createdAt);
    else if (app.sort === 'forks') arr.sort((a, b) => (b.forks || 0) - (a.forks || 0) || b.updatedAt - a.updatedAt);
    else if (app.sort === 'likes') {
      const liked = p => (p.likers || []).length;
      arr.sort((a, b) => liked(b) - liked(a) || b.updatedAt - a.updatedAt);
    }
    else arr.sort((a, b) => b.updatedAt - a.updatedAt);
    return arr;
  }
  function renderFolders(projects) {
    const folders = [...new Set(projects.map(p => p.folder).filter(Boolean))];
    const tags = [...new Set(projects.flatMap(p => p.tags || []))];
    $('#folder-list').innerHTML = `<div class="folder-item ${!app.folder ? 'active' : ''}" data-f="">📁 All projects <span>${projects.length}</span></div>` +
      folders.map(f => `<div class="folder-item ${app.folder === f ? 'active' : ''}" data-f="${esc(f)}">📂 ${esc(f)} <span>${projects.filter(p => p.folder === f).length}</span></div>`).join('') || '';
    $$('.folder-item', $('#folder-list')).forEach(el => el.addEventListener('click', () => { app.folder = el.getAttribute('data-f'); loadProjects(); }));
    $('#tag-cloud').innerHTML = tags.slice(0, 12).map(t => `<span class="tag-pill ${app.tag === t ? 'active' : ''}" data-t="${esc(t)}">#${esc(t)}</span>`).join('') || '<span style="color:var(--ink3);font-size:12px">No tags yet</span>';
    $$('.tag-pill', $('#tag-cloud')).forEach(el => el.addEventListener('click', () => { app.tag = app.tag === el.getAttribute('data-t') ? '' : el.getAttribute('data-t'); loadProjects(); }));
  }
  function thumbSvg(p) {
    if (!p.components) return p.thumb && !/NaN|null/.test(p.thumb) ? p.thumb : `<svg viewBox="0 0 240 130"><text x="120" y="65" fill="var(--ink3)" text-anchor="middle" font-size="24">⚡</text></svg>`;
    return miniThumb(p.components, p.wires || []);
  }
  function miniThumb(comps, wires) {
    const safe = (comps || []).map((c, i) => {
      const d = CS.defs[c.type] || { w: 60, h: 40, pins: [], render: () => '' };
      const x = Number.isFinite(+c.x) ? +c.x : i * 30, y = Number.isFinite(+c.y) ? +c.y : 0;
      const cc = Object.assign({ props: {}, state: {} }, c, { x, y, r: Number.isFinite(+c.r) ? +c.r : 0, props: Object.assign({}, c.props || {}), state: {} });
      (d.props || []).forEach(p => { if (cc.props[p.key] === undefined) cc.props[p.key] = p.def !== undefined ? p.def : (p.type === 'bool' ? false : 0); });
      return cc;
    });
    if (!safe.length) return `<svg viewBox="0 0 240 130"></svg>`;
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    safe.forEach(c => { const d = CS.defs[c.type] || { w: 60, h: 40 }; x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + d.w); y2 = Math.max(y2, c.y + d.h); });
    if (![x1, y1, x2, y2].every(Number.isFinite)) { x1 = 0; y1 = 0; x2 = 240; y2 = 130; }
    const doc = { components: safe, wires: wires || [] };
    let s = `<style>text{font-family:monospace}.pin,.pin-hit,.sel-ring,.wire-hit,.wire-flow,.wire-waypoint{display:none}.wire-path{fill:none;stroke-linecap:round}.lock-glyph{display:none}</style>`;
    if (typeof CS.Wiring !== 'undefined' && CS.Wiring && typeof CS.Wiring.pinWorld === 'function') {
      (wires || []).forEach(wr => {
        const a = CS.Wiring.pinWorld(doc, safe.find(c => c.id === wr.a.c), wr.a.p), b = CS.Wiring.pinWorld(doc, safe.find(c => c.id === wr.b.c), wr.b.p);
        if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
        const pts = Array.isArray(wr.points) && wr.points.length ? [a, ...wr.points.filter(p => Number.isFinite(+p.x) && Number.isFinite(+p.y)).map(p => ({ x:+p.x, y:+p.y })), b] : CS.Wiring.pointsOf(a, b);
        s += `<path class="wire-path" d="${CS.Wiring.roundedPath(pts)}" stroke="${wr.color || '#64748b'}" stroke-width="2.2" opacity=".9"/>`;
      });
    }
    safe.forEach(c => {
      const d = CS.defs[c.type]; if (!d || !d.render) return;
      const cx = d.w / 2, cy = d.h / 2, sx = c.flipX ? -1 : 1, sy = c.flipY ? -1 : 1;
      let body = ''; try { body = d.render(d, c); } catch { body = `<rect width="${d.w}" height="${d.h}" rx="6" fill="#334155"/>`; }
      s += `<g transform="translate(${c.x},${c.y}) rotate(${c.r || 0},${cx},${cy}) translate(${cx},${cy}) scale(${sx},${sy}) translate(${-cx},${-cy})">${body}</g>`;
    });
    const w = Math.max(80, x2 - x1), h = Math.max(60, y2 - y1);
    return `<svg viewBox="${x1 - 12} ${y1 - 12} ${w + 24} ${h + 24}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  }
  function renderProjectGrid(grid, projects, ctx) {
    grid.innerHTML = '';
    if (ctx === 'mine') {
      const nc = document.createElement('div');
      nc.className = 'project-card new-card';
      nc.innerHTML = '<div><span class="plus">＋</span>New project</div>';
      nc.addEventListener('click', () => newProjectModal());
      nc.setAttribute('role', 'button');
      nc.setAttribute('aria-label', 'Create new project');
      nc.tabIndex = 0;
      grid.appendChild(nc);
    }
    if (ctx === 'templates') {
      if (!projects.length) {
        grid.innerHTML = `<div class="empty-state"><span class="e-icon">✨</span><h3>No official templates found</h3><p>Official starter templates will appear here.</p></div>`;
        return;
      }
      projects.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.style.animationDelay = (i * 0.04) + 's';
        card.innerHTML = `
           <div class="pc-thumb">${thumbSvg(p)}<span class="pc-badge" style="background:var(--acc);color:#000">TEMPLATE</span></div>
           <div class="pc-body">
             <h4>${esc(p.name)}</h4>
             <div class="pc-meta"><span>${boardName(p.board)}</span><span>Official Template</span></div>
             ${(p.tags || []).length ? `<div class="pc-tags">${p.tags.slice(0, 3).map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
             <div class="pc-meta" style="margin-top:10px">
               <button class="btn primary sm block" data-act="use-template">Use Template 🚀</button>
             </div>
           </div>`;
        card.setAttribute('role', 'article');
        card.setAttribute('aria-label', `${p.name}, ${boardName(p.board)} official template`);
        card.tabIndex = 0;
        card.addEventListener('click', async e => {
          if (e.target.closest('[data-act="use-template"]')) {
            e.stopPropagation();
            try {
              const r = await api(`/api/templates/${p.id}/fork`, 'POST', {});
              toast('Template copied to your workspace! 🚀');
              openProject(r.project.id);
            } catch (err) { toast(err.message, 'err'); }
            return;
          }
          openProject(p.id);
        });
        grid.appendChild(card);
      });
      return;
    }
    if (!projects.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      if (ctx === 'mine' && !app.search && !app.folder && !app.tag) {
        empty.innerHTML = `
          <div class="empty-illustration" style="font-size:54px;animation:floaty 4s ease-in-out infinite;display:inline-block">🧰</div>
          <h3>Your workbench is empty</h3>
          <p>Start with one of our starter templates to be simulating in under a minute, or create a blank canvas.</p>
          <div style="margin-top:20px;display:flex;gap:12px;justify-content:center">
            <button class="btn primary" id="es-new">＋ New Project</button>
          </div>
          <div style="margin-top:32px;font-size:12px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:1px">Starter Templates</div>
          <div id="empty-templates" style="margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <div class="skel" style="width:140px;height:38px;border-radius:8px"></div>
            <div class="skel" style="width:140px;height:38px;border-radius:8px"></div>
            <div class="skel" style="width:140px;height:38px;border-radius:8px"></div>
          </div>
        `;
        api('/api/templates').then(({ templates }) => {
          const container = empty.querySelector('#empty-templates');
          if (container && templates && templates.length) {
            container.innerHTML = templates.slice(0, 3).map(t => `
              <button class="btn ghost sm" data-template-id="${t.id}" style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid var(--line2);border-radius:8px;background:var(--panel2)">
                <span>${t.name.includes('LED') ? '💡' : t.name.includes('Button') ? '🔘' : '🤖'}</span>
                <span>${esc(t.name.split(' ')[0] + ' ' + (t.name.split(' ')[1] || ''))}</span>
              </button>
            `).join('');
            container.querySelectorAll('[data-template-id]').forEach(btn => {
              btn.addEventListener('click', async () => {
                const tid = btn.getAttribute('data-template-id');
                try {
                  const r = await api(`/api/templates/${tid}/fork`, 'POST', {});
                  toast('Template copied to your workspace! 🚀');
                  openProject(r.project.id);
                } catch (err) { toast(err.message, 'err'); }
              });
            });
          } else if (container) {
            container.innerHTML = '<span style="color:var(--ink3)">No templates available</span>';
          }
        }).catch(() => {
          const container = empty.querySelector('#empty-templates');
          if (container) container.innerHTML = '';
        });
      } else {
        empty.innerHTML = ctx === 'community'
          ? app.search
            ? `<span class="e-icon">🌍</span><h3>No results found</h3><p>Try a different search term or browse Starter Templates instead.</p><button class="btn primary" id="es-browse-templates">Browse Templates ↗</button>`
            : `<span class="e-icon">🌍</span><h3>No public projects yet</h3><p>Be the first! Build something cool and publish it to the community gallery. In the meantime, explore starter templates for inspiration.</p><button class="btn primary" id="es-browse-templates">Browse Templates ↗</button>`
          : app.search || app.folder || app.tag
            ? `<span class="e-icon">🔍</span><h3>Nothing matches</h3><p>Try a different search, or clear the folder/tag filters in the sidebar.</p><button class="btn ghost" id="clear-filters">Clear filters</button>`
            : `<span class="e-icon">🧰</span><h3>Your workbench is empty</h3><p>Start from a template — Blink, weather station, plant watering — and you'll be simulating in under a minute.</p><button class="btn primary" id="es-new">＋ New Project</button>`;
      }
      grid.appendChild(empty);
      const esNew = empty.querySelector('#es-new'); if (esNew) esNew.addEventListener('click', () => newProjectModal());
      const esTemplates = empty.querySelector('#es-browse-templates'); if (esTemplates) esTemplates.addEventListener('click', () => { app.dashTab = 'templates'; $$('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === app.dashTab)); loadProjects(); });
      const cf = empty.querySelector('#clear-filters'); if (cf) cf.addEventListener('click', () => { app.search = ''; app.folder = ''; app.tag = ''; $('#dash-search').value = ''; loadProjects(); });
      return;
    }
    projects.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.style.animationDelay = (i * 0.04) + 's';
      card.innerHTML = `
         <div class="pc-thumb">${thumbSvg(p)}${p.public ? '<span class="pc-badge">PUBLIC</span>' : ''}</div>
         <div class="pc-actions">
           ${ctx === 'community' ? `<button class="btn ghost xs" data-act="fork" title="Fork this project">⑂ Fork</button>` : `<button class="btn ghost xs" data-act="menu" title="Options">⋯</button>`}
         </div>
         <div class="pc-body">
           <h4>${esc(p.name)}</h4>
           <div class="pc-meta"><span>${boardName(p.board)}</span><span>${ctx === 'community' ? `by ${esc(p.owner.name.split(' ')[0])} · ` : ''}${CS.fmtTime(p.updatedAt)}</span></div>
           ${(p.tags || []).length ? `<div class="pc-tags">${p.tags.slice(0, 3).map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
           ${ctx === 'community' ? `<div class="pc-meta" style="margin-top:6px"><span>❤️ ${p.likes} · ⑂ ${p.forks}</span><button class="btn ghost xs" data-like>${p.liked ? '💙 liked' : '🤍 like'}</button></div>` : ''}
         </div>`;
      
      // Add ARIA labels and keyboard navigation
      const status = p.public ? 'Public project' : 'Private project';
      const accessInfo = ctx === 'community' ? `by ${p.owner.name}` : `${boardName(p.board)} board`;
      
      card.setAttribute('role', 'article');
      card.setAttribute('aria-label', `${p.name}, ${accessInfo}, ${status}, last updated ${CS.fmtTime(p.updatedAt)}`);
      card.setAttribute('tabindex', '0');
      
      // Add keyboard event listeners for accessibility
      card.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (ctx === 'community' && e.target.closest('[data-act="fork"]')) {
            const act = e.target.closest('[data-act="fork"]');
            if (act) {
              act.click();
            } else {
              openProject(p.id);
            }
          } else if (ctx === 'community' && e.target.closest('[data-like]')) {
            const likeBtn = e.target.closest('[data-like]');
            if (likeBtn) {
              likeBtn.click();
            }
          } else {
            openProject(p.id);
          }
        }
      });

      // Update this section to include a separate handler for the options menu
      card.addEventListener('click', async e => {
        const act = e.target.closest('[data-act]');
        if (act) {
          e.stopPropagation();
          const action = act.getAttribute('data-act');
          if (action === 'fork') {
            forkProject(p.id);
          } else if (action === 'menu') {
            cardMenu(e, p);
          }
          return;
        }
        if (e.target.closest('[data-like]')) {
          e.stopPropagation();
          try {
            await api(`/api/projects/${p.id}/like`, 'POST', {});
            loadProjects();
          } catch (err) {
            toast(err.message, 'err');
          }
          return;
        }
        openProject(p.id);
      });
      // Add keyboard listener for the menu button specifically, check for null before adding listener
      const menuButton = card.querySelector('.pc-actions button[data-act="menu"]');
      if (menuButton) {
        menuButton.addEventListener('keypress', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-act="menu"]')) {
            e.preventDefault();
            e.stopPropagation(); // Stop propagation to prevent card's general keypress from triggering
            cardMenu(e, p);
          }
        });
      }
      grid.appendChild(card);
    });
  }
  const BOARD_NAMES = { uno: 'Arduino Uno', nano: 'Arduino Nano', mega: 'Arduino Mega', esp32: 'ESP32', esp8266: 'ESP8266', pico: 'Pi Pico', rpi3: 'Raspberry Pi 3', rpi4: 'Raspberry Pi 4', rpi5: 'Raspberry Pi 5' };
  const boardName = b => BOARD_NAMES[b] || b || '—';
  function cardMenu(e, p) {
    menu(e.clientX, e.clientY, [
      { icon: '📂', label: 'Open', fn: () => openProject(p.id) },
      ...(app.user && app.user.role === 'admin' ? [{ icon: '✏️', label: 'Edit properties', fn: () => renameModal(p) }] : []),
      { icon: '📝', label: 'Rename', fn: () => renameModal(p) },
      { icon: '📁', label: 'Move to folder', fn: () => moveModal(p) },
      { icon: '⧉', label: 'Duplicate', fn: async () => { try { await api(`/api/projects/${p.id}/duplicate`, 'POST', {}); toast('Duplicated ✓'); loadProjects(); } catch (err) { toast(err.message, 'err'); } } },
      { icon: '🧾', label: 'Export project (JSON)', fn: () => exportProjectJson(p) },
      ...(app.user && app.user.role === 'admin' ? [{ icon: '⭐', label: 'Duplicate as template', fn: async () => { try { await api(`/api/admin/projects/${p.id}`, 'PUT', { official: true }); toast('Marked as official template'); loadProjects(); } catch (err) { toast(err.message, 'err'); } } }] : []),
      { icon: p.public ? '🙈' : '🌍', label: p.public ? 'Unpublish from community' : 'Publish to community', fn: async () => { try { await api(`/api/projects/${p.id}`, 'PUT', { public: !p.public }); toast(!p.public ? 'Published' : 'Unpublished'); loadProjects(); } catch (err) { toast(err.message, 'err'); } } },
      { icon: '🔗', label: 'Share…', fn: () => openProject(p.id, true) },
      '-',
      { icon: '🗑', label: 'Delete', danger: true, fn: async () => { if (!confirm(`Delete project "${p.name}"?\nLast modified: ${new Date(p.updatedAt).toLocaleString()}\n\nThis cannot be undone.`)) return; try { await api(`/api/projects/${p.id}`, 'DELETE'); toast('Deleted'); loadProjects(); } catch (err) { toast(err.message, 'err'); } } }
    ]);
  }
  async function exportProjectJson(p) {
    try { const { project } = await api(`/api/projects/${p.id}`); CS.download((project.name || 'project').replace(/[^\w-]+/g, '_') + '.circuittecture.json', JSON.stringify(project, null, 2), 'application/json'); }
    catch (err) { toast(err.message, 'err'); }
  }
  function moveModal(p) {
    const body = document.createElement('div');
    const folders = [...new Set((app.myProjects || []).map(p2 => p2.folder).filter(Boolean))];
    const folderOptions = '<option value="">(none)</option>' + folders.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
    body.innerHTML = `
      <div class="field"><label>Move to folder</label><select id="mv-folder">${folderOptions}</select></div>
      <div class="form-note">Projects in folders organize better in your dashboard. Drag projects between folders in the sidebar.</div>`;
    const m = modal({ title: 'Move project', body });
    const btn = document.createElement('button'); btn.className = 'btn primary block'; btn.textContent = 'Move';
    btn.addEventListener('click', async () => {
      const newFolder = $('#mv-folder').value;
      if (newFolder !== p.folder) {
        // optimistic
        p.folder = newFolder;
        loadProjects(); m.close(); toast('Moved ✓');
      } else m.close();
    });
    m.body.appendChild(btn);
  }

  async function renameModal(p) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="field"><label>Project name</label><input type="text" id="rename-name" value="${esc(p.name || '')}" placeholder="Untitled" maxlength="60"></div>
      <div class="field"><label>Folder</label><input type="text" id="rename-folder" value="${esc(p.folder || '')}" placeholder="(none)"></div>`;
    const m = modal({ title: 'Rename project', body });
    const btn = document.createElement('button'); btn.className = 'btn primary block'; btn.textContent = 'Save';
    btn.addEventListener('click', async () => {
      const name = $('#rename-name').value.trim() || 'Untitled';
      const folder = $('#rename-folder').value.trim() || null;
      try {
        await api(`/api/projects/${p.id}`, 'PUT', { name, folder });
        p.name = name; p.folder = folder;
        loadProjects(); m.close(); toast('Renamed ✓');
      } catch (err) { toast(err.message, 'err'); }
    });
    m.body.appendChild(btn);
  }

  /* ================= new project ================= */
  function newProjectModal() {
    const body = document.createElement('div');
    const tpls = [{ id: '', name: 'Blank canvas', icon: '⬜', desc: 'Empty bench — you pick the board.' }, ...CS.templates];
    body.innerHTML = `
      <div class="field"><label>Project name</label><input id="np-name" placeholder="My awesome gadget"></div>
      <div class="field" style="display:flex;gap:10px">
        <div style="flex:1"><label>Board</label><select id="np-board">${Object.entries(BOARD_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div style="flex:1"><label>Language</label><select id="np-lang"><option value="cpp">Arduino C/C++</option><option value="py">MicroPython</option></select></div>
      </div>
      <div class="field"><label>Start from</label><div class="tpl-grid" id="np-tpls" style="max-height:250px;overflow-y:auto"></div></div>`;
    const m = modal({ title: '✨ New Project', body, wide: true });
    let selTpl = '';
    const grid = body.querySelector('#np-tpls');
    grid.innerHTML = tpls.map(t => `<div class="tpl-card" data-t="${t.id}" style="${t.id === '' ? 'border-color:var(--acc)' : ''}"><div class="t-ic">${t.icon}</div><h5>${esc(t.name)}</h5><p>${esc(t.desc)}</p></div>`).join('');
    grid.querySelectorAll('.tpl-card').forEach(c => c.addEventListener('click', () => {
      selTpl = c.getAttribute('data-t');
      grid.querySelectorAll('.tpl-card').forEach(x => x.style.borderColor = '');
      c.style.borderColor = 'var(--acc)';
      if (selTpl) { const t = CS.templates.find(x => x.id === selTpl); if (t) { body.querySelector('#np-board').value = t.board; body.querySelector('#np-lang').value = t.lang; if (!body.querySelector('#np-name').value) body.querySelector('#np-name').value = t.name; } }
    }));
    const btn = document.createElement('button'); btn.className = 'btn primary block lg'; btn.textContent = 'Create project 🚀';
    btn.style.marginTop = '12px';
    btn.addEventListener('click', async () => {
      const name = body.querySelector('#np-name').value.trim() || 'Untitled Project';
      const board = body.querySelector('#np-board').value;
      const lang = body.querySelector('#np-lang').value;
      let code = lang === 'py' ? '# ' + name + '\nfrom machine import Pin\nimport time\n\n# setup\n\nwhile True:\n    pass\n    time.sleep(0.5)' : '// ' + name + '\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  \n}\n';
      let components = [], wires = [];
      if (selTpl) {
        const t = CS.templates.find(x => x.id === selTpl);
        const b = t.build();
        code = b.code; components = b.components; wires = b.wires;
      }
      try {
        const { project } = await api('/api/projects', 'POST', { name, board, lang, code, components, wires });
        m.close();
        openProject(project.id);
        toast('Project created — happy hacking! ⚡');
      } catch (e) { toast(e.message, 'err'); }
    });
    m.body.appendChild(btn);
  }
  async function forkProject(id) {
    try { const { project } = await api(`/api/projects/${id}/fork`, 'POST', {}); toast('Forked to your lab! ⑂'); openProject(project.id); }
    catch (e) { toast(e.message, 'err'); }
  }

  /* ================= editor ================= */
  async function openLatestOrCreate() {
    try {
      const { projects } = await api('/api/projects');
      if (projects && projects.length) {
        openProject(projects[0].id);
      } else {
        const { project } = await api('/api/projects', 'POST', {
          name: 'My First Circuit', board: 'uno', lang: 'cpp',
          code: '// My First Circuit\nvoid setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  Serial.println("LED HIGH");\n  delay(1000);\n  digitalWrite(13, LOW);\n  Serial.println("LED LOW");\n  delay(1000);\n}\n',
          components: [], wires: []
        });
        openProject(project.id);
      }
    } catch (e) { toast(e.message, 'err'); }
  }

  async function openProject(id, openShare) {
    const curPage = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (curPage !== '/editor') {
      location.href = '/editor?id=' + encodeURIComponent(id) + (openShare ? '&share=1' : '');
      return;
    }
    show('editor-view');
    // skeleton state
    $('#proj-name').value = 'Loading…';
    buildLibrary(true);
    try {
      const { project } = await api(`/api/projects/${id}`);
      app.project = project;
      app.dirty = false;
      setupEditorOnce();
      $('#proj-name').value = project.name;
      CS.editor.setLang(project.lang || 'cpp');
      $('#lang-select').value = project.lang || 'cpp';
      CS.editor.setCode(project.code || '');
      CS.canvas.setDoc({ components: project.components || [], wires: project.wires || [], viewport: project.viewport });
      buildLibrary(false);
      refreshGuide(); refreshChecker(); updateCanvasHint(); updateUndoBtns();
      serialWrite('— project loaded: ' + project.name + ' —', true);
      if (openShare) shareModal();
      if (!localStorage.getItem('cf-toured-editor')) setTimeout(() => CS.tour && CS.tour.editor(), 700);
    } catch (e) {
      toast(e.message, 'err');
      location.href = '/dashboard';
    }
  }

  async function saveProject(withVersion) {
    if (!app.project) return;
    const doc = CS.canvas.getDoc();
    const payload = {
      code: CS.editor.getCode(), components: doc.components, wires: doc.wires, viewport: doc.viewport,
      lang: $('#lang-select').value, name: $('#proj-name').value.trim() || app.project.name,
      thumb: miniThumb(doc.components, doc.wires)
    };
    if (withVersion) payload.saveVersion = prompt('Version name (e.g. "working servo sweep"):') || undefined;
    setSaveState('saving');
    try {
      if (app.project.official && app.user && app.user.role !== 'admin') {
        const r = await api(`/api/templates/${app.project.id}/fork`, 'POST', {});
        app.project = r.project;
        toast('Saved as your private copy 📁');
      }
      if (app.project.id) await api(`/api/projects/${app.project.id}`, 'PUT', payload);
      else { const r = await api('/api/projects', 'POST', payload); app.project = r.project; }
      app.project.name = payload.name;
      app.dirty = false;
      setSaveState('saved');
      if (withVersion) toast('Snapshot saved 📸');
    } catch (e) { setSaveState('idle'); toast('Save failed: ' + e.message, 'err'); }
  }
  function setSaveState(s) {
    const el = $('#save-state');
    if (!el) return;
    el.className = 'save-state ' + s;
    if (s === 'saved') {
      el.textContent = '✓ saved';
      el.title = 'Last saved at ' + new Date().toLocaleTimeString();
    } else if (s === 'saving') {
      el.textContent = '⟳ saving…';
      el.title = 'Saving your project…';
    } else if (app.dirty) {
      el.textContent = '● unsaved changes';
      el.title = 'Ctrl+S to save';
    } else {
      el.textContent = '';
      el.title = '';
    }
  }
  function markDirty() { if (!app.project) return; app.dirty = true; setSaveState('idle'); }

  let editorReady = false;
  function setupEditorOnce() {
    if (editorReady) return;
    editorReady = true;
    CS.canvas = new CS.CircuitCanvas($('#circuit'));
    CS.editor = new CS.CodeEditor($('#code-editor'));
    CS.sim = new CS.Engine();
    bindEditorUI();
    CS.editor.onChange = () => { markDirty(); hideErr(); };
    CS.editor.onProblemsChange = renderProblems;
    CS.bus.on('docChanged', () => { markDirty(); refreshGuide(); refreshChecker(); updateCanvasHint(); renderMiniMap(); updateScopePinOptions(); sendDocChange(); });
    CS.bus.on('canvasRendered', renderMiniMap);
    CS.bus.on('selectionChanged', renderInspector);
    CS.bus.on('wireAdded', () => { });
    CS.bus.on('viewChanged', () => { $('#zoom-level').textContent = Math.round(CS.canvas.view.z * 100) + '%'; renderMiniMap(); });
    CS.bus.on('undoState', updateUndoBtns);
    connectMultiplayer();
  }

  /* ---------- Multiplayer frontend ---------- */
  let multiplayerWs = null;
  function connectMultiplayer() {
    if (!app.project || multiplayerWs) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws/project/${app.project.id}`;
    try {
      multiplayerWs = new WebSocket(wsUrl);
      multiplayerWs.onopen = function () { /* connected */ };
      multiplayerWs.onmessage = function (ev) {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'doc_change' && msg.userId !== (CS.user && CS.user.id)) {
            if (CS.canvas && msg.components) CS.canvas.doc.components = msg.components;
            if (CS.canvas && msg.wires) CS.canvas.doc.wires = msg.wires;
            if (CS.canvas) CS.canvas.render();
          } else if (msg.type === 'presence') {
            updateMultiplayerPresence(msg);
          } else if (msg.type === 'cursor' && msg.userId !== (CS.user && CS.user.id)) {
            renderRemoteCursor(msg);
          }
        } catch { /* ignore */ }
      };
      multiplayerWs.onclose = function () { multiplayerWs = null; };
      multiplayerWs.onerror = function () { if (multiplayerWs) { multiplayerWs.close(); multiplayerWs = null; } };
    } catch { /* ignore */ }
  }
  function sendDocChange() {
    if (!multiplayerWs || multiplayerWs.readyState !== WebSocket.OPEN) return;
    if (!CS.canvas) return;
    multiplayerWs.send(JSON.stringify({
      type: 'doc_change',
      components: CS.canvas.doc.components,
      wires: CS.canvas.doc.wires
    }));
  }
  function updateMultiplayerPresence(msg) {
    let bar = $('#mp-presence');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'mp-presence';
      bar.style.cssText = 'position:absolute;top:46px;left:0;right:0;z-index:50;background:var(--panel2);border-bottom:1px solid var(--line2);padding:4px 12px;font-size:11px;display:flex;gap:8px;align-items:center;color:var(--ink2)';
      const canvasWrap = $('#canvas-wrap');
      if (canvasWrap) canvasWrap.style.position = 'relative';
      if (canvasWrap) canvasWrap.appendChild(bar);
    }
    // Remove old entries for this user
    const existing = bar.querySelector(`[data-mp-user="${esc(msg.user && msg.user.id || 'guest')}"]`);
    if (existing) existing.remove();
    if (msg.action === 'leave') return;
    const chip = document.createElement('span');
    chip.setAttribute('data-mp-user', esc(msg.user && msg.user.id || 'guest'));
    chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;background:var(--bg1);font-size:11px`;
    chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(msg.color || '#22c55e')}"></span>${esc(msg.user && msg.user.name || 'Guest')} ${msg.action === 'join' ? 'joined' : 'left'}`;
    bar.appendChild(chip);
  }
  function renderRemoteCursor(msg) {
    let el = document.getElementById('mp-cursor-' + esc(msg.userId));
    if (!el) {
      el = document.createElement('div');
      el.id = 'mp-cursor-' + esc(msg.userId);
      el.style.cssText = 'position:absolute;width:12px;height:12px;border-radius:50%;pointer-events:none;z-index:9999;transition:transform 0.15s;border:2px solid white';
      const canvasWrap = $('#canvas-wrap');
      if (canvasWrap) canvasWrap.appendChild(el);
    }
    el.style.background = esc(msg.color || '#22c55e');
    if (CS.canvas) {
      const v = CS.canvas.view;
      el.style.transform = `translate(${(msg.x - v.x) * v.z}px, ${(msg.y - v.y) * v.z}px)`;
    }
  }
  function updateUndoBtns() { $('#undo-btn').disabled = !CS.canvas.undoStack.length; $('#redo-btn').disabled = !CS.canvas.redoStack.length; }
  function updateCanvasHint() {
    const hint = $('#canvas-hint');
    if (!hint) return;
    const count = CS.canvas.doc.components.length;
    hint.style.display = count ? 'none' : '';
    if (!count) {
      hint.querySelector('p').innerHTML = 'Drag components from the <b>parts bin</b> on the left, then <b>click a pin</b> and drag to another pin to wire them. Press <b>▶</b> to run your code.';
    }
  }
  function miniMapPoint(e) {
    const svg = $('#mini-map-svg'); if (!svg || !CS.canvas || !svg.viewBox) return null;
    const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: vb.x + (e.clientX - r.left) / r.width * vb.width, y: vb.y + (e.clientY - r.top) / r.height * vb.height };
  }
  function centerCanvasOn(p) {
    if (!p || !CS.canvas) return;
    const r = CS.canvas.svg.getBoundingClientRect(), z = CS.canvas.view.z;
    CS.canvas.view.x = r.width / 2 - p.x * z;
    CS.canvas.view.y = r.height / 2 - p.y * z;
    CS.canvas.applyView(); CS.bus.emit('viewChanged');
  }
  function bindMiniMap() {
    const svg = $('#mini-map-svg'); if (!svg || svg._bound) return; svg._bound = true;
    let dragging = false;
    svg.addEventListener('pointerdown', e => { dragging = true; svg.setPointerCapture && svg.setPointerCapture(e.pointerId); centerCanvasOn(miniMapPoint(e)); e.preventDefault(); });
    svg.addEventListener('pointermove', e => { if (dragging) centerCanvasOn(miniMapPoint(e)); });
    svg.addEventListener('pointerup', e => { dragging = false; svg.releasePointerCapture && svg.releasePointerCapture(e.pointerId); });
    svg.addEventListener('pointercancel', () => { dragging = false; });
  }
  function renderMiniMap() {
    const svg = $('#mini-map-svg'); if (!svg || !CS.canvas) return;
    const doc = CS.canvas.doc;
    if (!doc.components.length) { svg.innerHTML = '<text x="50%" y="54%" text-anchor="middle">overview</text>'; return; }
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    doc.components.forEach(c => { const d = CS.defs[c.type]; if (!d) return; x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + d.w); y2 = Math.max(y2, c.y + d.h); });
    const pad = 40, w = Math.max(1, x2 - x1 + pad * 2), h = Math.max(1, y2 - y1 + pad * 2);
    const r = CS.canvas.svg.getBoundingClientRect();
    const vx = (-CS.canvas.view.x) / CS.canvas.view.z, vy = (-CS.canvas.view.y) / CS.canvas.view.z;
    const vw = r.width / CS.canvas.view.z, vh = r.height / CS.canvas.view.z;
    svg.setAttribute('viewBox', `${x1 - pad} ${y1 - pad} ${w} ${h}`);
    svg.innerHTML = `<rect x="${x1 - pad}" y="${y1 - pad}" width="${w}" height="${h}" rx="10" class="mm-bg"/>` +
      doc.wires.map(wr => { const a = CS.Wiring.pinWorld(doc, doc.components.find(c => c.id === wr.a.c), wr.a.p); const b = CS.Wiring.pinWorld(doc, doc.components.find(c => c.id === wr.b.c), wr.b.p); return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="mm-wire"/>` : ''; }).join('') +
      doc.components.map(c => { const d = CS.defs[c.type]; return d ? `<rect x="${c.x}" y="${c.y}" width="${d.w}" height="${d.h}" rx="5" class="mm-comp"/>` : ''; }).join('') +
      `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" class="mm-view"/>`;
  }

  /* ---------- library panel ---------- */
  function buildLibrary(skeleton) {
    const list = $('#lib-list');
    if (skeleton) { CS.skeletons(list, 8, 'skel-row'); return; }
    const q = ($('#lib-search').value || '').toLowerCase();
    list.innerHTML = '';
    let shown = 0;
    for (const cat of CS.LIB_CATS) {
      const defs = Object.values(CS.defs).filter(d => d.cat === cat && (!q || (d.name + ' ' + (d.desc || '')).toLowerCase().includes(q)));
      if (!defs.length) continue;
      const cEl = document.createElement('div'); cEl.className = 'lib-cat'; cEl.textContent = cat;
      list.appendChild(cEl);
      defs.sort((a, b) => a.name.localeCompare(b.name));
      defs.forEach((d, i) => {
        shown++;
        const item = document.createElement('div');
        item.className = 'lib-item';
        item.draggable = true;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', `Add ${d.name} to canvas`);
        item.innerHTML = `<span class="li-ic">${d.icon}</span><span><div class="li-name">${esc(d.name)}</div><div class="li-sub">${d.pins.length} pin${d.pins.length !== 1 ? 's' : ''}</div></span>`;
        item.title = d.desc || d.name;
        item.addEventListener('dragstart', e => { e.dataTransfer.setData('cf/type', d.type); item.classList.add('dragging'); });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dblclick', () => { const v = CS.canvas.view, r = CS.canvas.svg.getBoundingClientRect(); CS.canvas.addComponent(d.type, (r.width / 2 - v.x) / v.z - d.w / 2 + (Math.random() * 40 - 20), (r.height / 2 - v.y) / v.z - d.h / 2 + (Math.random() * 40 - 20)); });
        item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.dispatchEvent(new Event('dblclick')); } });
        list.appendChild(item);
      });
    }
    if (!shown) list.innerHTML = `<div class="empty-state" style="padding:34px 8px"><span class="e-icon">🔍</span><h3>No parts found</h3><p>Try "led", "sensor", "servo"…</p></div>`;
  }

  /* ---------- editor problems ---------- */
  function renderProblems(items) {
    const panel = $('#problems-panel'), list = $('#problems-list');
    if (!panel || !list) return;
    const problems = items || (CS.editor && CS.editor.problems) || [];
    panel.classList.toggle('hidden', !problems.length);
    list.innerHTML = problems.length ? problems.map(p => `<button class="problem-row ${p.severity === 'warning' ? 'warn' : 'err'}" data-line="${p.line || 1}"><span>${p.severity === 'warning' ? '🟡' : '🔴'}</span><span>Line ${p.line || '?'}: ${esc(p.message || '')}</span></button>`).join('') : '';
    attachProblemHandlers();
  }

  function attachProblemHandlers() {
    $$('#problems-list [data-line]').forEach(b => b.addEventListener('click', () => CS.editor && CS.editor.revealLine && CS.editor.revealLine(+b.getAttribute('data-line'))));
  }

  /* ---------- inspector ---------- */
  function renderInspector() {
    const box = $('#inspector');
    const sel = CS.canvas ? CS.canvas.selection : new Set();
    const selW = CS.canvas ? CS.canvas.selWires : new Set();
    if (!sel.size && !selW.size) {
      box.innerHTML = `<div class="insp-empty"><div style="font-size:34px">🔎</div><p>Select a component or wire to edit its properties.</p><p style="color:var(--ink3);font-size:12px;margin-top:12px">Hover any pin for its datasheet tooltip.</p></div>`;
      return;
    }
    if (selW.size && !sel.size) {
      const w = CS.canvas.wireById([...selW][0]);
      if (!w) return;
      box.innerHTML = `<div class="insp-title">🔌 Wire / net</div><div class="insp-type">${esc(pinName(w.a))} ↔ ${esc(pinName(w.b))}</div>
        <div class="prop-row"><label>Signal label</label><input type="text" id="wire-label" value="${esc(w.label || '')}" placeholder="TRIG, ECHO, SDA…"></div>
        <div class="prop-row"><label>Signal color</label><input type="color" id="wire-col" value="${w.color || '#4ade80'}"></div>
        <div class="prop-row"><label>Wire style</label><select id="wire-style"><option value="ortho" ${(w.style || 'ortho') !== 'smooth' ? 'selected' : ''}>Orthogonal</option><option value="smooth" ${(w.style || 'ortho') === 'smooth' ? 'selected' : ''}>Smooth</option></select></div>
        <div class="insp-tip">Drag the wire body to add or move a bend point. Double-click a bend handle to remove it.</div>
        <div class="insp-actions"><button class="btn ghost sm" id="wire-clear">Clear bends</button><button class="btn danger sm" id="wire-del">Delete wire</button></div>`;
      $('#wire-label').addEventListener('input', CS.debounce(() => { w.label = $('#wire-label').value.trim().slice(0, 24); CS.canvas.refreshWire(w); markDirty(); }, 250));
      $('#wire-col').addEventListener('input', () => { w.color = $('#wire-col').value; w._path.setAttribute('stroke', w.color); markDirty(); });
      $('#wire-style').addEventListener('change', () => { w.style = $('#wire-style').value; CS.canvas.refreshWire(w); markDirty(); });
      $('#wire-clear').addEventListener('click', () => { CS.canvas.pushUndo(); w.points = []; CS.canvas.refreshWire(w); markDirty(); });
      $('#wire-del').addEventListener('click', () => { CS.canvas.pushUndo(); CS.canvas.doc.wires = CS.canvas.doc.wires.filter(x => x.id !== w.id); w._g.remove(); CS.canvas.selWires.delete(w.id); renderInspector(); CS.bus.emit('docChanged'); });
      return;
    }
    if (sel.size > 1) {
      const selIds = Array.from(sel);
      const firstValidId = selIds.find(id => {
        return CS.canvas.doc.components.some(c => c.id === id) || 
               CS.canvas.doc.wires.some(w => w.id === id);
      });
      
      if (!firstValidId) {
        box.innerHTML = `<div class="insp-empty">⚠️ Invalid selection</div>`;
        return;
      }
      
      box.innerHTML = `<div class="insp-empty"><div style="font-size:30px">${sel.size}× 🧩</div><p>${sel.size} components selected.</p>
        <div class="insp-actions" style="justify-content:center;flex-wrap:wrap">
          <button class="btn ghost sm" id="ma-rot">🔄 Rotate</button><button class="btn ghost sm" id="ma-dup">⧉ Duplicate</button><button class="btn ghost sm" id="ma-lock">🔒 Lock</button><button class="btn ghost sm" id="ma-unlock">🔓 Unlock</button><button class="btn danger sm" id="ma-del">🗑 Delete</button>
          <button class="btn ghost sm" id="ma-group">🧩 Group</button><button class="btn ghost sm" id="ma-ungroup">Ungroup</button>
          <button class="btn ghost sm" id="ma-al">Align L</button><button class="btn ghost sm" id="ma-ac">Align C</button><button class="btn ghost sm" id="ma-ar">Align R</button>
          <button class="btn ghost sm" id="ma-at">Align T</button><button class="btn ghost sm" id="ma-am">Align M</button><button class="btn ghost sm" id="ma-ab">Align B</button>
          <button class="btn ghost sm" id="ma-dx">Distribute H</button><button class="btn ghost sm" id="ma-dy">Distribute V</button>
        </div></div>`;
      $('#ma-rot').addEventListener('click', () => CS.canvas.rotateSelection());
      $('#ma-dup').addEventListener('click', () => CS.canvas.duplicate());
      $('#ma-lock').addEventListener('click', () => CS.canvas.setLockedSelection(true));
      $('#ma-unlock').addEventListener('click', () => CS.canvas.setLockedSelection(false));
      $('#ma-del').addEventListener('click', () => CS.canvas.deleteSelection());
      $('#ma-group').addEventListener('click', () => CS.canvas.groupSelection());
      $('#ma-ungroup').addEventListener('click', () => CS.canvas.ungroupSelection());
      [['#ma-al','left'],['#ma-ac','hcenter'],['#ma-ar','right'],['#ma-at','top'],['#ma-am','vcenter'],['#ma-ab','bottom']].forEach(([id, m]) => $(id).addEventListener('click', () => CS.canvas.alignSelection(m)));
      $('#ma-dx').addEventListener('click', () => CS.canvas.distributeSelection('x'));
      $('#ma-dy').addEventListener('click', () => CS.canvas.distributeSelection('y'));
      return;
    }
    const firstValidId = [...sel][0];
    const c = CS.canvas.compById(firstValidId);
    const def = CS.defs[c.type]; if (!def) return;
    let html = `<div class="insp-title">${def.icon} ${esc(c.label || def.name)}</div><div class="insp-type">${def.cat} · id ${c.id.slice(0, 6)}</div>`;
    html += `<div class="prop-row"><label>Label</label><input type="text" id="insp-label" value="${esc(c.label || '')}" placeholder="${esc(def.name)}"></div>`;
    html += `<div class="prop-row"><label>X</label><input type="number" id="insp-x" value="${Math.round((+c.x || 0) * 10) / 10}" step="1"></div>`;
    html += `<div class="prop-row"><label>Y</label><input type="number" id="insp-y" value="${Math.round((+c.y || 0) * 10) / 10}" step="1"></div>`;
    html += `<div class="prop-row"><label>Rotation (°)</label><input type="number" id="insp-r" value="${Math.round((+c.r || 0) * 10) / 10}" step="1"></div>`;
    html += `<div class="prop-row"><label>Locked</label><input type="checkbox" id="insp-locked" ${c.locked ? 'checked' : ''}></div>`;
    (def.props || []).forEach(p => {
      if (p.type === 'number') html += `<div class="prop-row"><label>${esc(p.label)}</label><input type="number" data-prop="${p.key}" value="${c.props[p.key]}" ${p.min != null ? `min="${p.min}"` : ''} ${p.max != null ? `max="${p.max}"` : ''} ${p.step ? `step="${p.step}"` : ''}></div>`;
      else if (p.type === 'range') html += `<div class="prop-row"><label>${esc(p.label)}</label><input type="range" data-prop="${p.key}" value="${c.props[p.key]}" min="${p.min ?? 0}" max="${p.max ?? 1}" step="${p.step ?? 0.01}"><span style="font-family:var(--mono);font-size:11px;width:34px;text-align:right" data-propval="${p.key}">${fmtProp(c.props[p.key])}</span></div>`;
      else if (p.type === 'bool') html += `<div class="prop-row"><label>${esc(p.label)}</label><input type="checkbox" data-prop="${p.key}" ${c.props[p.key] ? 'checked' : ''}></div>`;
      else if (p.type === 'select') html += `<div class="prop-row"><label>${esc(p.label)}</label><select data-prop="${p.key}">${p.options.map(([v, n]) => `<option value="${v}" ${c.props[p.key] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
      else if (p.type === 'dip4') html += `<div class="prop-row"><label>${esc(p.label)}</label><span style="display:flex;gap:4px">${(c.props.sw || []).map((s, i) => `<button class="btn xs ${s ? 'primary' : 'ghost'}" data-dip="${i}">${i + 1}</button>`).join('')}</span></div>`;
    });
    html += `<div class="insp-actions">
      <button class="btn ghost sm" id="insp-rot">🔄 Rotate</button>
      <button class="btn ghost sm" id="insp-dup">⧉ Duplicate</button>
      <button class="btn danger sm" id="insp-del">🗑 Delete</button></div>`;
    html += `<div class="insp-tip">💡 ${esc(def.desc || '')}</div>`;
    if (def.mcu || ['potentiometer', 'ultrasonic', 'keypad'].includes(c.type)) {
      html += `<div class="insp-pinlist"><div class="side-title">Pinout</div><table>${def.pins.slice(0, 40).map(p => `<tr><td>${esc(p.id)}</td><td>${esc((p.kind || '').split(' ')[0])}</td><td>${esc(p.label || '')}</td></tr>`).join('')}</table></div>`;
    }
    box.innerHTML = html;
    $('#insp-label').addEventListener('input', debounce(() => { c.label = $('#insp-label').value.trim(); markDirty(); }, 400));
    const applyPose = CS.debounce(() => {
      const nx = +$('#insp-x').value, ny = +$('#insp-y').value, nr = +$('#insp-r').value;
      if (Number.isFinite(nx)) c.x = nx;
      if (Number.isFinite(ny)) c.y = ny;
      c.r = Number.isFinite(nr) ? ((nr % 360) + 360) % 360 : 0;
      CS.canvas.applyCompTransform(c, c._g); CS.canvas.refreshWiresFor(c.id); markDirty();
    }, 150);
    ['#insp-x', '#insp-y', '#insp-r'].forEach(id => $(id).addEventListener('input', applyPose));
    $('#insp-locked').addEventListener('change', () => { c.locked = $('#insp-locked').checked; CS.canvas.updateComp(c.id); markDirty(); });
    box.querySelectorAll('[data-prop]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.getAttribute('data-prop');
      const p = def.props.find(x => x.key === k);
      if (p.type === 'number' || p.type === 'range') {
        let v = +inp.value;
        if (!Number.isFinite(v)) v = +p.def || 0;
        if (p.min != null) v = Math.max(+p.min, v);
        if (p.max != null) v = Math.min(+p.max, v);
        c.props[k] = v; inp.value = v;
      } else c.props[k] = p.type === 'bool' ? inp.checked : inp.value;
      const pv = box.querySelector(`[data-propval="${k}"]`); if (pv) pv.textContent = fmtProp(c.props[k]);
      CS.canvas.updateComp(c.id); markDirty();
    }));
    box.querySelectorAll('[data-dip]').forEach(b => b.addEventListener('click', () => {
      const i = +b.getAttribute('data-dip');
      c.props.sw[i] = !c.props.sw[i];
      CS.canvas.updateComp(c.id); markDirty(); renderInspector();
    }));
    $('#insp-rot').addEventListener('click', () => CS.canvas.rotateSelection());
    $('#insp-dup').addEventListener('click', () => CS.canvas.duplicate());
    $('#insp-del').addEventListener('click', () => CS.canvas.deleteSelection());
  }
  const fmtProp = v => typeof v === 'number' ? (v >= 100 ? Math.round(v) : Math.round(v * 100) / 100) : v;
  function pinName(ref) {
    const c = CS.canvas.compById(ref.c); if (!c) return '?';
    const d = CS.defs[c.type];
    return `${c.label || d.name} · ${ref.p}`;
  }

  /* ---------- wiring guide ---------- */
  CS.wiringGuide = function (doc) {
    const parent = new Map();
    const find = x => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
    const union = (a, b) => parent.set(find(b), find(a));
    doc.wires.forEach(w => union(w.a.c + '.' + w.a.p, w.b.c + '.' + w.b.p));
    doc.components.forEach(c => { const d = CS.defs[c.type]; if (d && d.links) (typeof d.links === 'function' ? d.links() : d.links).forEach(([a, b]) => union(c.id + '.' + a, c.id + '.' + b)); });
    const groups = new Map();
    doc.components.forEach(c => {
      const d = CS.defs[c.type]; if (!d) return;
      d.pins.forEach(p => {
        const node = c.id + '.' + p.id;
        if (!parent.has(node)) return; // not wired anywhere
        const r = find(node);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push({ c, p });
      });
    });
    const items = [];
    for (const [r, members] of groups) {
      const compIds = new Set(members.map(m => m.c.id));
      if (compIds.size < 2) continue;
      const kind = members.some(m => m.p.kind === 'ground') ? 'ground' : members.some(m => m.p.kind === 'power') ? 'power' : members.some(m => (m.p.kind || '').includes('i2c')) ? 'i2c' : members.some(m => (m.p.kind || '').includes('spi')) ? 'spi' : members.some(m => (m.p.kind || '').includes('analog')) ? 'analog' : 'digital';
      const wire = doc.wires.find(w => find(w.a.c + '.' + w.a.p) === r);
      const names = members.slice(0, 5).map(m => {
        const d = CS.defs[m.c.type];
        const pretty = m.p.label || m.p.id;
        return `<b>${esc(m.c.label || d.name)}</b> ${esc(d.mcu ? (m.p.id.startsWith('D') ? 'pin ' + m.p.id.slice(1) : m.p.id) : pretty)}`;
      });
      items.push({ color: (wire && wire.color) || CS.KIND_COLOR[kind] || '#64748b', kind, text: names.join(' ↔ ') + (members.length > 5 ? ` <i>+${members.length - 5} more</i>` : '') });
    }
    const order = { power: 0, ground: 1, i2c: 2, spi: 3, analog: 4, digital: 5 };
    return items.sort((a, b) => order[a.kind] - order[b.kind]);
  };
  function refreshGuide() {
    const box = $('#guide-body'); if (!box || !CS.canvas) return;
    const items = CS.wiringGuide(CS.canvas.getDoc());
    if (!items.length) {
      box.innerHTML = `<div class="insp-empty"><div style="font-size:32px">🗺️</div><p><b>How it's wired</b></p><p style="color:var(--ink3);font-size:12.5px;margin-top:8px">As you connect pins, a plain-English wiring guide writes itself here. Perfect for reports and homework!</p></div>`;
      return;
    }
    box.innerHTML = `<div style="padding:0 2px 10px;color:var(--ink2);font-size:12.5px"><b>How it's wired</b> — ${items.length} live nets, updated as you build:</div>` +
      items.map(g => `<div class="guide-net"><span class="guide-dot" style="background:${g.color};color:${g.color}"></span><div><div class="gn-text">${g.text}</div><div class="gn-v">${g.kind}</div></div></div>`).join('');
  }

  /* ---------- pinout panel ---------- */
  function renderPinout() {
    const list = $('#pins-list');
    if (!list || !CS.canvas) return;
    const comps = CS.canvas.doc.components || [];
    const wires = CS.canvas.doc.wires || [];
    const mcu = comps.find(c => CS.defs[c.type] && CS.defs[c.type].mcu);
    if (!mcu) {
      list.innerHTML = '<div class="insp-empty"><div style="font-size:32px">🔌</div><p><b>No MCU on canvas</b></p><p style="color:var(--ink3);font-size:12.5px;margin-top:8px">Add an Arduino Uno, ESP32, or Raspberry Pi Pico to see pin occupancy.</p></div>';
      return;
    }
    const def = CS.defs[mcu.type];
    const usedPins = new Map();
    wires.forEach(w => {
      if (w.a.c === mcu.id) usedPins.set(w.a.p, { wireId: w.id, targetComp: CS.canvas.compById(w.b.c), targetPin: w.b.p });
      if (w.b.c === mcu.id) usedPins.set(w.b.p, { wireId: w.id, targetComp: CS.canvas.compById(w.a.c), targetPin: w.a.p });
    });
    const pins = def.pins || [];
    const occupiedPins = new Set(wires.filter(w => (w.a.c === mcu.id) || (w.b.c === mcu.id)).map(w => w.a.c === mcu.id ? w.a.p : w.b.p));
    list.innerHTML = `<div class="pinout-summary">${esc(mcu.label || def.name)} · ${occupiedPins.size}/${pins.length} pins used</div>` +
      pins.map(p => {
        const used = usedPins.get(p.id);
        const kind = p.kind || 'digital';
        const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
        const occClass = used ? 'occupied' : 'free';
        const targetInfo = used ? ` → ${esc(used.targetComp ? (used.targetComp.label || CS.defs[used.targetComp.type]?.name || used.targetComp.type) : '?')}·${used.targetPin || '?'}` : '';
        return `<div class="pinout-row ${occClass}" data-pin="${esc(p.id)}">
          <span class="pinout-marker" style="background:${CS.KIND_COLOR?.[kind] || '#64748b'}"></span>
          <span class="pinout-id">${esc(p.id)}</span>
          <span class="pinout-kind">${kindLabel}</span>
          <span class="pinout-status">${used ? `🔗 ${esc(targetInfo)}` : '—'}</span>
        </div>`;
      }).join('');
  }
  CS.renderPinout = renderPinout;
  CS.bus.on('docChanged', () => { if ($('#dpage-pins')?.classList.contains('active')) renderPinout(); });

  /* ---------- error checker ---------- */
  function computeIssues() {
    if (!CS.canvas) return [];
    const doc = CS.canvas.getDoc();
    const issues = [];
    const nets = CS.staticNets(doc);
    const mcus = doc.components.filter(c => (CS.defs[c.type] || {}).mcu);
    if (mcus.length > 1) issues.push({ level: 'warn', text: 'Multiple boards on the bench — only the first one runs the sketch.' });
    if (!mcus.length && doc.components.length > 2) issues.push({ level: 'warn', text: 'No microcontroller — your circuit has no brain. Add a board!' });
    doc.components.forEach(c => {
      const def = CS.defs[c.type]; if (!def) return;
      const wiredPins = new Set();
      doc.wires.forEach(w => { if (w.a.c === c.id) wiredPins.add(w.a.p); if (w.b.c === c.id) wiredPins.add(w.b.p); });
      if (c.type === 'led' && wiredPins.size) {
        const aNet = nets.root(c.id + '.anode'), kNet = nets.root(c.id + '.cathode');
        const hasRes = doc.components.some(r => r.type === 'resistor' && [nets.root(r.id + '.1'), nets.root(r.id + '.2')].some(n => n === aNet || n === kNet));
        if (!hasRes) issues.push({ level: 'err', comp: c.id, text: `LED${c.label ? ' "' + c.label + '"' : ''} has no series resistor ?" add ~220 ׸ before you fry it!` });
      }
      if (['dht22', 'ldr', 'soil', 'gas', 'pir', 'ultrasonic', 'servo', 'relay', 'oled', 'mpu6050', 'ir'].includes(c.type) && !wiredPins.has('VCC') && !wiredPins.has('VDD')) {
        if (wiredPins.size) issues.push({ level: 'err', comp: c.id, text: `${def.name}: VCC isn't wired, so it will stay dark.` });
      }
      if (['oled', 'mpu6050'].includes(c.type) && (!wiredPins.has('SDA') || !wiredPins.has('SCL'))) {
        issues.push({ level: 'warn', comp: c.id, text: `${def.name} is an I2C device — wire SDA & SCL (A4/A5 on Uno, 21/22 on ESP32).` });
      }
      if (c.type === 'battery' && (+c.props.voltage || 9) > 12 && wiredPins.size) {
        issues.push({ level: 'warn', comp: c.id, text: `Battery is ${c.props.voltage} V — above 12 V, most boards' regulators get toasty.` });
      }
      // voltage compatibility: 5V ↔ 3.3V
      const is5V = (p) => p === '5V' || p === 'VIN';
      const is3V3 = (p) => p.startsWith('3V3');
      doc.wires.forEach(w => {
        if ((is5V(w.a.p) && is3V3(w.b.p)) || (is5V(w.b.p) && is3V3(w.a.p)))
          issues.push({ level: 'err', comp: w.a.c, text: '5V pin connected to 3.3V pin — voltage mismatch may damage the 3.3V device.' });
      });
      // locked components with wires
      if (c.locked) {
        const hasWires = doc.wires.some(w => w.a.c === c.id || w.b.c === c.id);
        if (hasWires) issues.push({ level: 'warn', comp: c.id, text: `${def.name} is locked but has wires — edits will not persist.` });
      }
      // battery reversed polarity
      if (c.type === 'battery') {
        doc.wires.forEach(w => {
          const battPin = w.a.c === c.id ? w.a.p : w.b.c === c.id ? w.b.p : null;
          const otherPin = w.a.c === c.id ? w.b.p : w.a.p;
          if (battPin === '-' && (otherPin === 'VIN' || otherPin === '5V' || otherPin.startsWith('3V3')))
            issues.push({ level: 'err', comp: c.id, text: 'Battery negative (−) connected to power pin — reverse polarity will damage the circuit!' });
          if (battPin === '+' && otherPin.startsWith('GND'))
            issues.push({ level: 'err', comp: c.id, text: 'Battery positive (+) connected to GND — reversed polarity!' });
        });
      }
    });
    // running-state issues
    if (CS.sim && CS.sim.state === 'running' && CS.sim.netInfo) {
      let shorts = 0;
      CS.sim.netInfo.forEach(i => { if (i.short) shorts++; });
      if (shorts) issues.unshift({ level: 'err', text: `⚡ SHORT CIRCUIT — ${shorts} net(s) have conflicting drivers (VCC ↔ GND). Check your wiring!` });
      if (!doc.components.some(c => (CS.defs[c.type] || {}).mcu)) issues.unshift({ level: 'err', text: 'Simulation running without a board — code isn\'t executing anywhere.' });
    }
    return issues;
  }
  const refreshChecker = debounce(() => {
    if (!CS.canvas || app.view !== 'editor-view') return;
    const box = $('#checker-toast');
    const issues = computeIssues();
    
    // Update the problems panel (#problems-list) with persistent items
    const problemsList = $('#problems-list');
    const problemsPanel = $('#problems-panel');
    if (problemsList) {
      if (issues.length) {
        problemsPanel.classList.remove('hidden');
        problemsList.innerHTML = issues.map((i, idx) => 
          `<div class="problem-item ${i.level === 'err' ? 'problem-error' : 'problem-warn'}" ${i.comp ? `data-comp="${i.comp}"` : ''} style="animation-delay:${idx * 0.05}s">
            <span class="problem-icon">${i.level === 'err' ? '\uD83D\uDD34' : '\uD83D\uDFE1'}</span>
            <span class="problem-text">${esc(i.text)}</span>
            <span class="problem-line">L${idx + 1}</span>
          </div>`
        ).join('');
        problemsList.querySelectorAll('[data-comp]').forEach(el => el.addEventListener('click', () => {
          const c = CS.canvas.compById(el.getAttribute('data-comp'));
          if (c) {
            CS.canvas.clearSelection();
            CS.canvas.selection.add(c.id);
            if (c._g) c._g.classList.add('selected');
            CS.bus.emit('selectionChanged');
            const def = CS.defs[c.type];
            if (def) {
              CS.canvas.view.x = -c.x * CS.canvas.view.z + 200;
              CS.canvas.view.y = -c.y * CS.canvas.view.z + 100;
              CS.canvas.applyView();
            }
          }
        }));
      } else {
        problemsList.innerHTML = '<div class="problem-empty">No problems detected \u2713</div>';
        problemsPanel.classList.remove('hidden');
      }
    }
    
    // Transient toast (top 4 issues) — existing behavior
    const show = issues.slice(0, 4);

    // Emit drcUpdate so the badge and other listeners can react
    CS.bus.emit('drcUpdate', issues);

    if (!show.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = show.map(i => 
      `<div class="check-item ${i.level === 'err' ? 'error' : 'warn'}" ${i.comp ? `data-comp="${i.comp}"` : ''}>
        <span>${i.level === 'err' ? '\uD83D\uDD34' : '\uD83D\uDFE1'}</span>
        <span>${esc(i.text)}</span>
      </div>`
    ).join('');
    box.querySelectorAll('[data-comp]').forEach(el => el.addEventListener('click', () => {
      const c = CS.canvas.compById(el.getAttribute('data-comp'));
      if (c) { CS.canvas.clearSelection(); CS.canvas.selection.add(c.id); if (c._g) c._g.classList.add('selected'); CS.bus.emit('selectionChanged'); }
    }));
  }, 500);

  /* ---------- serial / plotter / watch ---------- */
  let serialCount = 0;
  const plotData = [];
  function serialWrite(text, sys) {
    const out = $('#serial-out');
    if (!out) return;
    const div = document.createElement('div');
    div.className = sys ? 'sys' : '';
    div.textContent = text;
    out.appendChild(div);
    if (++serialCount > 800) { out.firstChild && out.firstChild.remove(); }
    out.scrollTop = out.scrollHeight;
  }
  function flushSerial() {
    if (!CS.sim) return;
    const evs = CS.sim.serialEvents;
    let i = lastSerialIdx;
    for (; i < evs.length; i++) {
      const ev = evs[i];
      const ts = $('#serial-ts').checked && CS.sim.state !== 'idle' ? `<span class="st">${(ev.t / 1000).toFixed(2)}s</span>` : '';
      if (ev.sys) serialWrite(ev.text, true);
      else {
        const out = $('#serial-out');
        if (ts) out.insertAdjacentHTML('beforeend', ts);
        // append text without breaking current line flow
        const span = document.createElement('span');
        span.textContent = ev.text + (ev.nl !== false ? '\n' : '');
        out.appendChild(span);
        out.scrollTop = out.scrollHeight;
        // plotter data
        if (plotterOn && ev.nl !== false) {
          const nums = ev.text.split(/[,\s]+/).map(parseFloat).filter(v => !isNaN(v));
          if (nums.length) { plotData.push(nums); if (plotData.length > 400) plotData.shift(); drawPlotter(); }
        }
      }
    }
    lastSerialIdx = evs.length;
  }
  let lastSerialIdx = 0, plotterOn = false;
  function drawPlotter() {
    const cv = $('#plotter');
    const x = cv.getContext('2d');
    const W = cv.width = cv.clientWidth, H = cv.height = 90;
    x.fillStyle = getComputedStyle(cv).backgroundColor; x.fillRect(0, 0, W, H);
    if (plotData.length < 2) return;
    const cols = plotData.reduce((m, r) => Math.max(m, r.length), 0);
    const all = plotData.flat();
    let min = Math.min(...all), max = Math.max(...all);
    if (max - min < 1e-6) { max += 1; min -= 1; }
    const series = ['#4ade80', '#22d3ee', '#f87171', '#facc15'];
    for (let sIdx = 0; sIdx < cols; sIdx++) {
      x.strokeStyle = series[sIdx % 4]; x.lineWidth = 1.4; x.beginPath();
      plotData.forEach((row, i) => {
        if (row[sIdx] === undefined) return;
        const px = i / (plotData.length - 1) * (W - 6) + 3;
        const py = H - 6 - (row[sIdx] - min) / (max - min) * (H - 12);
        i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      });
      x.stroke();
    }
    x.fillStyle = '#94a3b8'; x.font = '9px monospace';
    x.fillText(max.toFixed(1), 4, 10); x.fillText(min.toFixed(1), 4, H - 3);
  }
  /* watch */
  const watchExprs = [];
  function refreshWatch() {
    const list = $('#watch-list'); if (!list) return;
    list.innerHTML = watchExprs.map((w, i) => {
      let val = '·';
      try { if (CS.sim && CS.sim.exports && CS.sim.exports.__vars && CS.sim.state !== 'idle') { const v = CS.sim.exports.__vars(w); val = v === undefined ? 'undef' : typeof v === 'object' ? JSON.stringify(v) : String(v); } } catch { val = '?'; }
      return `<span class="watch-chip">${esc(w)} = ${esc(String(val).slice(0, 18))}<i data-rm="${i}">✕</i></span>`;
    }).join('');
    list.querySelectorAll('[data-rm]').forEach(el => el.addEventListener('click', () => { watchExprs.splice(+el.getAttribute('data-rm'), 1); refreshWatch(); }));
  }

  function updateScopePinOptions() {
    const pinSel = $('#scope-pin');
    if (!pinSel) return;
    const oldVal = pinSel.value;
    pinSel.innerHTML = '';
    const mcu = CS.canvas && CS.canvas.doc && CS.canvas.doc.components.find(c => (CS.defs[c.type] || {}).mcu);
    if (!mcu) {
      pinSel.innerHTML = '<option value="">No microcontroller found</option>';
      return;
    }
    const def = CS.defs[mcu.type];
    if (def && def.pins) {
      const dpins = def.pins.filter(p => p.kind && !p.kind.includes('power') && !p.kind.includes('ground'));
      dpins.forEach(p => {
        const isAnalog = p.kind.includes('analog');
        const mode = isAnalog ? 'analog' : 'digital';
        pinSel.innerHTML += `<option value="${p.id}|${mode}">${p.id} (${mode})</option>`;
      });
    }
    if (oldVal && pinSel.querySelector(`option[value="${oldVal}"]`)) {
      pinSel.value = oldVal;
    }
  }

  /* ---------- scope ---------- */
  const scope = { channels: [] };
  function scopeAdd() {
    const sel = $('#scope-pin');
    const [pin, mode] = sel.value.split('|');
    if (!CS.sim.mcu) return toast('Place a microcontroller first', 'warn');
    scope.channels.push({ comp: CS.sim.mcu.id, pin, mode, color: ['#4ade80', '#22d3ee', '#f87171', '#facc15', '#a78bfa', '#fb923c'][scope.channels.length % 6] });
    renderScopeChips();
  }
  function renderScopeChips() {
    const head = $('.scope-head');
    if (!head) return;
    head.querySelectorAll('.scope-chip').forEach(x => x.remove());
    scope.channels.forEach((ch, i) => {
      const b = document.createElement('span');
      b.className = 'scope-chip'; b.style.cssText = `background:${ch.color}22;color:${ch.color};border:1px solid ${ch.color}55;cursor:pointer`;
      b.textContent = ch.pin + (ch.mode === 'analog' ? ' ~' : '') + ' ✕';
      b.title = 'Remove channel';
      b.addEventListener('click', () => { scope.channels.splice(i, 1); renderScopeChips(); });
      head.insertBefore(b, $('#scope-pin'));
    });
    if (CS.sim) CS.sim.scopeChannels = scope.channels.map(c => ({ comp: c.comp, pin: c.pin, mode: c.mode }));
  }
  function drawScope() {
    const cv = $('#scope'); if (!cv || !cv.clientWidth) return;
    const x = cv.getContext('2d');
    const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight;
    x.fillStyle = getComputedStyle(cv).backgroundColor; x.fillRect(0, 0, W, H);
    if (!scope.channels.length || !CS.sim) return;
    const nowT = CS.sim.now;
    const windowMs = 4000;
    const rowH = Math.min(60, (H - 8) / scope.channels.length);
    scope.channels.forEach((ch, i) => {
      const arr = CS.sim.samples.get(ch.comp + '.' + ch.pin + ch.mode) || [];
      const y0 = 6 + i * rowH;
      x.strokeStyle = '#22304d'; x.strokeRect(0.5, y0 + 0.5, W - 1, rowH - 4);
      x.fillStyle = ch.color; x.font = '9px monospace';
      x.fillText(ch.pin, 4, y0 + 10);
      x.strokeStyle = ch.color; x.lineWidth = 1.3; x.globalAlpha = 0.75;
      x.beginPath();
      let started = false;
      for (const s of arr) {
        if (s.t < nowT - windowMs) continue;
        const px = (s.t - (nowT - windowMs)) / windowMs * (W - 60) + 56;
        const py = y0 + rowH - 8 - s.v * (rowH - 18);
        started ? x.lineTo(px, py) : x.moveTo(px, py);
        started = true;
      }
      x.stroke(); x.globalAlpha = 1;
    });
  }

  /* ---------- sim controls ---------- */
  function runSim() {
    if (!app.project) return;
    if (!CS.canvas.doc.components.some(c => (CS.defs[c.type] || {}).mcu)) {
      toast('Add a microcontroller (Arduino, ESP32… ) before running!', 'warn');
      return;
    }
    lastSerialIdx = 0;
    plotData.length = 0;
    CS.sim.breakpoints = CS.editor.breakpoints;
    CS.sim.doc = CS.canvas.getDoc();
    // live object references so component visuals update
    CS.sim.doc.components = CS.canvas.doc.components;
    CS.sim.doc.wires = CS.canvas.doc.wires;
    CS.sim.scopeChannels = scope.channels.map(c => ({ comp: c.comp, pin: c.pin, mode: c.mode }));
    CS.sim.speed = +$('#sim-speed').value;
    hideErr();
    const code = CS.editor.getCode();
    const lang = $('#lang-select').value;
    const ok = CS.sim.start(code, lang);
    if (!ok) return;
    api('/api/sim/run', 'POST', {}).catch(() => {});
    $('#sim-run').classList.add('active');
    $('#sim-run').textContent = '⏵';
    $('#canvas-hint').style.display = 'none';
    toast('Simulation running ▶', 'ok', 1500);
  }
  function stopSim() {
    if (!CS.sim) return;
    CS.sim.stop();
    $('#sim-run').classList.remove('active');
    $('#sim-pause').classList.remove('active');
    CS.editor.setExecLine(0);
    setTimeout(() => CS.canvas && CS.canvas.renderAll(), 30);
  }
  function bindSimEvents() {
    CS.sim.on('state', s => {
      if (s === 'paused') { $('#sim-pause').classList.add('active'); $('#sim-run').classList.remove('active'); if (CS.sim.line) CS.editor.setExecLine(CS.sim.line); if (CS.sim.breakpoints.has(CS.sim.line)) toast('⛔ Breakpoint at line ' + CS.sim.line, 'warn', 1600); }
      if (s === 'running') { $('#sim-pause').classList.remove('active'); $('#sim-run').classList.add('active'); }
      if (s === 'idle') { $('#sim-run').classList.remove('active'); $('#sim-pause').classList.remove('active'); CS.editor.setExecLine(0); CS.canvas.renderAll(); }
      refreshChecker();
    });
    CS.sim.on('compileError', e => {
      CS.editor.setError(e.line, e.msg);
      toast(`💥 Code error${e.line ? ' near line ' + e.line : ''}: ${e.msg}`, 'err', 6000);
      stopSim();
    });
    CS.sim.on('runtimeError', e => {
      CS.editor.setError(e.line, e.msg);
      $('#sim-run').classList.remove('active');
      toast(`💥 Runtime error at line ${e.line}: ${e.msg}`, 'err', 6000);
      showDock('code');
    });
    CS.sim.on('serial', CS.debounce(flushSerial, 30));
    CS.sim.on('clock', CS.debounce(t => { $('#sim-clock').textContent = (t / 1000).toFixed(2) + ' s'; }, 100));
    CS.sim.on('dirty', ids => { ids.forEach(id => CS.canvas.updateComp(id)); });
    CS.sim.on('tick', CS.debounce(() => {
      CS.canvas.updateFlows();
      drawScope();
      refreshWatch();
      if (CS.sim && CS.sim.state === 'running' && CS.sim.breakpoints.size) CS.editor.setExecLine(CS.sim.line);
      refreshChecker();
    }, 120));
  }
  function hideErr() { if (app.project && CS.editor) { CS.editor.setError(0, ''); CS.editor.setDiagnostics && CS.editor.setDiagnostics([]); } }

  /* ---------- dock tabs ---------- */
  function showDock(tab) {
    $$('.dtab').forEach(t => t.classList.toggle('active', t.getAttribute('data-dtab') === tab));
    $$('.dpage').forEach(p => p.classList.toggle('active', p.id === 'dpage-' + tab));
    $('#right-dock').classList.remove('collapsed');
    $('#dock-open').classList.add('hidden');
    if (tab === 'scope') { updateScopePinOptions(); setTimeout(drawScope, 60); }
    if (tab === 'inspect') renderInspector();
    if (tab === 'guide') refreshGuide();
    if (tab === 'pins') renderPinout();
  }
  CS.app.showDock = showDock;

  /* ---------- share & export ---------- */
  function shareModal() {
    if (!app.project) return;
    const body = document.createElement('div');
    body.innerHTML = `<div class="skel skel-row"></div><div class="skel skel-row"></div>`;
    const m = modal({ title: '🔗 Share & export', body, wide: true });
    (async () => {
      const sid = app.project.shareId || (await api(`/api/projects/${app.project.id}/share`, 'POST', {})).shareId;
      app.project.shareId = sid;
      const url = location.origin + '/share/' + sid;
      body.innerHTML = `
        <div class="field"><label>Share link (anyone with the link can view & fork)</label>
          <div class="share-link-row"><input readonly value="${url}" id="sh-url"><button class="btn sm" id="sh-copy">Copy</button><button class="btn ghost sm" id="sh-off">Disable</button></div></div>
        <div class="field"><label>Embed in a webpage</label>
          <div class="share-link-row"><input readonly value='<iframe src="${url}?embed=1" width="800" height="520" frameborder="0"></iframe>' id="sh-embed"><button class="btn sm" id="sh-copy2">Copy</button></div></div>
        <div class="prop-row"><label>Publish to community gallery</label><input type="checkbox" id="sh-pub" ${app.project.public ? 'checked' : ''}></div>
        <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost sm" id="x-png">🖼 Export PNG</button>
          <button class="btn ghost sm" id="x-pdf">📄 Export PDF</button>
          <button class="btn ghost sm" id="x-json">🧾 Export netlist JSON</button>
          <button class="btn ghost sm" id="x-code2">⬇ Download sketch (.${$('#lang-select').value === 'py' ? 'py' : 'ino'})</button>
        </div>
        <p class="form-note">The downloaded sketch runs on a physical board. Pins map 1:1.</p>`;
      const cp = (id, btn) => { body.querySelector(btn).addEventListener('click', () => { body.querySelector(id).select(); document.execCommand && document.execCommand('copy'); navigator.clipboard && navigator.clipboard.writeText(body.querySelector(id).value); toast('Copied 📋'); }); };
      cp('#sh-url', '#sh-copy'); cp('#sh-embed', '#sh-copy2');
      body.querySelector('#sh-off').addEventListener('click', async () => { await api(`/api/projects/${app.project.id}/share`, 'POST', { off: true }); m.close(); toast('Sharing disabled'); });
      body.querySelector('#sh-pub').addEventListener('change', async e => {
        await api(`/api/projects/${app.project.id}`, 'PUT', { public: e.target.checked });
        app.project.public = e.target.checked;
        toast(e.target.checked ? 'Published to the community gallery 🌍' : 'Unpublished');
      });
      body.querySelector('#x-png').addEventListener('click', exportPng);
      body.querySelector('#x-pdf').addEventListener('click', exportPdf);
      body.querySelector('#x-json').addEventListener('click', exportJson);
      body.querySelector('#x-code2').addEventListener('click', exportSketch);
    })().catch(e => { body.innerHTML = `<p class="form-err">${esc(e.message)}</p>`; });
  }
  function exportSketch() {
    const lang = $('#lang-select').value;
    const name = (app.project ? app.project.name : 'sketch').replace(/[^\w-]+/g, '_');
    CS.download(name + (lang === 'py' ? '.py' : '.ino'), CS.editor.getCode(), 'text/plain');
    toast('Sketch downloaded — flash it onto real hardware! 🚀');
  }
  function exportJson() {
    const doc = CS.canvas.getDoc();
    const nets = CS.wiringGuide(doc).map(g => g.text.replace(/<[^>]+>/g, ''));
    CS.download((app.project.name || 'circuit') + '.json', JSON.stringify({
      name: app.project.name, board: app.project.board, lang: app.project.lang,
      components: doc.components, wires: doc.wires, nets, code: CS.editor.getCode()
    }, null, 2), 'application/json');
  }
  function exportPng() {
    const doc = CS.canvas.getDoc();
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    doc.components.forEach(c => { const d = CS.defs[c.type]; x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + d.w); y2 = Math.max(y2, c.y + d.h); });
    if (!doc.components.length) { x1 = 0; y1 = 0; x2 = 400; y2 = 300; }
    const pad = 30, w = x2 - x1 + pad * 2, h = y2 - y1 + pad * 2 + 40;
    const clone = CS.canvas.world.cloneNode(true);
    clone.querySelectorAll('.sel-ring,.marquee,.guide').forEach(el => el.setAttribute('display', 'none'));
    clone.querySelectorAll('.comp.selected,.wire.selected').forEach(el => el.classList.remove('selected'));
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="${x1 - pad} ${y1 - pad} ${w} ${h}">
      <style>text{font-family:monospace}.wire-path{fill:none;stroke-linecap:round}.pin{display:none}.sel-ring{display:none}</style>
      <rect x="${x1 - pad}" y="${y1 - pad}" width="${w}" height="${h}" fill="${getComputedStyle(document.body).getPropertyValue('--canvas')}"/>
      ${clone.outerHTML}
      <text x="${x1 - pad + 6}" y="${y2 + pad + 18}" fill="#64748b" font-size="13">${esc(app.project.name)} — made with CircuitTecture ⚡</text>
    </svg>`;
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2;
      cv.getContext('2d').drawImage(img, 0, 0);
      cv.toBlob(b => CS.download((app.project.name || 'circuit') + '.png', b, 'image/png'));
      toast('PNG exported 🖼');
    };
    img.onerror = () => toast('PNG export failed', 'err');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }
  function exportPdf() {
    let area = $('#print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    const doc = CS.canvas.getDoc();
    const nets = CS.wiringGuide(doc);
    const counts = {};
    doc.components.forEach(c => counts[c.type] = (counts[c.type] || 0) + 1);
    const compRows = Object.entries(counts).map(([t, n]) => {
      const d = CS.defs[t] || { name: t, icon: '•' };
      return `<li>${esc(d.icon + ' ' + d.name)} × ${n}</li>`;
    }).join('') || '<li>No components yet</li>';
    area.innerHTML = `<h1 style="font-size:22px">${esc(app.project.name)}</h1>
      <p style="color:#444">Generated by CircuitTecture — ${new Date().toLocaleString()}</p>
      <h2 style="font-size:16px">Components used</h2>
      <ul style="font-size:12.5px">${compRows}</ul>
      <h2 style="font-size:16px">Wiring guide</h2>
      <ol style="font-size:12.5px">${nets.map(n => `<li>${n.text}</li>`).join('') || '<li>No nets yet</li>'}</ol>
      <h2 style="font-size:16px">Sketch</h2>
      <pre style="background:#f4f4f4;padding:10px;font-size:10.5px;border:1px solid #ddd">${esc(CS.editor.getCode())}</pre>`;
    setTimeout(() => { window.print(); toast('Use "Save as PDF" in the print dialog 📄'); }, 60);
  }


  /* ---------- shortcuts ---------- */
  function shortcutsModal() {
    modal({
      title: '⌨️ Keyboard shortcuts', wide: true,
      body: `<div class="kbd-grid">
        ${[['Ctrl+Enter', 'Run simulation'], ['Ctrl+S', 'Save project'], ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'], ['Ctrl+C / X / V', 'Copy / cut / paste'], ['Ctrl+D', 'Duplicate selection'], ['Ctrl+A', 'Select all'], ['R', 'Rotate 90°'], ['Del / Backspace', 'Delete selection'], ['Arrow keys', 'Nudge (Shift = ×10)'], ['Space + drag', 'Pan canvas'], ['Scroll', 'Zoom'], ['F', 'Fit circuit to screen'], ['+ / −', 'Zoom in / out'], ['Esc', 'Deselect / cancel wire'], ['Click/drag pin → pin', 'Draw a wire (click again to finish)'], ['Right-click canvas', 'Canvas/part/wire menu'], ['Probe button + pin', 'Read live voltage/state'], ['Click gutter', 'Toggle breakpoint'], ['Ctrl+Space', 'Autocomplete'], ['/', 'Focus search (dashboard)'], ['?', 'This cheat-sheet']].map(([k, d]) => `<div class="kbd-row"><span>${d}</span><span class="kbd">${k}</span></div>`).join('')}
      </div>`
    });
  }

  /* ---------- templates & AI insert ---------- */
  CS.app.applyTemplate = function (tplId, silent) {
    const t = CS.templates.find(x => x.id === tplId); if (!t) return;
    const doIt = () => {
      const b = t.build();
      CS.canvas.setDoc({ components: b.components, wires: b.wires });
      CS.editor.setCode(b.code);
      $('#lang-select').value = t.lang; CS.editor.setLang(t.lang);
      if (app.project) { app.project.board = t.board; app.project.lang = t.lang; }
      markDirty(); refreshGuide(); refreshChecker(); updateCanvasHint(); CS.canvas.zoomFit();
      toast(`${t.icon} ${t.name} loaded`);
    };
    if (CS.canvas.doc.components.length && !silent) {
      if (confirm('Replace the current bench with this template?')) doIt();
    } else doIt();
  };
  CS.app.insertGenerated = function (plan) {
    const doIt = () => {
      CS.canvas.setDoc({ components: plan.components, wires: plan.wires });
      CS.editor.setCode(plan.code);
      if ($('#lang-select').value !== 'cpp') { $('#lang-select').value = 'cpp'; CS.editor.setLang('cpp'); }
      markDirty(); refreshGuide(); refreshChecker(); updateCanvasHint(); CS.canvas.zoomFit();
    };
    if (CS.canvas.doc.components.length) { if (confirm('Replace the current bench with the generated circuit?')) doIt(); }
    else doIt();
  };
  CS.app.runSim = runSim;

  /* ---------- editor UI binding ---------- */
  function bindEditorUI() {
    bindSimEvents();
    $('#sim-run').addEventListener('click', () => { if (CS.sim.state === 'paused') CS.sim.resume(); else if (CS.sim.state === 'running') { } else runSim(); });
    $('#sim-pause').addEventListener('click', () => { if (CS.sim.state === 'running') CS.sim.pause(); });
    $('#sim-stop').addEventListener('click', stopSim);
    $('#sim-step').addEventListener('click', () => {
      if (CS.sim.state === 'idle') { runSim(); setTimeout(() => { CS.sim.pause(); }, 120); }
      else CS.sim.stepOnce();
    });
    $('#sim-speed').addEventListener('change', () => { CS.sim.speed = +$('#sim-speed').value; });
    $('#mute-btn').addEventListener('click', () => { CS.audio.muted = !CS.audio.muted; $('#mute-btn').textContent = CS.audio.muted ? '🔇' : '🔊'; if (CS.audio.muted) CS.audio.stopAll(); });
    $('#back-btn').addEventListener('click', async () => {
      if (app.dirty) await saveProject();
      stopSim();
      app.project = null;
      enterDashboard(false);
    });
    $('#save-btn').addEventListener('click', () => saveProject());
    $('#proj-name').addEventListener('change', () => { if (app.project) { app.project.name = $('#proj-name').value.trim() || app.project.name; markDirty(); setSaveState('saving'); saveProject(); } });
    // dock tabs
    $$('.dtab').forEach(t => t.addEventListener('click', () => showDock(t.getAttribute('data-dtab'))));
    $('#lang-select').addEventListener('change', () => {
      CS.editor.setLang($('#lang-select').value);
      if (app.project) { app.project.lang = $('#lang-select').value; markDirty(); }
    });
    // templates dropdown
    const ts = $('#template-select');
    ts.innerHTML = `<option value="">✨ Examples…</option>` + CS.templates.map(t => `<option value="${t.id}">${t.icon} ${t.name} (${t.level})</option>`).join('');
    ts.addEventListener('change', () => { if (ts.value) { app.applyTemplate(ts.value); ts.value = ''; } });
    $('#export-code-btn').addEventListener('click', exportSketch);
    $('#editor-theme').addEventListener('change', () => { const v = $('#editor-theme').value; const pref = v === 'system' ? 'system' : (v === 'vs' ? 'light' : 'dark'); localStorage.setItem('ct-theme', pref); applyThemePref(pref); });
    $('#editor-font').addEventListener('change', () => CS.editor.setFontSize && CS.editor.setFontSize(+$('#editor-font').value));
    $('#problems-clear').addEventListener('click', () => { CS.editor.setDiagnostics && CS.editor.setDiagnostics([]); renderProblems([]); });
    // library
    $('#lib-search').addEventListener('input', debounce(() => buildLibrary(false), 200));
    $('#lib-collapse').addEventListener('click', () => { $('#lib-panel').classList.add('collapsed'); $('#lib-open').classList.remove('hidden'); });
    $('#lib-open').addEventListener('click', () => { $('#lib-panel').classList.remove('collapsed'); $('#lib-open').classList.add('hidden'); });
    $('#dock-open').addEventListener('click', () => { $('#right-dock').classList.remove('collapsed'); $('#dock-open').classList.add('hidden'); });
    // canvas toolbar
    $('#zoom-in').addEventListener('click', () => CS.canvas.zoomBy(1.25));
    $('#zoom-out').addEventListener('click', () => CS.canvas.zoomBy(1 / 1.25));
    $('#zoom-fit').addEventListener('click', () => CS.canvas.zoomFit());
    $('#undo-btn').addEventListener('click', () => CS.canvas.undo());
    $('#redo-btn').addEventListener('click', () => CS.canvas.redo());
    $('#arrange-btn').addEventListener('click', e => menu(e.clientX, e.clientY, [
      { icon: '⬅', label: 'Align left', fn: () => CS.canvas.alignSelection('left') },
      { icon: '↔', label: 'Align horizontal center', fn: () => CS.canvas.alignSelection('hcenter') },
      { icon: '➡', label: 'Align right', fn: () => CS.canvas.alignSelection('right') },
      { icon: '⬆', label: 'Align top', fn: () => CS.canvas.alignSelection('top') },
      { icon: '↕', label: 'Align vertical center', fn: () => CS.canvas.alignSelection('vcenter') },
      { icon: '⬇', label: 'Align bottom', fn: () => CS.canvas.alignSelection('bottom') },
      '-',
      { icon: '⇔', label: 'Distribute horizontally', fn: () => CS.canvas.distributeSelection('x') },
      { icon: '⇕', label: 'Distribute vertically', fn: () => CS.canvas.distributeSelection('y') },
      '-',
      { icon: '⬆️', label: 'Bring selected to front', fn: () => CS.canvas.moveSelectionOrder('front') },
      { icon: '⬇️', label: 'Send selected to back', fn: () => CS.canvas.moveSelectionOrder('back') },
      { icon: '🧹', label: 'Clear all wire bends', fn: () => CS.canvas.clearWireBends() }
    ]));
    $('#snap-btn').addEventListener('click', function () { CS.canvas.snapGrid = !CS.canvas.snapGrid; this.classList.toggle('on', CS.canvas.snapGrid); toast(CS.canvas.snapGrid ? 'Snap-to-grid on 🧲' : 'Snap-to-grid off', 'ok', 1200); });
    $('#snap-btn').classList.add('on');
    $('#grid-btn').addEventListener('click', function () { CS.canvas.gridOn = !CS.canvas.gridOn; CS.canvas.gridRect.style.display = CS.canvas.gridOn ? '' : 'none'; this.classList.toggle('on'); });
    $('#grid-btn').classList.add('on');
    $('#wire-style-btn').addEventListener('click', function () { CS.canvas.wireStyle = CS.canvas.wireStyle === 'smooth' ? 'ortho' : 'smooth'; this.textContent = CS.canvas.wireStyle === 'smooth' ? '〰️' : '┐'; this.classList.toggle('on', CS.canvas.wireStyle === 'smooth'); CS.canvas.refreshAllWires(); toast(CS.canvas.wireStyle === 'smooth' ? 'Smooth wire routing' : 'Orthogonal wire routing', 'ok', 1200); });
    $('#probe-btn').addEventListener('click', function () { CS.canvas.setProbeMode(!CS.canvas.probeMode); this.classList.toggle('on', CS.canvas.probeMode); toast(CS.canvas.probeMode ? 'Probe mode: click any pin to read voltage/state' : 'Probe mode off', 'ok', 1500); });
    bindMiniMap();
    $('#hint-load-example').addEventListener('click', () => app.applyTemplate('blink', true));
    // serial
    $('#serial-clear').addEventListener('click', () => { $('#serial-out').innerHTML = ''; if (CS.sim) { CS.sim.serialEvents = []; lastSerialIdx = 0; } });
    $('#serial-send').addEventListener('click', sendSerial);
    $('#serial-in').addEventListener('keydown', e => { if (e.key === 'Enter') sendSerial(); });
    function sendSerial() { const v = $('#serial-in').value; if (!v) return; if (CS.sim) CS.sim.serialRx += v + '\n'; serialWrite('→ ' + v, true); $('#serial-in').value = ''; }
    $('#plotter-toggle').addEventListener('click', function () {
      plotterOn = !plotterOn;
      $('#plotter').classList.toggle('hidden', !plotterOn);
      this.classList.toggle('primary', plotterOn);
      if (plotterOn) drawPlotter();
    });
    // watch
    $('#watch-add').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.value.trim()) { watchExprs.push(e.target.value.trim()); e.target.value = ''; refreshWatch(); }
    });
    // scope
    updateScopePinOptions();
    $('#scope-add').addEventListener('click', scopeAdd);
    $('#scope-clear').addEventListener('click', () => { scope.channels.length = 0; renderScopeChips(); drawScope(); });
    // top buttons
    $('#share-btn').addEventListener('click', shareModal);
    const scBtn = $('#shortcuts-btn'); if (scBtn) scBtn.addEventListener('click', shortcutsModal);
    const thBtn = $('#theme-btn'); if (thBtn) thBtn.addEventListener('click', toggleTheme);
    $('#project-menu-btn').addEventListener('click', e => {
      menu(e.clientX, e.clientY, [
        { icon: '📸', label: 'Save version snapshot', fn: () => saveProject(true) },
        { icon: '🕘', label: 'Version history', fn: versionHistory },
        { icon: '✏️', label: 'Rename / organize', fn: () => app.project && renameModal(app.project) },
        { icon: '⧉', label: 'Duplicate project', fn: async () => { try { const r = await api(`/api/projects/${app.project.id}/duplicate`, 'POST', {}); openProject(r.project.id); } catch (err) { toast(err.message, 'err'); } } },
        { icon: '📖', label: 'How it\'s wired', fn: () => showDock('guide') },
        '-',
        { icon: '⌨️', label: 'Shortcuts', fn: shortcutsModal },
        { icon: '❓', label: 'Replay tour', fn: () => CS.tour && CS.tour.editor && CS.tour.editor(true) }
      ]);
    });
    // global keys for editor view
    window.addEventListener('keydown', e => {
      if (app.view !== 'editor-view') return;
      if (e.key === '?' && !e.target.matches('input,textarea')) shortcutsModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); CS.sim.state === 'idle' ? runSim() : stopSim(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveProject(); }
    });
    window.addEventListener('resize', CS.debounce(() => { drawScope(); drawPlotter(); }, 200));
    window.addEventListener('beforeunload', e => { if (app.dirty) { e.preventDefault(); e.returnValue = ''; } });
    renderInspector();
    refreshGuide();

    // DRC badge count on problems tab
    CS.bus.on('drcUpdate', (problems) => {
      const codeTab = $('.dtab[data-dtab="code"]');
      if (codeTab) {
        const count = problems.filter(p => p.level === 'err' || p.level === 'warn').length;
        let badge = codeTab.querySelector('.drc-badge');
        if (count > 0) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'drc-badge';
            codeTab.appendChild(badge);
          }
          badge.textContent = count;
        } else if (badge) {
          badge.remove();
        }
      }
    });

    // Problems panel clear button should just hide it temporarily
    const pc = $('#problems-clear');
    if (pc) {
      pc.addEventListener('click', () => {
        $('#problems-panel').classList.add('hidden');
      });
    }
  }

  async function versionHistory() {
    const body = document.createElement('div');
    body.innerHTML = '<div class="skel skel-row"></div><div class="skel skel-row"></div>';
    const m = modal({ title: '🕘 Version history', body, wide: true });
    try {
      const { project } = await api(`/api/projects/${app.project.id}`);
      const vers = project.versions || [];
      body.innerHTML = vers.length ? '' : `<div class="empty-state" style="padding:30px"><span class="e-icon">📸</span><h3>No snapshots yet</h3><p>Use "Save version snapshot" from the ⋯ menu to freeze milestone states you can restore later.</p></div>`;
      vers.forEach(v => {
        const row = document.createElement('div');
        row.className = 'ver-row';
        row.innerHTML = `<span><b>${esc(v.name)}</b> <small>· ${new Date(v.ts).toLocaleString()}</small></span><button class="btn ghost sm">Restore</button>`;
        row.querySelector('button').addEventListener('click', async () => {
          if (!confirm('Restore this snapshot? Your current state is autosaved as a new snapshot first.')) return;
          await api(`/api/projects/${app.project.id}`, 'PUT', { saveVersion: 'auto-backup before restore' });
          await api(`/api/projects/${app.project.id}`, 'PUT', { restoreVersion: v.id });
          const { project: p2 } = await api(`/api/projects/${app.project.id}`);
          CS.canvas.setDoc({ components: p2.components, wires: p2.wires });
          CS.editor.setCode(p2.code);
          m.close(); toast('Restored ⏪');
          refreshGuide(); refreshChecker(); updateCanvasHint();
        });
        body.appendChild(row);
      });
    } catch (e) { body.innerHTML = `<p class="form-err">${esc(e.message)}</p>`; }
  }

  function accountSettingsModal() {
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Name</label><input id="acct-name" value="${esc(app.user.name)}"></div>
      <div class="field"><label>Avatar emoji</label><input id="acct-avatar" value="${esc(app.user.avatar || '')}" maxlength="8"></div>
      <button class="btn primary block" id="acct-save">Save profile</button>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <div class="field"><label>New email</label><input id="acct-email" value="${esc(app.user.email)}"></div>
      <div class="field"><label>Current password</label><input id="acct-cur" type="password"></div>
      <button class="btn ghost block" id="acct-email-save">Change email</button>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      <div class="field"><label>New password</label><input id="acct-pass1" type="password"></div>
      <div class="field"><label>Confirm new password</label><input id="acct-pass2" type="password"></div>
      <button class="btn ghost block" id="acct-pass-save">Change password</button>
      <button class="btn ghost block" id="acct-logout-all" style="margin-top:8px">Log out of other sessions</button>
      <button class="btn danger block" id="acct-delete" style="margin-top:12px">Delete my account</button>
      <div class="form-err" id="acct-err"></div>`;
    const m = modal({ title: 'Account settings', body, wide: true });
    const err = msg => body.querySelector('#acct-err').textContent = msg || '';
    body.querySelector('#acct-save').addEventListener('click', async () => { try { const r = await api('/api/me', 'PUT', { name: body.querySelector('#acct-name').value, avatar: body.querySelector('#acct-avatar').value }); app.user = r.user; m.close(); enterDashboard(); toast('Profile updated'); } catch(e){ err(e.message); } });
    body.querySelector('#acct-email-save').addEventListener('click', async () => { try { const r = await api('/api/me', 'PUT', { email: body.querySelector('#acct-email').value, currentPass: body.querySelector('#acct-cur').value }); app.user = r.user; toast('Email updated'); } catch(e){ err(e.message); } });
    body.querySelector('#acct-pass-save').addEventListener('click', async () => { if (body.querySelector('#acct-pass1').value !== body.querySelector('#acct-pass2').value) return err('Passwords do not match.'); try { await api('/api/me/password', 'POST', { currentPass: body.querySelector('#acct-cur').value, newPass: body.querySelector('#acct-pass1').value }); toast('Password updated'); } catch(e){ err(e.message); } });
    body.querySelector('#acct-logout-all').addEventListener('click', async () => { try { await api('/api/me/logout-all', 'POST', {}); toast('Other sessions logged out'); } catch(e){ err(e.message); } });
    body.querySelector('#acct-delete').addEventListener('click', async () => { const pass = prompt('Type your current password to permanently delete your account and projects.'); if (!pass) return; if (!confirm('This permanently deletes your account and projects. Continue?')) return; try { await api('/api/me', 'DELETE', { currentPass: pass }); location.reload(); } catch(e){ err(e.message); } });
  }

  /* ---------- dashboard bindings ---------- */
  function bindGlobal() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      app.dashTab = t.getAttribute('data-tab');
      if (app.dashTab === 'mine' || app.dashTab === 'community') { }
      loadProjects();
    }));
    const appEl = $('#app'); if (appEl) appEl.addEventListener('click', e => { const btn = e.target.closest('#new-project-btn'); if (btn) newProjectModal(); });
    const ds = $('#dash-search'); if (ds) ds.addEventListener('input', debounce(e => { app.search = e.target.value.trim().toLowerCase(); loadProjects(); }, 250));
    window.addEventListener('keydown', e => {
      if (app.view === 'dashboard' && e.key === '/' && !e.target.matches('input')) { e.preventDefault(); const s = $('#dash-search'); if (s) s.focus(); }
      if (app.view === 'dashboard' && e.key === '?' && !e.target.matches('input')) shortcutsModal();
    });
    
    // Add dashboard tab click handler to prevent double nav in mobile
    $$('.tab').forEach(t => {
      if (!t._dashboardTabListener) {
        t._dashboardTabListener = true;
        t.addEventListener('click', () => {
          if (window.innerWidth <= 768) {
            const drawer = $('#dash-side');
            if (drawer && drawer.classList.contains('open')) {
              drawer.classList.remove('open');
              document.body.classList.remove('dash-nav-open');
              const burger = $('#dash-burger');
              if (burger) burger.classList.remove('open');
            }
          }
        });
      }
    });
    const db = $('#dash-burger'); if (db) db.addEventListener('click', () => { const side = $('#dash-side'); if (side) side.classList.toggle('open'); });
    const tb = $('#theme-btn'); if (tb) tb.addEventListener('click', toggleTheme);
    const ab = $('#account-btn'); if (ab) ab.addEventListener('click', accountSettingsModal);
    const sb = $('#shortcuts-btn'); if (sb) sb.addEventListener('click', shortcutsModal);
    const uc = $('#user-chip'); if (uc) uc.addEventListener('click', e => {
      menu(e.clientX, e.clientY, [
        { icon: (app.user && app.user.avatar) || '🧑‍🔧', label: app.user ? `${app.user.name} · ${app.user.email}` : 'Account', fn: app.user ? accountSettingsModal : () => { app.view = 'landing'; show('landing'); } },
        '-',
        { icon: '⚙️', label: 'Account settings', fn: accountSettingsModal },
        { icon: '⌨️', label: 'Shortcuts', fn: shortcutsModal },
        { icon: '🌗', label: 'Toggle theme', fn: toggleTheme },
        '-',
        { icon: '🚪', label: 'Log out', danger: true, fn: async () => { 
          if (app.dirty && !confirm('You have unsaved changes. Log out anyway?')) return; 
          app.user = null;
          app.dirty = false;
          try { await api('/api/logout', 'POST', {}); } catch {} 
          location.href = '/'; 
        } }
      ]);
    });

    // Mobile landing nav drawer (open/close + keyboard)
    const drawerEl = $('#mobile-nav-drawer');
    if (drawerEl) {
      const setNavOpen = (open) => {
        drawerEl.classList.toggle('open', open);
        const b = document.querySelector('#mobile-burger-btn');
        if (b) { b.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); }
        document.body.classList.toggle('mobile-nav-open', open);
      };
      document.addEventListener('click', (e) => {
        if (e.target.closest && e.target.closest('#mobile-burger-btn')) { setNavOpen(!drawerEl.classList.contains('open')); return; }
        if (drawerEl.classList.contains('open') && !drawerEl.contains(e.target)) setNavOpen(false);
      });
      const closeEl = $('#mobile-drawer-close');
      if (closeEl) closeEl.addEventListener('click', () => setNavOpen(false));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });
      drawerEl.querySelectorAll('a, button').forEach(el => el.addEventListener('click', () => setNavOpen(false)));
    }
  }

  /* ================= share viewer ================= */
  async function bootShareViewer(sid, embed) {
    document.body.classList.add('viewer');
    initTheme();
    try {
      const { project } = await api(`/api/share/${sid}`);
      const appEl = $('#app');
      appEl.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100vh">
          <div class="topbar" style="${embed ? 'padding:6px 12px' : ''}">
            <div class="brand small"><span class="brand-mark">⚡</span> ${embed ? '' : 'CircuitTecture'}</div>
            <b style="font-size:14px">${esc(project.name)}</b>
            <span style="color:var(--ink3);font-size:12px">by ${esc(project.owner.name)}</span>
            <div class="topbar-right">
              <button class="sim-btn run" id="v-run" title="Run">▶</button>
              <button class="sim-btn stop" id="v-stop" title="Stop">⏹</button>
              ${embed ? `<a class="btn ghost sm" href="/share/${sid}" target="_blank">Open full ↗</a>` : `<a class="btn primary sm" href="/">Build your own — free</a>`}
            </div>
          </div>
          <div style="flex:1;position:relative;overflow:hidden">
            <svg id="circuit" style="width:100%;height:100%"></svg>
            <div style="position:absolute;right:0;top:0;bottom:0;width:min(340px,44vw);background:var(--bg2);border-left:1px solid var(--line);display:flex;flex-direction:column">
              <div class="serial-head"><b>Serial</b><button class="btn ghost xs" id="v-clear" style="margin-left:auto">clear</button></div>
              <div id="serial-out" class="serial-out"></div>
              <div style="border-top:1px solid var(--line);padding:6px;font-size:11px;color:var(--ink3)">Code (${project.lang === 'py' ? 'MicroPython' : 'Arduino C/C++'}):</div>
              <pre id="v-code" style="flex:1;overflow:auto;font-size:10.5px;font-family:var(--mono);padding:8px;margin:0;color:var(--ink2)"></pre>
            </div>
          </div>
        </div>`;
      $('#v-code').textContent = project.code;
      CS.canvas = new CS.CircuitCanvas($('#circuit'));
      CS.canvas.readOnly = true;
      CS.canvas.setDoc({ components: project.components, wires: project.wires, viewport: null });
      CS.canvas.zoomFit();
      CS.sim = new CS.Engine();
      $('#v-run').addEventListener('click', () => {
        CS.sim.doc = { components: CS.canvas.doc.components, wires: CS.canvas.doc.wires };
        CS.sim.speed = 1;
        if (CS.sim.start(project.code, project.lang || 'cpp')) {
          toast('Simulation running ▶', 'ok', 1200);
          $('#v-run').style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
        }
      });
      $('#v-stop').addEventListener('click', () => { CS.sim.stop(); $('#v-run').style.background = ''; });
      CS.sim.on('serial', CS.debounce(() => {
        const out = $('#serial-out');
        const evs = CS.sim.serialEvents;
        for (let i = lastSerialIdx; i < evs.length; i++) { const s = document.createElement('span'); if (evs[i].sys) s.className = 'sys'; s.textContent = evs[i].text + (evs[i].nl !== false ? '\n' : ''); out.appendChild(s); }
        lastSerialIdx = evs.length; out.scrollTop = out.scrollHeight;
      }, 40));
      CS.sim.on('dirty', ids => ids.forEach(id => CS.canvas.updateComp(id)));
      CS.sim.on('tick', CS.debounce(() => CS.canvas.updateFlows(), 150));
      CS.sim.on('state', s => { if (s === 'idle') { CS.canvas.renderAll(); } });
      $('#v-clear').addEventListener('click', () => { $('#serial-out').innerHTML = ''; lastSerialIdx = 0; if (CS.sim.serialEvents) CS.sim.serialEvents.length = 0; });
    } catch (e) {
      $('#app').innerHTML = `<div style="display:grid;place-items:center;height:100vh;text-align:center"><div><div style="font-size:48px">🔌</div><h2>Project not found</h2><p style="color:var(--ink2)">${esc(e.message)}</p><a class="btn primary" href="/">Go to CircuitTecture</a></div></div>`;
    }
  }

  /* ===================== Custom Component SDK ===================== */
  const sdkWorkers = new Map();
  CS.customComponentSDK = {
    createWorker(id) {
      if (sdkWorkers.has(id)) return sdkWorkers.get(id);
      try {
        var w = new Worker('/js/component-worker.js');
        sdkWorkers.set(id, w);
        w.onerror = function () { CS.toast('Custom component ' + id + ' worker error', 'error'); };
        return w;
      } catch { /* ignore */
        CS.toast('Web Worker not available for custom components', 'warn');
        return null;
      }
    },
    execute(id, logicJs, pinValues, state) {
      const w = sdkWorkers.get(id) || this.createWorker(id);
      if (!w) return;
      w.postMessage({ type: 'execute', id, logicJs, pinValues, componentState: state });
    },
    sense(id, logicJs, pinValues, state) {
      const w = sdkWorkers.get(id) || this.createWorker(id);
      if (!w) return;
      w.postMessage({ type: 'sense', id, logicJs, pinValues, componentState: state });
    },
    terminate(id) {
      const w = sdkWorkers.get(id);
      if (w) { w.terminate(); sdkWorkers.delete(id); }
    },
    terminateAll() {
      var ids = Object.keys(sdkWorkers);
      for (var i = 0; i < ids.length; i++) {
        var w = sdkWorkers[ids[i]];
        if (w) w.terminate();
      }
      sdkWorkers.clear();
    }
  };
  CS.bus.on('simStop', () => CS.customComponentSDK.terminateAll());

  /* go */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
