# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Anchor AppView is a location-based social feed generator built on AT Protocol.
The system uses a **PDS-only architecture** where all checkin data is read
directly from users' Personal Data Servers, with minimal local storage used only
for OAuth session management.

## Architecture

### Core Design Pattern: PDS-Only Architecture

**Critical architectural constraint**: This system does NOT store checkin data
locally. All checkins are:

1. Created directly in users' PDS via AT Protocol
   `com.atproto.repo.createRecord`
2. Read on-demand from PDS via `com.atproto.repo.getRecord` and
   `com.atproto.repo.listRecords`
3. Never cached or persisted in local database

The only local data storage is `iron_session_storage` table for OAuth sessions.

### Entry Point

- **Main file**: `main.tsx` (deployed to Val Town with
  `// @val-town anchordashboard` comment)
- **Base URL**: `https://dropanchor.app` (configurable via `ANCHOR_BASE_URL`)
- **Framework**: Hono web server serving unified API, OAuth, and React frontend
- **Runtime**: Deno on Val Town platform

### Key Components

**OAuth Authentication** (`backend/routes/oauth.ts`, `backend/oauth/`):

- Uses custom package `jsr:@tijs/atproto-oauth-hono@^0.3.0`
- Provides web and mobile (iOS) authentication flows
- Mobile: Custom URL scheme `anchor-app://auth-callback`
- Session storage via Drizzle ORM with SQLite
- Automatic token refresh and DPoP handling built into OAuth sessions

**Checkin API** (`backend/api/checkins.ts`):

- Creates checkins via AT Protocol `createRecord` with immediate PDS writes
- Two-record pattern: address record + checkin record with StrongRef
- Address enhancement via Overpass API (OpenStreetMap)
- Authentication via Bearer tokens (mobile) or cookies (web)

**Feed API** (`backend/api/anchor-api.ts`):

- Reads checkins directly from users' PDS
- Spatial queries, user feeds, following feeds
- No local database reads for checkin data

**Database Layer** (`backend/database/`):

- Drizzle ORM with `sqlite-proxy` adapter
- Schema: `backend/database/schema.ts` (only OAuth session storage)
- Migrations: `backend/database/migrations.ts`

## Development Commands

### Testing

```bash
# Run all tests (unit + integration)
deno task test
# or
./scripts/test.sh

# Run only unit tests
deno task test:unit

# Run only integration tests
deno task test:integration

# Watch mode for TDD
deno task test:watch
```

### Code Quality

```bash
# Format, lint, type check, and test
deno task quality

# Quality check without type checking (faster)
deno task quality-no-check

# Individual checks
deno fmt              # Format code
deno lint             # Lint code
deno check --allow-import   # Type check
```

### Deployment

```bash
# Deploy to Val Town (runs quality checks first)
deno task deploy

# Manual deployment
vt push
```

## Val Town Platform Guidelines

### SQLite Usage

**CRITICAL**: Always use `sqlite2`, not the deprecated `sqlite` module.

```typescript
// ✅ CORRECT
import { sqlite } from "https://esm.town/v/std/sqlite2";

const result = await sqlite.execute({
  sql: "SELECT * FROM users WHERE id = ?",
  args: [userId],
});

// ❌ WRONG - old deprecated module
import { sqlite } from "https://esm.town/v/std/sqlite";
await sqlite.execute("SELECT * FROM users", [userId]);
```

### Drizzle ORM with sqlite-proxy

This project uses Drizzle ORM with the `sqlite-proxy` adapter to wrap Val Town's
sqlite2:

```typescript
// See backend/database/db.ts for the adapter implementation
export const db = drizzle(
  async (sql, params) => {
    const result = await sqlite.execute({ sql, args: params || [] });
    return { rows: result.rows };
  },
  { schema },
);
```

When adding new tables:

1. Define schema in `backend/database/schema.ts` using Drizzle syntax
2. Create migration SQL in `backend/database/migrations.ts`
3. Tables auto-create on startup via `initializeTables()` in main.tsx

### Environment Variables

Never hardcode secrets:

```typescript
const secret = Deno.env.get("COOKIE_SECRET");
const baseUrl = Deno.env.get("ANCHOR_BASE_URL") || "https://dropanchor.app";
```

