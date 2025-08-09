# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is the **Anchor AppView** - a location-based social feed generator for the
Anchor app, built on the AT Protocol (Bluesky) infrastructure. The system
ingests check-in data from the decentralized AT Protocol network and provides
spatial and social feeds for location-based social interactions.

## Architecture

The system consists of three main components:

1. **Jetstream WebSocket Poller** - Filters and ingests `app.dropanchor.checkin`
   records from the AT Protocol network
2. **Val Town AppView** - Handles address resolution, data storage, and API
   serving
3. **Anchor Client APIs** - Provides feeds for global, nearby, user-specific,
   and following-based check-ins

### Key Technologies

- **AT Protocol** - Decentralized social networking protocol (Bluesky ecosystem)
- **Val Town** - Serverless platform for deployment
- **SQLite** - Database for check-ins, addresses, and social graph data
- **Jetstream** - Real-time AT Protocol firehose for data ingestion
- **Haversine distance** - Spatial calculations for nearby check-ins

## Database Schema

The system uses four main tables:

- `checkins_v1` - Main check-ins with coordinates and cached address data
- `address_cache_v1` - Cached venue/address information (currently unused -
  location data is embedded in check-ins)
- `user_follows_v1` - Social graph data for following-based feeds
- `processing_log_v1` - Monitoring and operational logging

## Development Commands

### Deno Tasks

The project includes several Deno tasks for common development workflows:

- `deno task quality` - Run formatter, linter, and all tests in sequence
- `deno task quality:fix` - Same as quality but auto-fixes linting issues
- `deno task fmt` - Format code using deno fmt
- `deno task lint` - Run linter to check code quality
- `deno task check` - TypeScript type checking for all source files
- `deno task test` - Run all tests
- `deno task test:unit` - Run unit tests only
- `deno task test:integration` - Run integration tests only
- `deno task test:watch` - Run tests in watch mode
- `deno task deploy` - Deploy to Val Town using deploy script
- `deno task debug` - Run debug script to check data and API status

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

- `/global` - Recent check-ins from all users with pagination
- `/nearby` - Spatial queries for check-ins within specified radius
- `/user` - User-specific check-ins
- `/following` - Check-ins from followed users (requires social graph sync)
- `/stats` - AppView health and statistics

## Implementation Phases

The project is structured in phases:

1. **Phase 1**: Core infrastructure and basic ingestion
2. **Phase 2**: Address resolution and caching
3. **Phase 3**: Global feed APIs and spatial queries
4. **Phase 4**: Social features and following feeds

## Val Town Deployment

Components deploy as separate Val Town functions:

- `jetstreamPoller` - Cron job for data ingestion (5-minute intervals)
- `anchorAPI` - HTTP function for client queries
- `socialGraphSync` - Daily cron for follow relationship sync

## Val Town Development Guidelines

### Code Standards

- Use TypeScript for all Val Town functions
- Never hardcode secrets - always use environment variables with
  `Deno.env.get('keyname')`
- Import SQLite using
  `import { sqlite } from "https://esm.town/v/stevekrouse/sqlite"`
- Import blob storage using `import { blob } from "https://esm.town/v/std/blob"`
- Use `https://esm.sh` for external dependencies
- All functions must be properly typed with TypeScript interfaces

### SQLite Best Practices

- When changing table schema, increment table name (e.g., `checkins_v1` →
  `checkins_v2`)
- Always create tables before querying with `IF NOT EXISTS`
- Use proper indexing for coordinate-based spatial queries
- Initialize tables on every function execution for robustness

### Val Town Triggers

- **Cron Functions**: Export default async function with no parameters
- **HTTP Functions**: Export default async function with `(req: Request)`
  parameter
- **WebSocket**: Use standard WebSocket API for Jetstream connections

### Error Handling

- Let errors bubble up with full context rather than catching and logging
- Use comprehensive error tracking in processing logs
- Include timeout handling for WebSocket connections

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

The system is designed to scale within Val Town's resource limits while
maintaining full AT Protocol compatibility for decentralized social networking.
