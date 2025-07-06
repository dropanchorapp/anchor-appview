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
- `address_cache_v1` - Resolved venue/address information from AT Protocol
  strongrefs
- `user_follows_v1` - Social graph data for following-based feeds
- `processing_log_v1` - Monitoring and operational logging

## Development Commands

### Testing

- `./scripts/test.sh` - Run complete test suite (unit + integration)
- `deno test --allow-all` - Run all tests directly
- Test files use comprehensive mocking for Val Town services (sqlite, blob
  storage)

### Deployment

- `./scripts/deploy.sh` - One-click deployment to Val Town using CLI
- `vt create cron|http <name> --file <path>` - Deploy individual functions
- Requires Val Town CLI: `npm install -g @valtown/cli`

### API Testing

- `./scripts/test-api.sh` - Manual API endpoint testing script

## Key Features

- **Real-time ingestion** via WebSocket polling every 5 minutes
- **Address resolution** using AT Protocol strongrefs to resolve venue records
- **Spatial queries** for nearby check-ins using coordinate-based distance
  calculations
- **Social feeds** leveraging Bluesky's social graph for personalized content
- **Duplicate detection** to prevent reprocessing of check-in events

## API Endpoints

**Base URL**: `https://anchor-feed-generator.val.run`

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

- **Strongref Resolution**: Address references use AT Protocol strongrefs that
  must be resolved to actual venue records
- **Social Graph Integration**: Following feeds require syncing follow
  relationships from Bluesky's public API
- **Spatial Indexing**: Performance depends on proper SQLite indexing for
  coordinate-based queries
- **Rate Limiting**: Social graph sync includes rate limiting to respect API
  constraints
- **Error Handling**: Comprehensive error tracking for monitoring ingestion
  health
- **Address Caching**: Uses Val Town blob storage for efficient address
  resolution caching with 30-day expiry
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
