# CircuitTecture IoT Simulator

A full-stack IoT and microcontroller circuit simulator with an interactive, canvas-based visual editor, real-time simulation engine, C++/MicroPython transpilation, code editor, WebSocket multiplayer, and administrative tools.

## Quick Start / Local Dev Setup

Requires **Node.js >= 22** (matching `better-sqlite3`).

```bash
# Install dependencies
npm install

# Run database migration (converts legacy db.json to SQLite database at data/circuittecture.db)
npm run db:migrate

# Start the local development server (defaults to http://localhost:8080)
npm run dev

# Run code linter
npm run lint

# Check HTML syntax
node check_syntax.js

# Run unit test suite (Vitest)
npm test

# Run end-to-end tests (Playwright)
npm run test:e2e
```

## Architecture & Data Layer

- **Database**: SQLite backed by `better-sqlite3` (`data/circuittecture.db`). ACID-compliant transactions with foreign key constraints, index optimization, and native automated backup rotation (`.backup()`).
- **Server**: `server.js` — Node HTTP server + WebSocket (`ws`) server for real-time multiplayer collaboration.
- **Frontend**: Vanilla JS modules attached to `window.CS`. Includes A* auto-routing, Tidy Layout, Pinout side panel, persistent DRC/Problems scanner, logic analyzer, schematic view, BOM exporter, custom component SDK with Web Worker sandbox, and canvas minimap.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP & WebSocket server port |
| `NODE_ENV` | `development` | Set to `production` for production security checks |
| `DB_PATH` | `data/circuittecture.db` | Absolute or relative path to SQLite database |
| `SESSION_SECRET` | `dev-secret-...` | Session cookie signing secret (required in production) |
| `ADMIN_SEED_EMAIL` | `admin@circuittecture.local` | Default administrator seed account email |
| `ADMIN_SEED_PASSWORD` | `admin1234` | Default administrator seed password (required to change in production) |
| `BACKUP_INTERVAL_MS` | `3600000` | Automated SQLite backup interval in ms (default 1 hr) |
| `BACKUP_RETENTION_COUNT` | `10` | Number of automated backup files to retain |
| `RATE_LIMIT_SIGNUP` | `8` | Signup attempts allowed per IP per 10-minute window |
| `RATE_LIMIT_LOGIN` | `10` | Login attempts allowed per IP per 5-minute window |

## Features

### Editor / Canvas
- Drag-and-drop component placement from the parts library
- Interactive wiring: click-to-start, drag-to-connect with orthogonal/smooth routing
- **A* auto-routing**: Grid-based pathfinding around component bounding boxes with manual bend editing and orthogonal fallback
- **Tidy Layout**: Force-directed auto-layout that keeps MCU pinned, respects bounding boxes, and uses wires as weak constraints
- **Pinout Panel**: Live MCU pinout with free/in-use/conflicted occupancy status and connected component details
- **Wire Bundling**: Parallel wires automatically offset into visual ribbons (3+ wires)
- **Undo/Redo** with full stack and keyboard shortcuts
- **Group/Ungroup** for component clusters
- **Minimap** for large circuit navigation
- **Persistent DRC/Problems Panel**: Scans for floating inputs, missing LED resistors, reversed capacitors, power/ground shorts
- **Snap to grid** and **zoom/pan** controls

### Code Editor
- Monaco Editor integration with C++/MicroPython syntax highlighting, autocomplete, and hover documentation
- Textarea fallback when Monaco is unavailable
- Breakpoints, execution highlighting, and error diagnostics
- Serial monitor with plotter and variable watch

### Simulation Engine
- Cooperative generator scheduler (delay/sleep suspend with pause-at-line, breakpoints, single-step)
- Union-find net solver (digital-analog hybrid with strong/weak drivers)
- Built-in library shims: Servo, LiquidCrystal, DHT, OLED, Ultrasonic, Stepper, GPS, Camera, IMU, RFID
- MicroPython shim: Pin, ADC, PWM
- WebAudio tone/buzzer output
- **Scope channels** for real-time voltage/state monitoring
- **Implicit GND rail**: All ground pins share a common net without explicit wiring

### Schematic View
- Toggle between breadboard and schematic representation
- Schematic symbol rendering with pin stubs and labels

### Logic Analyzer
- Real-time waveform display for scoped channels
- CSV export for external analysis

### BOM Export
- CSV export with component type, name, category, quantity, specs, and DigiKey purchase links

### Sharing & Community
- Share links with embed support
- Community project gallery
- Official templates gallery with starter circuits

### Multiplayer Collaboration
- WebSocket-based real-time collaboration on shared projects
- Presence indicators (join/leave)
- Doc sync (components and wires)
- Remote cursor rendering
- Periodic SQLite persistence on doc change

### Custom Component SDK
- Define custom components with pins, SVG rendering, and tick/sense hooks
- Server API for CRUD operations
- **Web Worker sandbox**: User-defined logicJs runs in isolated Worker with no DOM/network access
- Security model: structured message interface only, no `document`/`window`/`fetch`/`XMLHttpRequest`

### Classroom / Assignments
- Create assignments with titles, briefs, due dates, and rubrics
- Student submissions linked to projects
- Grading and feedback

## Admin Panel

