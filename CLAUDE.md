# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Anchor AppView is a personal location journal built on AT Protocol. Users check
in to places, and all checkin data lives in their Personal Data Servers (PDS) —
this app reads and writes directly to PDS with no local checkin storage.

Live at **https://dropanchor.app**. Companion iOS app uses `anchor-app://`
scheme for OAuth callbacks.

## Architecture

### PDS-Only Data Model

**Critical constraint**: Checkin data is never stored locally. All checkins are
created via `com.atproto.repo.createRecord` and read via `listRecords` /
`getRecord` directly from users' PDS.

**Exception — Likes and Comments**: These use a hybrid approach. Records live in
users' PDS, but a local index (`checkin_interactions`, `checkin_counts` tables)
enables efficient discovery and counting. External likes/comments created
directly via PDS won't appear until indexed.

Local database (Turso/libSQL) only stores:

- OAuth sessions (via `@tijs/atproto-storage`)
- Like/comment interaction indexes

### Stack

- **Runtime**: Deno, deployed on Deno Deploy
- **Framework**: Fresh 2 (`@fresh/core@^2.2.0`) — uses Hono internally for
  routing
- **Frontend**: React 19 SPA, bundled with esbuild
  (`scripts/build-frontend.ts`), content-hashed output in `static/`
- **Database**: Turso/libSQL with Drizzle ORM (`sqlite-proxy` adapter)
- **OAuth**: `jsr:@tijs/atproto-oauth@2.4.0` with
  `jsr:@tijs/atproto-storage@1.0.0`
- **Error tracking**: Sentry
- **CDN**: Bunny CDN at `cdn.dropanchor.app`

### Entry Points

- `main.ts` — App definition: middleware, route registration, exports `app`
- `dev.ts` — Development server with Fresh hot reload
- `frontend/index.tsx` — React SPA entry point (bundled by esbuild)

### Key Backend Modules

| Module | Purpose |
| --- | --- |
| `backend/routes/oauth.ts` | OAuth init (lazy, derives BASE_URL from first request) |
| `backend/routes/auth.ts` | Login, session, logout endpoints |
| `backend/routes/frontend.ts` | HTML shell serving with SSR |
| `backend/api/anchor-api.ts` | Main API router — dispatches by URL pattern |
| `backend/api/checkins.ts` | Checkin creation (two-record pattern: address + checkin with StrongRef) |
| `backend/api/user-checkins.ts` | Read checkins from PDS |
| `backend/api/likes.ts` | Like endpoints with local index |
| `backend/api/comments.ts` | Comment endpoints with local index |
| `backend/api/places.ts` | Place search via Overpass/Nominatim |
| `backend/database/db.ts` | Drizzle ORM adapter |
| `backend/database/schema.ts` | SQLite schema |
| `backend/database/migrations.ts` | Table creation (runs on startup) |
| `backend/services/image-service.ts` | Image validation, EXIF stripping |
| `backend/utils/auth-helpers.ts` | Auth extraction from cookies/Bearer tokens |

### Request Flow

1. Fresh middleware chain: error handling → OAuth init → security headers →
   static files
2. Auth routes registered via `registerAuthRoutes(app)` in `main.ts`
3. API routes delegate to `anchorApiHandler` (URL pattern matching) or direct
   handlers (`createCheckin`, `deleteCheckin`)
4. Frontend routes registered last (catch-all)

### Making Authenticated PDS Requests

Always use OAuth session's `makeRequest()` — it handles token refresh and DPoP
automatically:

```typescript
const oauthSession = await sessions.getOAuthSession(did);
const response = await oauthSession.makeRequest(
  "POST",
  `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
  { headers: { "Content-Type": "application/json" }, body: JSON.stringify({...}) }
);
```

Never manually construct Authorization headers or use raw `fetch()` for PDS
calls.

## Development Commands

```bash
# Dev server (builds frontend, then watches backend/ and frontend/)
deno task dev

# Run all tests
deno task test

# Unit tests only
deno task test:unit

# Integration tests only
deno task test:integration

# Watch mode for TDD
deno task test:watch

# Full quality check (fmt + lint + type check + tests)
deno task quality

# Quick quality (no type check)
deno task quality-no-check

