# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is the **Anchor AppView** - a location-based social feed generator and
OAuth authentication system for the Anchor app, built on the AT Protocol
(Bluesky) infrastructure. The system ingests check-in data from the
decentralized AT Protocol network, provides spatial and social feeds, and
includes a complete OAuth WebView implementation for mobile app integration.

## Architecture

### Entry Point and Deployment

- **Main Entry**: `main.tsx` (Val Town HTTP function with
  `// @val-town anchordashboard` comment)
- **Base URL**: `https://dropanchor.app` (configurable via `ANCHOR_BASE_URL` env
  var)
- **Platform**: Single Hono-based web server deployed on Val Town using Deno
  runtime

### Core Components

1. **HTTP Server (main.tsx)** - Unified Hono server handling all routes:
   - OAuth authentication endpoints
   - AppView API endpoints (global, nearby, user, following feeds)
   - Mobile OAuth WebView pages
   - React frontend serving
   - Admin API endpoints

2. **OAuth Authentication System (`backend/oauth/`)** - Complete OAuth 2.0 +
   DPoP implementation:
   - PKCE flow with automatic handle resolution and PDS discovery
   - Mobile app detection for WebView integration
   - Custom URL scheme redirect: `anchor-app://auth-callback`
   - Session management with SQLite storage

3. **AppView Data Layer (`backend/api/anchor-api.ts`)** - AT Protocol compliant
   feed system:
   - Real-time ingestion from Jetstream
   - StrongRef address resolution and caching
   - Spatial queries using Haversine distance calculations
   - Social graph integration with Bluesky

4. **React Dashboard (`frontend/`)** - Web interface for authentication and feed
   management

### Key Technologies

- **AT Protocol** - Decentralized social networking with OAuth 2.0 + DPoP
  authentication
- **Val Town** - Serverless platform deployment with Deno runtime
- **SQLite** - Database for check-ins, addresses, social graph, and OAuth
  sessions
- **Jetstream** - Real-time AT Protocol firehose for data ingestion
- **Hono** - Lightweight web framework for unified API serving
- **React 18.2.0** - Frontend dashboard with TypeScript

## Database Schema

The system uses five main tables:

- `checkins_v1` - Main check-ins with coordinates and cached address data
- `address_cache_v1` - Cached venue/address information from StrongRef
  resolution
- `profile_cache_v1` - Cached user profile data (display names, avatars)
- `user_follows_v1` - Social graph data for following-based feeds
- `oauth_sessions` - OAuth session storage with DPoP keys and user profiles
- `processing_log_v1` - Monitoring and operational logging

## Development Commands

### Deno Tasks

The project includes several Deno tasks for common development workflows:

- `deno task quality` - Run formatter, linter, type checking, and all tests in
  sequence
- `deno task deploy` - Deploy to Val Town (runs quality checks first)
- `deno task fmt` - Format code using deno fmt
- `deno task lint` - Run linter to check code quality
- `deno task check` - TypeScript type checking for all source files
- `deno task test` - Run all tests with `--allow-all` permissions
- `deno task test:unit` - Run unit tests only
- `deno task test:integration` - Run integration tests only
- `deno task test:watch` - Run tests in watch mode for development

### Testing

- `./scripts/test.sh` - Run complete test suite (unit + integration)
- `deno test --allow-all` - Run all tests directly
- Test files use comprehensive mocking for Val Town services (sqlite, blob
  storage)

### Deployment

- `./scripts/deploy.sh` - One-click deployment to Val Town using CLI
- `vt create cron|http <name> --file <path>` - Deploy individual functions
- Requires Val Town CLI: `npm install -g @valtown/cli`

### Debugging

- `deno run --allow-net scripts/debug.ts` - Check data availability and API
  status
- `deno run --allow-net scripts/debug.ts --check-data` - Check AT Protocol
  records only
- `deno run --allow-net scripts/debug.ts --test-api` - Test API endpoints only

## Key Features

- **Real-time ingestion** via WebSocket polling every 5 minutes
- **Embedded location data** with coordinates and address details included in
  check-in records