| Tab | Features |
| --- | --- |
| Overview | Stats (users, projects, sessions, uptime), quick actions |
| Users | List, create, edit, suspend, delete (with confirmation), impersonate |
| Projects | List all projects, edit metadata, promote to template, delete |
| Settings | Signup open/closed, community gallery, max users/projects, rate limits |
| Security | View and manage sessions, force logout all |
| Feature Flags | Toggle maintenance mode, community, signup, board toggles, forking |
| Templates | Promote/demote official templates |
| Operations Dashboard | System health, active sessions, feature status |
| Database | Manual backup, restore from backup (with confirmation), view backup history |
| Activity | Full audit log with user, action, timestamp |
| Moderation | Review flagged projects, approve/reject, feature content |

## Security

- **Password hashing**: `crypto.scryptSync` with unique 16-byte random salts and `crypto.timingSafeEqual` comparison
- **Session cookies**: `HttpOnly`, `SameSite=Lax`, `Secure` (production), with configurable expiry
- **CSRF tokens**: Required on all state-changing API routes, stored per-session
- **Rate limiting**: Per-IP sliding window on signup, login, profile/password changes, project creation
- **Security headers**: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Impersonation audit trail**: All impersonated actions record both the real admin and the impersonated user
- **Web Worker sandbox**: Custom component code runs without DOM/network privileges
- **Parameterized SQL**: All queries use `better-sqlite3` prepared statements

## Database Migration

If upgrading from a legacy `data/db.json` based version:

```bash
# The migration script is lossless and verifies row counts and spot-checks
node scripts/migrate-json-to-sqlite.js

# On success, db.json is renamed to db.json.migrated
# New database is at data/circuittecture.db
```

The migration script:
1. Reads all data from `data/db.json`
2. Inserts into SQLite in a single transaction
3. Verifies row counts match
4. Spot-checks the first user and project
5. Archives the original `db.json` as `db.json.mitrated`

## Testing

```bash
# Unit tests (Vitest) — server API, simulation, transpilation, security
npm test

# E2E tests (Playwright) — user flows, simulation, visual regression
npm run test:e2e

# Run specific test file
npx vitest run tests/unit/server.test.js

# Run specific e2e test
npx playwright test tests/e2e/user-flow.spec.js
```

## Deploying

### Requirements
- **Node.js >= 22**, Linux host recommended.
- A **reverse proxy** (Nginx/Caddy) terminating TLS and proxying HTTP + WebSocket to the app port.

### 1. Environment
`NODE_ENV=production` activates production-only behavior: the server **refuses to boot** with the default `SESSION_SECRET` or `ADMIN_SEED_PASSWORD`, session cookies are marked `Secure`, and `Strict-Transport-Security` (HSTS) is sent when the request arrives over HTTPS (`X-Forwarded-Proto: https`).

```bash
NODE_ENV=production \
PORT=8080 \
SESSION_SECRET="$(openssl rand -base64 48)" \
ADMIN_SEED_PASSWORD="change-me-to-a-strong-password" \
npm run start:prod
```

### 2. Process Manager (systemd)
```ini
[Unit]
Description=CircuitTecture IoT Simulator
After=network.target

[Service]
Type=simple
User=circuittecture
WorkingDirectory=/opt/circuittecture
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=SESSION_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
Environment=ADMIN_SEED_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

PM2 alternative:
```bash
NODE_ENV=production pm2 start server.js --name "circuittecture"
pm2 save
```

### 3. Reverse Proxy (Nginx)
- Proxy both HTTP and WebSocket upgrades: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
- Forward real client addresses: `proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme;` (needed for HSTS and rate limiting).
- Terminate TLS and enable HSTS at the proxy layer: `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;`

### 4. Storage & Backups
- Mount `data/` on persistent storage — it holds `circuittecture.db` and the automated backups in `data/backups/` (retention controlled by `BACKUP_RETENTION_COUNT`).
- `data/` is **git-ignored**; never commit the database or its backups.
- Health check: `GET /api/health` returns `{"ok":true,...}` without authentication; use it for orchestrator readiness/liveness probes.

### 5. First Boot
The admin seed account is created on first boot (see `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`). **Change the admin password** from the Admin panel after the first login and rotate it into the environment.

## Project Structure

```
├── server.js                    # HTTP + WebSocket server
├── db.js                        # SQLite database layer
├── database.js                  # Alternative DB class (legacy compat)
├── data/
│   ├── circuittecture.db        # SQLite database (git-ignored)
│   ├── seeds.js                 # Official starter templates (tracked)
│   └── backups/                 # Automated/manual backups (git-ignored)
├── scripts/
│   └── migrate-json-to-sqlite.js
├── public/
│   ├── index.html               # Landing page
│   ├── editor.html              # Circuit editor
│   ├── dashboard.html           # User dashboard
│   ├── admin.html               # Admin panel
│   └── js/
│       ├── app.js               # App orchestrator
│       ├── canvas.js            # Canvas interaction & rendering
│       ├── sim.js               # Simulation engine
│       ├── editor.js            # Code editor, logic analyzer, BOM
│       ├── parts.js             # Component definitions
│       ├── boards.js            # Breadboard rendering
│       ├── util.js              # Utilities, events, CSS
│       ├── transpile.js         # C++/MicroPython transpilation
│       ├── templates.js         # Project templates
│       ├── assistant.js         # AI assistant panel
│       ├── admin.js             # Admin panel UI
│       └── component-worker.js  # Custom component SDK sandbox
├── tests/
│   ├── unit/                    # Vitest unit tests
│   └── e2e/                     # Playwright E2E tests
└── SECURITY.md                  # Security policy & architecture
```

## License

MIT
