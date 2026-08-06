# CircuitTecture IoT Simulator

## Quick start

```bash
npm install        # no build step — plain Node + vanilla JS frontend
npm run dev        # http://localhost:8080 (node server.js)
npm test           # vitest run (unit tests)
npm run test:e2e   # playwright test (starts server automatically on port 8080)
npm run lint       # eslint on public/js/ server.js check_syntax.js
npm run format     # prettier --write
node check_syntax.js   # validates public/*.html DOCTYPE/title/meta
```

## Architecture

- **Server**: `server.js` — zero-dependency Node `http` module, CommonJS. Serves static files from `public/`, file-backed JSON storage in `data/`, session auth with CSRF. REST endpoints under `/api/`.
- **Frontend**: vanilla JS (no framework). All modules attach to `window.CS` via IIFE pattern (`const CS = window.CS;`).
- **Editor HTML**: `public/editor.html` — main interactive circuit editor page. Script load order IS the dependency chain:

  1. `util.js` (CS utilities, API helper, DOM helpers)
  2. `boards.js` (breadboard rendering)
  3. `parts.js` (component definitions)
  4. `templates.js` (project templates)
  5. `transpile.js` (C++/MicroPython transpilation)
  6. `sim.js` (simulation engine — union-find net solver, cooperative generator scheduler)
  7. `canvas.js` (canvas interaction — wiring, drag, zoom, minimap, junctions)
  8. `editor.js` (editor panel logic — code editor, parts library, serial monitor)
  9. `assistant.js` (AI assistant panel)
  10. `app.js` (app orchestrator — routing, auth, project CRUD, simulation lifecycle)

## Key conventions

- **`window.CS`** is the global namespace. Read CS modules via `const CS = window.CS;` then destructure.
- `public/js/app.js` handles page-level routing (landing, dashboard, editor, admin, share viewer).
- **Editor is one huge interface** — canvas (`canvas.js`, 1300+ lines), component panel, code editor (Ace), serial monitor, simulation controls all in `editor.html`.
- `check_syntax.js` is a standalone script that validates HTML structure — run it pre-commit.
- All 3rd-party HTML pages (`admin.html`, `components.html`, `dashboard.html`, `docs.html`, `features.html`, `pricing.html`) load state from `app.js` boot or manage themselves.
- `public/css/app.css` is the single stylesheet.

## Testing

- **Unit tests**: `tests/unit/*.test.js`. Node environment (vitest config). Key files: `transpile.test.js`, `sim.test.js`, `server.test.js`.
- **E2E tests**: `tests/e2e/*.spec.js`. Playwright on Chromium, baseURL `http://localhost:8080`. Screenshot baselines in `tests/e2e/__screenshots__/`.
- Run focused: `npx vitest run tests/unit/server.test.js` or `npx playwright test tests/e2e/visual.spec.js`.
- `npm run test:e2e` auto-starts the server (config has webServer block, port 8080, 2min startup timeout).
