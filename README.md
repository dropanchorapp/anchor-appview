# Anchor AppView

A complete location-based social feed generator built on the AT Protocol for
decentralized social networking.

## 🏗️ Architecture

The system consists of 3 main components:

- **Ingestion** - Real-time check-in data ingestion from AT Protocol Jetstream
- **API** - Feed APIs for global, nearby, user, and following feeds
- **Social** - Social graph sync from Bluesky for following feeds

## 📁 Project Structure

```
src/
├── ingestion/          # Data ingestion from AT Protocol
│   └── jetstream-poller.ts
├── api/               # HTTP API endpoints
│   └── anchor-api.ts
├── social/            # Social graph management
│   └── social-graph-sync.ts
└── utils/             # Shared utilities
    ├── handle-resolver.ts
    ├── address-resolver.ts
    ├── address-cache.ts    # Val Town blob storage cache
    ├── profile-resolver.ts # Profile caching and resolution
    └── profile-refresh-job.ts # Background profile refresh

database/
├── database-schema.sql # SQLite schema and indexes
└── add-profile-cache.sql # Profile cache migration

docs/
├── api-documentation.md # Complete API reference for client development
└── deployment-guide.md  # Deployment instructions

scripts/
├── deploy.sh          # One-click deployment script
├── test.sh            # Run complete test suite
├── debug.ts           # Debug data availability and API status
└── monitor-api.sh     # Monitor deployed API status

tests/
├── unit/              # Unit tests for individual functions
│   ├── handle-resolver.test.ts
│   ├── profile-resolver.test.ts  # Profile caching and resolution
│   ├── address-cache.test.ts
│   ├── database.test.ts
│   └── spatial.test.ts
├── integration/       # Integration tests for API endpoints
│   ├── api.test.ts
│   └── api-profiles.test.ts      # API endpoints with profile data
└── fixtures/          # Test data and fixtures
    └── test-data.ts
```

## 🚀 Quick Start

### Option 1: One-Click Deployment

```bash
# Install Val Town CLI
npm install -g @valtown/cli

# Login to Val Town
vt login

# Run tests first
./scripts/test.sh

# Deploy all functions
./scripts/deploy.sh

# Monitor the deployment
./scripts/monitor-api.sh
```

### Option 2: Manual Deployment

```bash
# Deploy individual functions
vt create cron jetstreamPoller --file src/ingestion/jetstream-poller.ts --schedule "*/5 * * * *"
vt create http anchorAPI --file src/api/anchor-api.ts
vt create cron socialGraphSync --file src/social/social-graph-sync.ts --schedule "0 2 * * *"
```

> **Note**: No manual database setup required! Tables are created automatically
> when functions first run.

## 🔌 API Endpoints

**Base URL**: `https://anchor-feed-generator.val.run`

### Global Feed

```http
GET https://anchor-feed-generator.val.run/global?limit=50&cursor=2025-06-29T15:00:00Z
```

Recent check-ins from all users with pagination.

### Nearby Checkins

```http
GET https://anchor-feed-generator.val.run/nearby?lat=52.0705&lng=4.3007&radius=5&limit=50
```

Spatial query for check-ins within specified radius (km).

### User Checkins

```http
GET https://anchor-feed-generator.val.run/user?did=did:plc:abc123&limit=50
```

All check-ins from a specific user.

### Following Feed

```http
GET https://anchor-feed-generator.val.run/following?user=did:plc:abc123&limit=50&cursor=2025-06-29T15:00:00Z
```

Check-ins from people the specified user follows on Bluesky.

### Statistics

```http
GET https://anchor-feed-generator.val.run/stats
```

AppView health metrics and processing statistics.

## 📚 API Documentation

For complete API documentation including examples, data models, and SDK code
samples, see:

**[📖 API Documentation](docs/api-documentation.md)**

## 📊 Database Schema

The system uses 5 main SQLite tables:

- `checkins_v1` - Main check-ins with coordinates and cached address data
- `address_cache_v1` - Resolved venue/address information from strongrefs
- `profile_cache_v1` - Cached user profile data (display names, avatars)
- `user_follows_v1` - Social graph data for following-based feeds
- `processing_log_v1` - Monitoring and operational logging

## 🌟 Key Features

- **Real-time Ingestion**: WebSocket polling every 5 minutes from Jetstream
- **Address Resolution**: Automatic strongref resolution with caching
- **Profile Resolution**: Automatic profile data fetching and caching
- **Spatial Queries**: Nearby check-ins using Haversine distance calculations
- **Social Integration**: Following feeds leveraging Bluesky's social graph
- **Performance**: SQLite with proper indexing for fast queries
- **Error Handling**: Comprehensive error tracking and retry logic

## 🔧 Development

### Testing

The project includes comprehensive tests for all components:

**Unit Tests**:
- `profile-resolver.test.ts` - Profile caching, resolution, and refresh logic
- `handle-resolver.test.ts` - Handle resolution from DIDs
- `address-cache.test.ts` - Address caching and resolution
- `database.test.ts` - Database operations
- `spatial.test.ts` - Spatial calculations
- `jetstream-ingestion.test.ts` - Event ingestion

**Integration Tests**:
- `api-profiles.test.ts` - API endpoints with profile data included
- `api.test.ts` - Core API functionality

```bash
# Run all tests
./scripts/test.sh

# Run specific test suites
deno test --allow-all tests/unit/        # Unit tests only
deno test --allow-all tests/integration/ # Integration tests only

# Run tests in watch mode
./scripts/test.sh --watch

# Run with coverage
./scripts/test.sh --coverage
```

### Val Town Best Practices

- Use TypeScript for all functions
- Import SQLite:
  `import { sqlite } from "https://esm.town/v/stevekrouse/sqlite"`
- Import blob storage: `import { blob } from "https://esm.town/v/std/blob"`
- Use `https://esm.sh` for external dependencies
- Never hardcode secrets - use `Deno.env.get('keyname')`
- Let errors bubble up with full context rather than catching and logging

### Data Storage Strategy

- **SQLite**: Primary data (checkins, social graph, processing logs)
- **Blob Storage**: Caching layer for address resolution with automatic expiry
- **Schema Changes**: Increment table versions (e.g., `checkins_v1` →
  `checkins_v2`)
- Always create tables with `IF NOT EXISTS` on function startup

## 📈 Monitoring

- Monitor `/stats` endpoint for system health
- Check `processing_log_v1` for ingestion metrics
- Use built-in logging and debugging tools
- Monitor SQLite performance as data grows

## 🔒 Security

- All API endpoints include proper CORS headers
- Public APIs only - no authentication required
- Rate limiting built into external service calls
- No sensitive data logged or stored

## 🌐 AT Protocol Integration

The AppView is fully compatible with the AT Protocol ecosystem:

- Ingests from Jetstream (official AT Protocol firehose)
- Resolves DIDs using PLC directory
- Fetches records via `com.atproto.repo.getRecord`
- Integrates with Bluesky social graph APIs

## 📄 License

This implementation is part of the Anchor project for location-based social
networking on the AT Protocol.