### External Dependencies

- Use `https://esm.sh` for npm packages
- Use `jsr:` for JSR packages (Hono, atproto-oauth-hono)
- Use `https://esm.town/v/std/` for Val Town utilities

## OAuth Authentication Flow

### Package: @tijs/atproto-oauth-hono

The OAuth system uses a custom package that handles:

- PKCE flow with automatic PDS discovery
- DPoP (Demonstrating Proof of Possession) tokens
- Token refresh logic
- Mobile and web authentication modes
- Session storage via Drizzle adapter

### Usage Pattern

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth-hono@^0.3.0";

const oauth = createATProtoOAuth({
  baseUrl: BASE_URL,
  cookieSecret: COOKIE_SECRET,
  mobileScheme: "anchor-app://auth-callback",
  sessionTtl: 60 * 60 * 24 * 30, // 30 days
  storage, // DrizzleStorage instance
});

// Export for use in other modules
export const oauthRoutes = oauth.routes; // Hono routes
export const sessions = oauth.sessions; // Session management API
```

### Making Authenticated Requests

OAuth sessions provide automatic token refresh and DPoP handling:

```typescript
const oauthSession = await sessions.getOAuthSession(did);
if (!oauthSession) {
  return { error: "No session" };
}

// makeRequest handles token refresh and DPoP automatically
const response = await oauthSession.makeRequest(
  "POST",
  `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
  {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo: did, collection: "...", record: {...} })
  }
);
```

Never manually construct Authorization headers - always use
`oauthSession.makeRequest()`.

## AT Protocol Integration

### Record Types

**Checkin record** (`app.dropanchor.checkin`):

```typescript
{
  $type: "app.dropanchor.checkin",
  text: string,
  createdAt: string,  // ISO8601
  addressRef: StrongRef,  // Reference to address record
  coordinates: { latitude: number, longitude: number },
  category?: string,
  categoryGroup?: string,
  categoryIcon?: string
}
```

**Address record** (`community.lexicon.location.address`):

```typescript
{
  $type: "community.lexicon.location.address",
  name?: string,
  street?: string,
  locality?: string,
  region?: string,
  country?: string,
  postalCode?: string
}
```

### StrongRef Pattern

Checkins reference addresses via StrongRefs (CID + URI):

```typescript
addressRef: {
  uri: "at://did:plc:abc123/community.lexicon.location.address/3k2...",
  cid: "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm"
}
```

This ensures data integrity via content-addressing.

## API Endpoints

### Checkin Lifecycle (REST-style)

```
POST   /api/checkins                    Create checkin
GET    /api/checkins/:did                Get all checkins for user
GET    /api/checkins/:did/:rkey          Get specific checkin
DELETE /api/checkins/:did/:rkey          Delete checkin
```

### Feed Queries

```
GET /api/nearby?lat=52.0&lng=4.3&radius=5&limit=50     Spatial query
GET /api/user?did=did:plc:abc123&limit=50              User's checkins
GET /api/following?user=did:plc:abc123&limit=50        Following feed
```

### OAuth & Auth

```
GET  /login                         Initiate OAuth (web)
GET  /oauth/callback                OAuth redirect handler
POST /api/checkins                  Create checkin (requires auth)
GET  /api/auth/session              Session validation
POST /api/auth/logout               Session cleanup
```

### System

```
GET /api/stats                      System health metrics
GET /api/places/nearby              OpenStreetMap POI search via Overpass
GET /api/places/categories          Category system for mobile apps
```

## Testing Strategy

The project has comprehensive test coverage with two categories:

**Unit tests** (`tests/unit/`):

- Test individual functions in isolation
- Mock external dependencies (AT Protocol, Overpass API, OAuth)
- Focus on business logic correctness

**Integration tests** (`tests/integration/`):

- Test full request/response cycles
- Mock Val Town services (sqlite, blob storage) but test real code paths
- Validate API contract and error handling

Key testing patterns:

- Use `assertAlmostEquals` for floating-point coordinate calculations
- Mock OAuth sessions for authenticated endpoint tests
- Test both success and error cases
- Validate TypeScript types with proper inference

## Common Development Tasks

### Adding a New API Endpoint

1. Add route to `main.tsx`:

```typescript
app.get("/api/newfeature", async (c) => {
  return await anchorApiHandler(c.req.raw);
});
```

2. Handle in `backend/api/anchor-api.ts` or create new handler file

3. Add integration test in `tests/integration/api.test.ts`

### Modifying OAuth Configuration

OAuth is configured in `backend/routes/oauth.ts`:

```typescript
const oauth = createATProtoOAuth({
  baseUrl: BASE_URL, // Public base URL
  cookieSecret: COOKIE_SECRET, // Session encryption
  mobileScheme: "anchor-app://auth-callback",
  sessionTtl: 60 * 60 * 24 * 30, // 30 days
  storage, // Drizzle storage adapter
});
```

Never modify the package's internal logic - all customization via config.

### Working with AT Protocol Records

Always use OAuth sessions for PDS requests:

```typescript
// ✅ CORRECT - automatic token refresh and DPoP
const oauthSession = await sessions.getOAuthSession(did);
const response = await oauthSession.makeRequest(
  "POST",
  `${oauthSession.pdsUrl}/xrpc/com.atproto.repo.createRecord`,
  { headers: {...}, body: JSON.stringify({...}) }
);

// ❌ WRONG - manual token handling breaks DPoP and refresh logic
const response = await fetch(`${pdsUrl}/xrpc/...`, {
  headers: { "Authorization": `Bearer ${accessToken}` }
});
```

## Mobile Integration (iOS)

The system supports iOS app integration via WebView OAuth flow:

### Authentication Flow

1. iOS app opens WebView to
   `https://dropanchor.app/login?handle=user.bsky.social`
2. User completes OAuth in WebView
3. Success page triggers `anchor-app://auth-callback` with session data
4. iOS app extracts session and closes WebView

### Session Data Format

```
anchor-app://auth-callback?
  access_token=...
  &refresh_token=...
  &did=...
  &handle=...
  &session_id=...
  &pds_url=...
  &avatar=...
  &display_name=...
```

### iOS Requirements

- Register `anchor-app` URL scheme in Info.plist
- Set WebView User-Agent to "AnchorApp" for detection
- Use Bearer token authentication: `Authorization: Bearer {session_id}`
- Store tokens securely in iOS Keychain

## Debugging

### OAuth Session Issues

```bash
# Run debug script to inspect OAuth sessions
deno run --allow-net scripts/debug-oauth-sessions.ts
```

Or check via API endpoint:

```
GET https://dropanchor.app/api/debug/oauth-sessions
```

### PDS Communication

All PDS requests go through OAuth session's `makeRequest()`. Enable logging:

```typescript
console.log("PDS request:", {
  method,
  url,
  pdsUrl: oauthSession.pdsUrl,
  did: oauthSession.did,
});
```

### Val Town Deployment Issues

If deployment fails:

1. Check Val Town CLI is authenticated: `vt whoami`
2. Verify deno.json tasks work locally: `deno task quality`
3. Check Val Town dashboard for runtime errors
4. Verify environment variables are set correctly

## Important Technical Constraints

### Data Storage Philosophy

**DO NOT create local database tables for checkin data.** The PDS-only
architecture is intentional:

- Checkins live in users' PDS (decentralized, user-controlled)
- AppView reads on-demand (no sync lag, no stale data)
- Only OAuth sessions stored locally (for authentication)

If you need to cache data, use Val Town blob storage with TTL, not SQLite.

### AT Protocol Compliance

Always follow AT Protocol patterns:

- Use `com.atproto.repo.*` XRPC methods for record operations
- Respect StrongRef pattern for references between records
- Include proper `$type` fields in all records
- Use ISO8601 timestamps with `Z` suffix

### Security

- No API keys or secrets in code - only `Deno.env.get()`
- OAuth sessions are encrypted with Iron Session
- Mobile sessions use sealed tokens (not raw JWTs)
- CORS headers on all public API endpoints

## Project History & Context

Originally designed as a traditional AppView with background ingestion and local
database caching. Now migrated to **PDS-only architecture** where:

- No background crawlers or ingestion workers
- No local checkin tables (`checkins_v1`, `address_cache_v1`, etc. removed)
- Direct PDS reads provide fresh data with user control

Comments and variable names may reference old architecture - these are safe to
update.
