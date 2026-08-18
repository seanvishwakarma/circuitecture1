# CircuitTecture — Transformation Plan (v1)

**Approved scope (from your picks):**
- Feature cut: **moderate** → remove multiplayer co-editing, version history/snapshots, AI assistant. Keep sharing, scope, plotter, watch, custom-component SDK.
- Multi-board: **linked** → boards run in parallel *and* talk to each other over wires (digital + UART).
- Classroom: **MVP** → teacher/student roles, classes w/ invite codes, assignments, submissions, teacher feedback.
- Community: **keep + polish** existing gallery.
- Components: **semi-realistic top ~15 parts**, consistency pass on the rest.

**Environment note:** `better-sqlite3` segfaults in this sandbox, so `npm start` / `vitest` can't run here. Validation strategy: ESLint + `check_syntax.js` + Playwright browser runs against an extended dev-only mock server (+ you run `npm test` on your machine before shipping).

---

## Phase 1 — Removal & Foundation Cleanup
*(Items 1 & 4 — do deletions first so later work builds on a clean base)*

### 1.1 Remove multiplayer co-editing
- [x] `server.js`: remove `require('ws')`, WebSocket server block, `server.on('upgrade')`, room/presence/cursor broadcast (~70 lines).
- [x] `app.js`: remove `connectMultiplayer`, `sendDocChange`, `updateMultiplayerPresence`, `renderRemoteCursor` + call sites; remove multiplayer from guided-tour text if mentioned.
- [x] `package.json`: drop `ws` dependency; refresh lockfile.
- [x] Remove AI-assistant docs tip (`docs.html`); rewrite `features.html` "Version Control" section → "Sharing & Community". *(marketing sync continues in Phase 6 — `features.html` also makes classroom claims: due dates, rubrics, grading, CSV exports — will align to shipped MVP)*

### 1.2 Remove version history / snapshots
- [x] `server.js`: remove `saveVersion` / `restoreVersion` handling in `PUT /api/projects/:id`. *(finding: handlers never existed server-side — the feature was dead UI)*
- [x] `app.js`: remove "Save version snapshot", "Version history" menu items, `versionHistory()`, `withVersion` branch in `saveProject()`.
- [x] `db.js`: `project_versions` table + prepared statements removed from schema; `DROP TABLE IF EXISTS` legacy migration added for existing databases.

### 1.3 Remove AI assistant
- [x] Delete `public/js/assistant.js`; remove its `<script>` tag and chat panel markup from `editor.html` (+ CSS: `.chat-*`, assistant FAB).
- [x] Remove `CS.app.insertGenerated` hook in `app.js`.

### 1.4 Consolidate the duplicate DB layers
- [x] DB consolidation: `server.js` used `db.js` exclusively; `database.js` (divergent `CircuitDB` class, snake_case schema) was **100% dead** — deleted. Verified all 50 `db.*` calls exist in `db.js`.
- [x] Fix any drift between them (tables present in one but not the other, e.g. `templates`, `feature_flags`, `project_versions`).

### 1.5 General dead-code sweep
- [x] Removed assistant CSS block (`.chat-*`, `.typing`, `@keyframes tp`). tpl leftovers removed earlier. *(devices.js audit deferred to Phase 6 sweep)*
- [ ] Delete `public/js/devices.js` if it's an unused 2-line stub; audit `editor.js` Monaco fallbacks. *(deferred to Phase 6 sweep)*
- [ ] `docs/` and README: refresh to match reality after cuts.

**Phase gate:** ESLint clean · `check_syntax.js` OK · dashboard/editor/admin load in browser with zero console errors.

**✅ PHASE 1 COMPLETE** — gate passed: ESLint clean (public/js + server.js + db.js), `check_syntax.js` 7/7, Playwright smoke `/`, `/features`, `/docs`, `/dashboard`, `/editor` zero console errors. Bonus find: fixed **`CS.staticNets` never existing** — broke the circuit checker & DRC badge since the original commit; restored checker toasts, badge, and deduped wiring-guide union-find.

---

## Phase 2 — Bugfix Pass 1 (found-during-Phase-1 + quick wins)
Known issues to fix now:
- [x] **Problems panel unified** — one renderer merges code diagnostics (jump-to-line) + circuit checker (focus-component); consistent `.problem-item` markup, `#problems-count` badge now increments, duplicate `#problems-clear` handler removed, `focusComponent()` deduped from 3 copies.
- [ ] `sendDocChange` removed, but check no lingering `CS.user` references (used `CS.user` while app stores user in `app.user`).
- [x] `initMobileNav` deleted (was **100% dead code** — targets never existed on landing, never called on dashboard). Dashboard drawer now owned by `bindGlobal`: toggle, scrim-outside-click (handles the `.dash-side.open::before` hit-target quirk), Escape, delegated close-after-pick. Also removed duplicated `_dashboardTabListener` block.
- [x] Audited `editor.js` — fallback-first init with clean Monaco upgrade; no race found (diagnostics/gutter identical on both paths). No change needed.
- [x] Verified — empty-state quick-template buttons and greeting copy still line up with the name/board/lang → blank-canvas flow.
- [x] Worst offender fixed — account deletion was a browser `prompt()` **then** `confirm()` chain; now a single inline danger zone with password confirm + Enter (zero native dialogs). Single-step confirms elsewhere kept deliberately.