- **Spatial queries** for nearby check-ins using coordinate-based distance
  calculations
- **Social feeds** leveraging Bluesky's social graph for personalized content
- **Duplicate detection** to prevent reprocessing of check-in events

## API Endpoints

**Base URL**: `https://dropanchor.app`

### AppView API

- `/api/global` - Recent check-ins from all users with pagination
- `/api/nearby` - Spatial queries for check-ins within specified radius
- `/api/user` - User-specific check-ins
- `/api/following` - Check-ins from followed users (requires social graph sync)
- `/api/stats` - AppView health and statistics
- `/api/places/nearby` - OpenStreetMap POI discovery via Overpass API
- `/api/places/categories` - Complete category system for mobile app consumption

#### Places Categories API Endpoint

The `/api/places/categories` endpoint provides comprehensive category data designed for mobile app consumption, enabling apps to cache and use the complete category system locally.

**Response Format:**
```json
{
  "categories": [
    {
      "id": "amenity_restaurant",
      "name": "Restaurant", 
      "icon": "🍽️",
      "group": "FOOD_AND_DRINK",
      "osmTag": "amenity=restaurant"
    }
    // ... 56 total categories
  ],
  "defaultSearch": [
    "amenity=restaurant",
    "amenity=cafe",
    // ... 37 categories optimized for default search queries
  ],
  "sociallyRelevant": [
    "amenity=restaurant", 
    "tourism=attraction",
    // ... 37 categories suitable for social check-ins
  ],
  "metadata": {
    "totalCategories": 56,
    "defaultSearchCount": 37,
    "sociallyRelevantCount": 37
  }
}
```

**Usage Notes:**
- **Categories**: Complete category objects with UI-ready data (names, icons, groups)
- **Default Search**: OSM tags for default Overpass API queries when user doesn't specify categories
- **Socially Relevant**: Categories appropriate for social check-in experiences
- **Metadata**: Category counts for validation and UI display
- **Mobile Integration**: Designed for caching in mobile apps to eliminate hardcoded category arrays

### OAuth Authentication API

- `/client-metadata.json` - OAuth client metadata endpoint
- `/api/auth/start` - Initiate OAuth flow (POST with handle)
- `/oauth/callback` - Complete OAuth token exchange
- `/api/auth/session` - Session validation for web and mobile (auto-extends
  session lifetime)
- `/api/auth/logout` - Session cleanup
- `/api/auth/validate-mobile-session` - Mobile token validation with automatic
  token refresh
- `/api/auth/refresh-mobile-token` - Explicit mobile token refresh endpoint

### Mobile OAuth WebView

- `/mobile-auth` - Mobile-optimized OAuth login page for WebView integration

### Frontend API (Dashboard)

- `/api/feed` - Dashboard feed data
- `/api/admin/stats` - Administrative statistics
- `/api/admin/backfill` - Manual data backfill operations
- `/api/admin/discover-checkins` - Comprehensive checkin discovery
- `/api/admin/backfill-profiles` - Profile data backfill
- `/api/admin/resolve-addresses` - Address resolution operations

## Mobile OAuth WebView Integration

The system includes a complete OAuth authentication flow designed for mobile app
WebView integration with extended session duration (30+ days):

### Mobile Authentication Flow

1. **iOS app loads WebView**: `https://dropanchor.app/mobile-auth`
2. **User completes OAuth**: Beautiful mobile-optimized login interface with
   auto-completion
3. **Mobile app detection**: Server detects WebView context via User-Agent and
   Referer headers
4. **Custom URL scheme redirect**: Success page triggers
   `anchor-app://auth-callback` with tokens
5. **iOS app handles callback**: Parse authentication data from URL parameters

### Mobile App Detection Logic

- User-Agent contains "AnchorApp"
- Referer from `/mobile-auth` endpoint
- iPhone Mobile user agents
- Automatically routes mobile vs web authentication flows

### Authentication Data Format

The mobile callback URL includes all necessary authentication data:

