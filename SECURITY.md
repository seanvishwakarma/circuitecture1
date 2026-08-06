# CircuitTecture Security Policy & Architecture

## Overview
CircuitTecture is an interactive IoT circuit simulator designed for secure execution of embedded simulation logic, circuit net solving, and administrative controls.

## Threat Model & Security Controls

### 1. Database & Injection Defenses
- **SQLite Parameterized Statements**: All database operations use `better-sqlite3` parameterized statements. Raw SQL string concatenation is strictly prohibited.
- **Input Sanitization**: User inputs (names, project labels, descriptions, code, custom components) are validated and sanitized at the REST boundary.
- **XSS Protection**: User-generated content rendered in the DOM is escaped using `CS.esc()` or rendered inside isolated Worker sandboxes.

### 2. Session Management & Auth
- **Cookie Security**: Authentication session cookies (`cf_session`) are flagged with `HttpOnly`, `SameSite=Lax`, and `Secure` (in production).
- **Session Lifespan & Rotation**: Sessions expire after 7 days by default. Password changes immediately invalidate all active sessions for that user via `DELETE FROM sessions WHERE userId = ?`.
- **Passwords**: Hashed using `crypto.scryptSync` with unique 16-byte random salts and constant-time comparison (`crypto.timingSafeEqual`).
- **Privilege-Change Invalidation**: Role changes, password changes, and account suspension invalidate all existing sessions for the affected user.

### 3. CSRF & Rate Limiting
- **CSRF Tokens**: All state-changing API endpoints (`POST`, `PUT`, `DELETE`, `PATCH`) under `/api/` validate the `X-CSRF-Token` header matching the active session CSRF secret. Login and signup are exempted.
- **Rate Limiting**: Per-IP sliding-window rate limiting is enforced on:
  - Signup (default: 8 per 10 minutes)
  - Login (default: 10 per 5 minutes)
  - Profile changes (10 per 10 minutes)
  - Project creation (20 per minute)
  - Password changes (5 per 10 minutes)
  All configurable via settings.

### 4. Custom Component Sandbox
- **Web Worker Isolation**: User-defined custom component simulation scripts run inside an isolated Web Worker sandbox with no direct DOM or network access. Workers communicate via structured `postMessage` interface only.
- **Isolation Boundaries**:
  - No `document`, `window`, `XMLHttpRequest`, or `fetch` access
  - No `localStorage`, `sessionStorage`, or cookies
  - Workers can be terminated individually or all at once on simulation stop

### 5. Security Headers
The server automatically applies the following security headers to all responses:
- `Content-Security-Policy`: Restricts scripts, styles, fonts, workers, and connections to trusted origins.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 6. Route Protection
- **Admin Routes**: `/api/admin/*` endpoints check `isAdmin()` or `requireModerator()` before processing.
- **Ownership Enforcement**: Project edit/delete routes enforce `canEdit()` which checks `ownerId === userId || role === 'admin'`.
- **Impersonation**: Admin impersonation sessions are tracked via `adminUid` field; all impersonated actions are logged in the audit trail with both real admin and impersonated user ID.
- **Destructive Action Confirmation**: User/project deletion and database restore require explicit confirmation tokens.

### 7. Observability & Health Checks
- **Structured Logging**: HTTP requests log method, path, status, latency, and request correlation IDs.
- **Health Checks**: `/healthz` and `/api/health` verify active database query execution before returning HTTP 200 OK.
- **Audit Logging**: All sensitive actions (login, signup, project CRUD, admin operations, impersonation) are logged to the `audit_log` table with user ID, action, target, and details.

### 8. Production Checklist
- [ ] Set `NODE_ENV=production` to enable production-only checks
- [ ] Change `SESSION_SECRET` to a unique, cryptographically random value
- [ ] Change `ADMIN_SEED_PASSWORD` from the default `admin1234`
- [ ] Configure `DB_PATH` to point to persistent storage
- [ ] Set `BACKUP_INTERVAL_MS` and `BACKUP_RETENTION_COUNT` appropriately
- [ ] Run behind a reverse proxy (Nginx/Caddy) with HTTPS and WebSocket support
- [ ] Review CSP headers for any necessary adjustments to allowed origins
- [ ] Enable rate limit monitoring on signup/login endpoints