---

## Phase 3 — Canvas Navigation + Realistic Components
*(Items 7 & 8 — independent of sim/backend, pure frontend wins)*

### 3.1 Two-finger / trackpad canvas navigation (Item 7)
- [ ] `canvas.js`: pointer-event gesture layer:
  - [x] **Trackpad/mouse**: `wheel` = pan X/Y, `Shift+wheel` = pan sideways, `Ctrl/Cmd+wheel` = cursor-anchored zoom (also catches trackpad pinch), Firefox line-mode deltas normalized. Verified live: pan moves view w/o zoom change, ctrl-scroll zooms ×1.33.
  - [x] **Touch**: two-finger pan + focal-anchored pinch zoom **already existed** in canvas.js (verified intact); `touch-action:none` already set; one-finger select/wire/box-select preserved.
- [x] `touch-action:none` confirmed present; zoom clamped 0.25–3 everywhere.
- [x] Minimap untouched.
- [x] Canvas hint + shortcuts modal updated (Scroll/two-finger drag = pan; Ctrl+scroll/pinch = zoom; Shift+scroll = sideways).

### 3.2 Semi-realistic components (Item 8)
Restyle SVG renders in `parts.js`/`boards.js` (tie-break = realistic-but-clean, not photoreal noise):
- [x] **Uno R3 fully restyled** — PCB gradient + sheen, plated mounting holes, metal USB shell, barrel jack, ATmega w/ legs, crystal, electrolytic cans, ICSP header w/ gold holes, tactile reset, chip LEDs, silkscreen. *(Other boards inherit the same helper style — noted for Phase 6 consistency pass.)*
- [x] LED (glass dome + highlight + metal leads), resistor (ceramic gradient + end caps, real bands), pushbutton (4 feet + gradient cap), potentiometer (knurled metal ring), servo SG90 (tabs + gloss + branding), buzzer (radial cylinder + vent), battery (gradient pack + red band + terminals).
- [x] OLED (blue module PCB + glass screen + gold pads), DHT22 (white grille shell + blue pin strip), ultrasonic HC-SR04 (twin silver mesh cans + crystal). *(PIR/relay deferred — beast-list bumped to consistency pass.)*
- [ ] Everything else: consistency pass — unified stroke palette, corner radius, drop shadow tier.
- [ ] Constraints: pin positions/IDs/hit-areas unchanged ⇒ wiring, thumbnails, guides, exports keep working; `<animate>` reuse; verify at 60fps with 20+ parts.
- [ ] Update minimap/thumbnail styles to suit new renders.

**Phase gate:** Editor + dashboard screenshots reviewed; touch/pinch verified on emulated mobile viewport.

---

## Phase 4 — Multi-Board (Linked)
*(Item 2b — deepest sim work; staged)*

### 4.1 Model & UI groundwork
- [x] Project data: `code`/`lang` → `sketches: { [compId]: { code, lang } }` with **backward migration** (old projects map code → first board). — db column + migration + server sanitize/projectView; legacy `code` kept as active-board mirror.
- [x] Code editor header: **board tabs** (one per MCU, name+icon+lang pill); per-tab language & breakpoints; deleted boards archive their sketch (undo restores it) instead of data loss.
- [x] Checker update: removed "only the first one runs" warning.

### 4.2 Parallel simulation
- [x] Refactored `CS.sim` → one Engine hosting a **board fleet** (`boards[]`: own program generator, channels, tone stops, interrupts, serial RX, gpioMode, baud) sharing one net solver; legacy single-board mirrors kept.
- [x] Serial monitor: per-board colored tag chips; pause/step run globally, breakpoints/step scoped to the active tab via `debugBoardId`.
- [x] Scope (per-board optgroups `mcuId|pin|mode`), watch (active board via `exportsFor`), pinout (per-board sections).

### 4.3 Board-to-board linking
- [x] **Digital link**: all boards drive/read the one shared net solver — cross-board wires just work (channelOf scans all boards).
- [x] **UART link**: `routeUart` routes bytes TX-net→RX-pin of other boards (per-family UART pin maps incl. AVR/ESP/RPi/Pico); baud mismatch emits a ⚠️ system note.
- [ ] Wiring Guide cross-board rows + TX-TX/RX-RX flags. — DEFERRED to P5 polish batch