```
anchor-app://auth-callback?access_token=...&refresh_token=...&did=...&handle=...&session_id=...&avatar=...&display_name=...
```

### iOS Integration Requirements

- **URL Scheme Registration**: `anchor-app` in Info.plist
- **WebView Configuration**: Set User-Agent to "AnchorApp" for detection
- **Secure Storage**: Store tokens in iOS Keychain for production apps
- **Session Management**: Use session validation endpoints for token
  verification with automatic refresh

### Session Duration & Token Management

- **Extended Sessions**: Sessions now persist for 30+ days with automatic
  lifetime extension
- **Token Refresh**: Automatic token refresh when AT Protocol access tokens
  expire
- **Session Touching**: Session validation endpoints automatically extend
  session lifetime
- **Database Cleanup**: Sessions are only cleaned up after 90 days of inactivity
  (extended from 30 days)
- **Mobile Token Refresh**: Dedicated endpoint for mobile clients to explicitly
  refresh tokens

## Implementation Phases

The project is structured in phases:

1. **Phase 1**: Core infrastructure and basic ingestion
2. **Phase 2**: Address resolution and caching
3. **Phase 3**: Global feed APIs and spatial queries
4. **Phase 4**: Social features and following feeds

## Val Town Deployment

The system deploys as a single unified HTTP function on Val Town:

- **Main Function**: `anchordashboard` (main.tsx) - Unified Hono server handling
  all routes
- **Deployment Command**: `deno task deploy` - Runs quality checks and pushes to
  Val Town
- **Platform Integration**: Uses Val Town CLI (`vt push`) for deployment
- **Database Initialization**: Automatic SQLite table creation on startup

### Key Deployment Notes

- **Single Entry Point**: All functionality consolidated in main.tsx for
  simplified deployment
- **Static File Serving**: Frontend files served via Val Town utils with
  `serveFile`
- **Environment Variables**: Base URL configurable via `ANCHOR_BASE_URL`
- **Database Schema**: Version-based table naming for schema evolution

## Val Town Development Guidelines

### Code Standards

- Use TypeScript for all Val Town functions
- Never hardcode secrets - always use environment variables with
  `Deno.env.get('keyname')`
- **Import SQLite using**
  `import { sqlite } from "https://esm.town/v/std/sqlite2"`
  - ⚠️ **CRITICAL**: Use `sqlite2` not `sqlite` (the old path is deprecated)
  - Val Town updated their sqlite module - always use the `sqlite2` version
- Import blob storage using `import { blob } from "https://esm.town/v/std/blob"`
- Use `https://esm.sh` for external dependencies
- All functions must be properly typed with TypeScript interfaces

### SQLite Best Practices

- When changing table schema, increment table name (e.g., `checkins_v1` →
  `checkins_v2`)
- Always create tables before querying with `IF NOT EXISTS`
- Use proper indexing for coordinate-based spatial queries
- Initialize tables on every function execution for robustness

#### SQLite API Format (sqlite2)

The new sqlite2 API uses object format for queries:

```typescript
// CORRECT (sqlite2 format)
await sqlite.execute({
  sql: "SELECT * FROM users WHERE id = ?",
  args: [userId],
});

// INCORRECT (old format - will not work)
await sqlite.execute("SELECT * FROM users WHERE id = ?", [userId]);
```

#### Result Format Conversion

The sqlite2 API returns `{ columns, rows }` where rows are arrays. Use helper
function:

```typescript
// Helper function (already implemented in session.ts and storage-provider.ts)
function rowsToObjects(
  columns: string[],
  rows: any[][],
): Record<string, any>[] {
  return rows.map((row) => {
    const obj: Record<string, any> = {};
    columns.forEach((column, index) => {
      obj[column] = row[index];
    });
    return obj;
  });
}

// Usage
const result = await sqlite.execute({ sql: "SELECT * FROM users", args: [] });
const objects = rowsToObjects(result.columns, result.rows);
```

### Val Town Triggers

