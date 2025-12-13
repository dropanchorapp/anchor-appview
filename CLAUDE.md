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

**Exception for Likes and Comments**: While checkins remain PDS-only, likes and
comments use a **hybrid architecture** with local indexing for performance:

- Like/comment records are stored in users' PDS (fully decentralized)
- A local index (`checkin_interactions` and `checkin_counts` tables) tracks
  interactions for efficient discovery and counting
- Index is updated when likes/comments are created/deleted through this AppView
- Trade-off: External likes/comments (created directly via PDS) won't appear
  until indexed
- Future: Background sync process could crawl for external interactions

Local database storage:

- `iron_session_storage`: OAuth session management
- `checkin_interactions`: Index of likes/comments for efficient queries
- `checkin_counts`: Aggregated counts per checkin for performance

### Entry Point

- **Main file**: `main.tsx` (deployed to Val Town with
  `// @val-town anchordashboard` comment)
- **Base URL**: `https://dropanchor.app` (configurable via `ANCHOR_BASE_URL`)
- **Framework**: Hono web server serving unified API, OAuth, and React frontend
- **Runtime**: Deno on Val Town platform

### Key Components

**OAuth Authentication** (`backend/routes/oauth.ts`, `backend/oauth/`):

- Uses custom package `jsr:@tijs/atproto-oauth@2.3.0`
- Provides web and mobile (iOS) authentication flows
- Mobile: Custom URL scheme `anchor-app://auth-callback`
- Session storage via Drizzle ORM with SQLite
- Automatic token refresh and DPoP handling built into OAuth sessions

**Checkin API** (`backend/api/checkins.ts`):

- Creates checkins via AT Protocol `createRecord` with immediate PDS writes
- Two-record pattern: address record + checkin record with StrongRef
- Optional image attachments uploaded as blobs to user's PDS
- Image validation via magic numbers, EXIF stripping for privacy
- Address enhancement via Overpass API (OpenStreetMap)
- Authentication via Bearer tokens (mobile) or cookies (web)
- Supports both JSON and multipart/form-data (for images)

**Feed API** (`backend/api/anchor-api.ts`):

- Reads checkins directly from users' PDS
- Spatial queries, user feeds, following feeds
- No local database reads for checkin data

**Likes and Comments API** (`backend/api/likes.ts`, `backend/api/comments.ts`):

- Creates likes/comments via AT Protocol `createRecord` in user's PDS
- Updates local index for efficient discovery
- Authentication via OAuth session with automatic token refresh
- Uses OAuth session's `makeRequest()` for all PDS communication
- REST endpoints: `/api/checkins/:did/:rkey/likes` and
  `/api/checkins/:did/:rkey/comments`

**Database Layer** (`backend/database/`):

- Drizzle ORM with `sqlite-proxy` adapter
- Schema: `backend/database/schema.ts` (OAuth sessions + interaction indexes)
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

Key environment variables (stored in `.env` locally, Val Town secrets in prod):

- `COOKIE_SECRET` - Iron Session encryption key
- `ANCHOR_BASE_URL` - Public URL (defaults to `https://dropanchor.app`)
- `HANDLE` - AT Protocol handle for lexicon publishing (e.g., `tijs.org`)
- `APP_PASSWORD` - App password for lexicon publishing
- `BUNNY_STORAGE_ZONE` - Bunny CDN storage zone name
- `BUNNY_STORAGE_KEY` - Bunny CDN API key
- `BUNNY_STORAGE_REGION` - Bunny CDN region (e.g., `storage.bunnycdn.com`)
- `BUNNY_CDN_URL` - CDN base URL (e.g., `https://cdn.dropanchor.app`)

### External Dependencies

- Use `https://esm.sh` for npm packages
- Use `jsr:` for JSR packages (Hono, atproto-oauth)
- Use `https://esm.town/v/std/` for Val Town utilities

## OAuth Authentication Flow

### Package: @tijs/atproto-oauth

The OAuth system uses a custom package that handles:

- PKCE flow with automatic PDS discovery
- DPoP (Demonstrating Proof of Possession) tokens
- Token refresh logic
- Mobile and web authentication modes
- Session storage via Drizzle adapter

### Usage Pattern

```typescript
import { createATProtoOAuth } from "jsr:@tijs/atproto-oauth@2.3.0";

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

**Like record** (`app.dropanchor.like`):

```typescript
{
  $type: "app.dropanchor.like",
  createdAt: string,  // ISO8601
  checkinRef: StrongRef  // Reference to the liked checkin
}
```

**Comment record** (`app.dropanchor.comment`):

```typescript
{
  $type: "app.dropanchor.comment",
  text: string,  // Max 1000 characters
  createdAt: string,  // ISO8601
  checkinRef: StrongRef  // Reference to the commented checkin
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

### Likes and Comments (REST-style)

```
GET    /api/checkins/:did/:rkey/likes       Get likes for checkin
POST   /api/checkins/:did/:rkey/likes       Like a checkin (requires auth)
DELETE /api/checkins/:did/:rkey/likes       Unlike a checkin (requires auth)

GET    /api/checkins/:did/:rkey/comments    Get comments for checkin
POST   /api/checkins/:did/:rkey/comments    Comment on checkin (requires auth)
DELETE /api/checkins/:did/:rkey/comments    Delete comment (requires auth)
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

## Infrastructure

### Lexicon Publishing

Lexicons are published as `com.atproto.lexicon.schema` records on hamster.farm
(tijs.org's PDS), following the official AT Protocol spec.

**Published lexicons**:

- `app.dropanchor.checkin`
- `app.dropanchor.like`
- `app.dropanchor.comment`

**Resolution chain**:

1. NSID `app.dropanchor.checkin`
2. Reverse domain → `dropanchor.app`
3. DNS TXT `_lexicon.dropanchor.app` → `did:plc:aq7owa5y7ndc2hzjz37wy7ma`
4. DID resolves to PDS `https://hamster.farm`
5. Fetch record from PDS

**Republishing lexicons** (after modifying `lexicons/` files):

```bash
source .env
deno run --allow-net --allow-read --allow-env scripts/publish-lexicons.ts
```

**Verification**:

```bash
~/go/bin/glot status lexicons/
dig TXT _lexicon.dropanchor.app +short
```

See `docs/lexicon-publishing.md` for full details.

### Static Assets (Bunny CDN)

Static images are hosted on Bunny CDN at `cdn.dropanchor.app`:

- `https://cdn.dropanchor.app/images/anchor-logo.png`
- `https://cdn.dropanchor.app/images/seagull-looking.png`
- `https://cdn.dropanchor.app/images/seagull-chest.png`

**Uploading new assets**:

```bash
source .env
curl -X PUT "https://${BUNNY_STORAGE_REGION}/${BUNNY_STORAGE_ZONE}/images/filename.png" \
  -H "AccessKey: ${BUNNY_STORAGE_KEY}" \
  -H "Content-Type: image/png" \
  --data-binary @/path/to/file.png
```

## Project History & Context

Originally designed as a traditional AppView with background ingestion and local
database caching. Now migrated to **PDS-only architecture** where:

- No background crawlers or ingestion workers
- No local checkin tables (`checkins_v1`, `address_cache_v1`, etc. removed)
- Direct PDS reads provide fresh data with user control

Comments and variable names may reference old architecture - these are safe to
update.

- to deploy new updates use `deno task deploy`
- code files should never be more than 500 lines, once you hit this size you
  know it's time to break up your file in smaller modules