**Phase gate:** ✅ Node harness 7/7 suites (blink isolation, UART echo, compile-error board tagging, py top-level, probes) + Playwright 23/23 (migration→tabs→switch→UART E2E→save payload w/ sketches→template rebuild→pause/resume→zero console errors). Bonus fix: per-frame `tick/clock/serial` handlers were starved by trailing debounce since origin — swapped to new `CS.throttle`; sim clock, scope, watch & wire-flows now repaint live.

---

## Phase 5 — Classroom (MVP) + Community Polish
*(Items 2a & community)*

### 5.1 Roles & accounts
- [x] Signup: account type picker — **Student / Teacher** (server: `role: 'teacher'` gated by `teacherSignup` setting; admin/moderator unchanged).
- [x] Teacher-only gates (server-enforced on create class / create assignment / gradebook / roster). Join-by-code & submit for members.

### 5.2 Classes
- [x] Schema: `classes` + `class_members` (FK-cascaded), unique 6-char unambiguous invite codes.
- [x] API: classes CRUD + join + leave + roster + `DELETE /api/classes/:id/members/:uid`; ownership verified server-side everywhere.
- [ ] Dashboard "🏫 Classroom" tab:
  - Teacher: class cards, create class, copy invite code pill, roster modal with remove-student. ✅
  - Student: joined class chips, join-with-code bar (inline, not modal). ✅

### 5.3 Assignments & submissions (build on existing tables)
- [x] API: `assignments.classId` (+migration); GET scoped by role (teacher: own / student: class feed); submit (resubmit clears grade); submissions+roster for teacher; grade via `POST /api/assignments/:id/grade` (0–100 + feedback).
- [x] Teacher UI: assignment modal (title/brief/due), Gradebook modal (roster×submission grid, open project ↗, grade%, feedback, per-row save).
- [x] Student UI: assignment cards (brief, due/overdue, status chips, ⭐ graded + feedback quote, submit/resubmit picker modal).
- [x] Editor: read-only shell for ALL non-owned projects — banner with owner name + Fork CTA, canvas/code locked, Save hidden. Projects still simulatable (teacher can run submissions live).

### 5.4 Community polish
- [x] Gallery: board filter chips (>1 board), full sort-select reuse, search includes description, 🚩 report button → moderation queue. (Trending = sort by likes/forks via sort select.)
- [x] Share modal: gallery description field appears on publish; auto-saves.
- [ ] Moderation queue small UI fix pass. — rolled into P6 admin batch

---

## Phase 6 — Marketing Honesty + UX/Admin Improvements + Final Sweep
*(Items 5, 6, 3)*

### 6.1 Sync landing / features / docs with shipping reality (Item 6)
- [ ] Rewrite `index.html`, `features.html`, `docs.html`, `components.html` copy to advertise only what exists: parallel multi-board sim w/ cross-board links, classroom, community gallery, 35+ real components (verify exact count), wiring guide, scope, export.
- [ ] Replace any stale screenshots/section art; fix stat counters to real numbers.
- [ ] CTA destinations verified (signup → dashboard; docs anchors exist).

### 6.2 User-experience improvements (Item 5 — user side)
Implement now (low-risk, high-value):
- [ ] ❤️ **Ctrl+K command palette**: run/stop, save, switch dock tab, add component, jump to dashboard.
- [ ] Drag preview ghost when dragging components from library (currently invisible until drop).
- [ ] Persisted editor prefs (font size already selectable → persist; default board for new projects).
- [ ] Autosave every 60s when dirty (in addition to save button), offline reconnect toast.
- [ ] Toast "Undo" for delete-project.
- [ ] Touch-device editor guardrail: clear "best on desktop" hint rather than broken layout.
Ideas queued as future (document only): wire auto-color by signal kind, onboarding sample project, in-app changelog.

### 6.3 Admin-experience improvements (Item 5 — admin side)
Implement now:
- [ ] `/admin` overview: signup trend (7d/30d), sims run, top boards, active sessions sparkline (data already tracked).
- [ ] Users table: search by email/name, role filter, one-tap "force password reset".
- [ ] Projects: search by owner + unpublish-with-reason action; audit log filters (actor/action/date) + CSV export.
- [ ] Feature-flags panel (table exists — UI toggle to hide/show Classroom/Community while you stage release).

### 6.4 Final bug sweep (Item 3)
- [ ] Full-flow E2E checklist: signup/login → dashboard CRUD → editor build+run → share → classroom flows → admin flows. Fix everything found.
- [ ] Re-run ESLint, `check_syntax.js`, Playwright visual pass on all pages (desktop + 400px mobile).

---

## Execution notes
- **Estimated order**: P1 → P2 → P3 → P4 → P5 → P6 (each phase independently testable; P3 and P4 could swap if you want sim work first).
- **Biggest risks**: P4 engine refactor (mitigation: stage as 4.1 → 4.3 with gates); P1 DB consolidation (mitigation: keep column-compatible migrations, no data loss).
- **Out of scope (explicit)**: realtime collaboration, version control, AI assistant (removed); full LMS features (due dates/grades); social features beyond gallery polish; mobile-native editor.