- **Cron Functions**: Export default async function with no parameters
- **HTTP Functions**: Export default async function with `(req: Request)`
  parameter
- **WebSocket**: Use standard WebSocket API for Jetstream connections

### Error Handling

- Let errors bubble up with full context rather than catching and logging
- Use comprehensive error tracking in processing logs
- Include timeout handling for WebSocket connections

### Troubleshooting Common Issues

#### SQLite Module Errors

If you encounter `Module not found` errors with SQLite:

1. **Check import path**: Must use `https://esm.town/v/std/sqlite2` (not
   `sqlite`)
2. **Update API calls**: Use object format `{ sql: "...", args: [...] }`
3. **Row format**: Results are arrays, use `rowsToObjects()` helper for objects
4. **Force refresh**: Add comment to trigger redeployment if cached

```typescript
// Common error patterns and fixes:

// ❌ WRONG - old import path
import { sqlite } from "https://esm.town/v/std/sqlite";

// ✅ CORRECT - new import path
import { sqlite } from "https://esm.town/v/std/sqlite2";

// ❌ WRONG - old API format
await sqlite.execute("SELECT * FROM users WHERE id = ?", [id]);

// ✅ CORRECT - new API format
await sqlite.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
```

## Important Implementation Details

- **StrongRef Address Resolution**: Check-in records contain `addressRef`
  StrongRefs that must be resolved to separate address records and cached

### Check-in Record Structure (Current Format)

#### AT Protocol Record Format (when queried directly)

```json
{
  "uri": "at://did:plc:example/app.dropanchor.checkin/abc123",
  "value": {
    "text": "Just testing my new check-in records",
    "$type": "app.dropanchor.checkin",
    "createdAt": "2025-07-06T15:03:15Z",
    "coordinates": {
      "$type": "community.lexicon.location.geo",
      "latitude": "52.080178",
      "longitude": "4.3578971"
    },
    "addressRef": {
      "uri": "at://did:plc:example/community.lexicon.location.address/venue123",
      "cid": "bafyreicv3pecq6fuua22xcoguxep76otivb33nlaofzl76fpagczo5t5jm"
    }
  }
}
```

#### Jetstream Event Format (real-time ingestion)

```json
{
  "did": "did:plc:wxex3wx5k4ctciupsv5m5stb",
  "time_us": 1751824706067182,
  "kind": "commit",
  "commit": {
    "rev": "3ltctwowylo26",
    "operation": "create",
    "collection": "app.dropanchor.checkin",
    "rkey": "3ltctwowntw26",
    "record": {
      "$type": "app.dropanchor.checkin",
      "addressRef": {
        "cid": "bafyreibhvynislx7vv52urqpm2vac6oeidvjb74m5pr3dmw3iztbengwbm",
        "uri": "at://did:plc:wxex3wx5k4ctciupsv5m5stb/community.lexicon.location.address/3ltctwolmqz2o"
      },
      "coordinates": {
        "$type": "community.lexicon.location.geo",
        "latitude": "52.0742969",
        "longitude": "4.3468013"
      },
      "createdAt": "2025-07-06T17:58:25Z",
      "text": "And one more which does include the social post as well."
    },
    "cid": "bafyreifdepudvenhqnz4rk4j4dvyaaompafnj6r5ixamalpqmjlei2p43y"
  }
}
```

**CRITICAL**: The DID is at the **top level** in Jetstream events (`event.did`),
not in `commit.repo`. This is essential for proper data extraction during
real-time ingestion.

### Jetstream Real-time Ingestion Process

1. **Connect to Jetstream** with cursor-based resumption (1-hour lookback)
2. **Filter events** for `kind: "commit"`,
   `collection: "app.dropanchor.checkin"`, `operation: "create"`
3. **Extract data** from Jetstream event structure:
   - Author DID: `event.did` (top-level field)
   - Record key: `event.commit.rkey`
   - Record data: `event.commit.record`
   - Timestamp: `event.time_us` (for cursor tracking)