# Build frontend bundle only
deno task build:frontend
```

To run a single test file:

```bash
TURSO_DATABASE_URL=file::memory: COOKIE_SECRET=test-cookie-secret-32-characters-minimum \
  deno test --allow-all tests/unit/image-service.test.ts
```

## AT Protocol Record Types

**Checkin** (`app.dropanchor.checkin`): text, createdAt, addressRef (StrongRef),
coordinates, optional category/categoryIcon/categoryGroup

**Address** (`community.lexicon.location.address`): name, street, locality,
region, country, postalCode

**Like** (`app.dropanchor.like`): createdAt, checkinRef (StrongRef)

**Comment** (`app.dropanchor.comment`): text (max 1000 chars), createdAt,
checkinRef (StrongRef)

Checkins use a **two-record pattern**: create address record first, then checkin
record referencing it via StrongRef (CID + AT URI).

Lexicons are published on the dropanchor.app PDS account. Validate/publish with
`goat` CLI:

```bash
goat lex parse ./lexicons/app/dropanchor/*.json
goat lex status ./lexicons/
```

## API Endpoints

```
POST   /api/checkins                          Create checkin
GET    /api/checkins/:did                     User's checkins (paginated)
GET    /api/checkins/:did/:rkey               Single checkin
DELETE /api/checkins/:did/:rkey               Delete checkin

GET    /api/checkins/:did/:rkey/likes         Likes for checkin
POST   /api/checkins/:did/:rkey/likes         Like (auth required)
DELETE /api/checkins/:did/:rkey/likes         Unlike (auth required)

GET    /api/checkins/:did/:rkey/comments      Comments for checkin
POST   /api/checkins/:did/:rkey/comments      Comment (auth required)
DELETE /api/checkins/:did/:rkey/comments      Delete comment (auth required)

GET    /api/nearby?lat=&lng=&radius=&limit=   Spatial query
GET    /api/user?did=                         User checkins (legacy)
GET    /api/following?user=                   Following feed
GET    /api/stats                             System metrics
GET    /api/places/nearby                     POI search (Overpass)
GET    /api/places/search                     Place search (Nominatim)
GET    /api/places/categories                 Category list
POST   /api/migrate-checkins                  DAG-CBOR migration (auth required)

GET    /login                                 OAuth web flow
GET    /oauth/callback                        OAuth redirect
GET    /api/auth/session                      Session validation
POST   /api/auth/logout                       Logout
```

## Testing

Tests use Deno's built-in test framework with in-memory SQLite
(`file::memory:`). External services (AT Protocol, Overpass, OAuth) are mocked.

- **Unit tests** (`tests/unit/`): Individual functions in isolation
- **Integration tests** (`tests/integration/`): Full request/response cycles
- **Fixtures**: `tests/fixtures/test-data.ts`
- **Mocks**: `tests/mocks/sqlite-mock.ts`

CI (`.github/workflows/deno.yml`) runs lint + unit tests only (integration tests
excluded).

## Deployment

Auto-deploys on push to `main` via Deno Deploy GitHub integration. No manual
deploy step. Environment variables configured in Deno Deploy dashboard.

Key env vars: `COOKIE_SECRET`, `ANCHOR_BASE_URL`, `BUNNY_STORAGE_ZONE`,
`BUNNY_STORAGE_KEY`, `BUNNY_STORAGE_REGION`, `BUNNY_CDN_URL`,
`TURSO_DATABASE_URL`.

## Adding New Database Tables

1. Define schema in `backend/database/schema.ts`
2. Add migration SQL in `backend/database/migrations.ts`
3. Tables auto-create on startup via `initializeTables()`

## Mobile Integration (iOS)

OAuth flow: iOS WebView opens `/login?handle=...` → user completes OAuth →
success redirects to `anchor-app://auth-callback` with session data. iOS app
uses Bearer token auth (`Authorization: Bearer {session_id}`). Set WebView
User-Agent to "AnchorApp" for detection.

## Constraints

- **No local checkin storage** — PDS-only architecture is intentional
- **500 line file limit** — break up files that exceed this
- Code files should never be more than 500 lines
- Use `https://esm.sh` for npm packages, `jsr:` for JSR packages
- Deploys happen automatically on push to main via Deno Deploy