4. **Duplicate detection** using `rkey` as primary key
5. **Store in database** with proper URI construction:
   `at://${event.did}/${collection}/${rkey}`

### Address Resolution Process

1. **Ingest check-in** with `coordinates` and `addressRef` StrongRef
2. **Store StrongRef** in `address_ref_uri` and `address_ref_cid` fields
3. **Resolve StrongRef** to separate address record using address resolver
4. **Cache address data** in `cached_address_*` fields for fast API responses
5. **Return complete objects** in API feeds with resolved address data

- **Social Graph Integration**: Following feeds require syncing follow
  relationships from Bluesky's public API
- **Spatial Indexing**: Performance depends on proper SQLite indexing for
  coordinate-based queries
- **Rate Limiting**: Social graph sync includes rate limiting to respect API
  constraints
- **Error Handling**: Comprehensive error tracking for monitoring ingestion
  health
- **Data Processing Pipeline**: Extracts coordinates from `coordinates` field
  and resolves `addressRef` StrongRefs to cache complete address data
- **Hybrid Storage**: SQLite for relational data, blob storage for key-value
  caching

## Testing Architecture

The project includes comprehensive testing:

- **Unit Tests**: Mock Val Town services (sqlite, blob) for isolated testing
- **Integration Tests**: Full API endpoint testing with realistic data flows
- **Spatial Tests**: Haversine distance calculations with edge case handling
- **Database Tests**: Schema validation and query testing with mock SQLite
- **Test Coverage**: 31 tests across 5 test files ensuring reliability

### Test Patterns

- Use `assertAlmostEquals` for floating-point spatial calculations
- Mock external services comprehensively but realistically
- Test error conditions and edge cases (coordinate validation, cache expiry)
- Validate TypeScript interfaces with proper type casting

## Mobile App Integration

### OAuth WebView Flow

The system provides complete OAuth authentication for the Anchor iOS app:

- **Mobile detection**: Automatically detects iOS WebView requests via
  User-Agent
- **PDS URL resolution**: Resolves user's actual PDS from DID document (supports
  personal PDS servers)
- **User registration**: Automatically registers authenticated users for PDS
  crawling
- **Custom URL scheme**: Returns auth data via `anchor-app://auth-callback` with
  all required parameters

### Critical OAuth Implementation Details

- **PDS URL parameter**: Backend includes resolved `pds_url` in mobile callback
  (line 486 in `endpoints.ts`)
- **Handle resolution**: Tries multiple resolution services before falling back
  to defaults
- **Session storage**: Stores complete OAuth session data including PDS
  endpoints in SQLite
- **Error handling**: Graceful handling of OAuth failures without breaking
  mobile app flow

### Mobile Callback URL Format

```
anchor-app://auth-callback?access_token=...&refresh_token=...&did=...&handle=...&session_id=...&pds_url=...&avatar=...&display_name=...
```

## Development Workflow with iOS App

### Common Development Pattern

1. Make changes to backend OAuth/API logic
2. Run `deno task quality` to verify all tests pass
3. Deploy with `deno task deploy`
4. Test iOS app integration with new backend
5. Verify OAuth flow works with personal PDS servers

### Troubleshooting OAuth Issues

- **Missing PDS URL**: Check if `pds_url` parameter is included in mobile
  redirect
- **Personal PDS failures**: Verify DID document resolution and PDS endpoint
  extraction
- **Session issues**: Check `oauth_sessions` table for proper session storage

## Date Format Compatibility

### API Response Format

The system returns ISO8601 timestamps in two formats:

- **With fractional seconds**: `"2025-08-11T18:34:55.966Z"` (real-time data)
- **Without fractional seconds**: `"2025-08-11T18:34:55Z"` (legacy/processed
  data)

### iOS App Compatibility

Ensure consistent date formatting for iOS client consumption:

- Backend stores timestamps with full precision when available
- API responses maintain original timestamp format from AT Protocol records
- iOS client handles both formats via flexible parsing utility

The system is designed to scale within Val Town's resource limits while
maintaining full AT Protocol compatibility for decentralized social networking.
