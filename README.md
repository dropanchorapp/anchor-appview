# Anchor AppView

A complete location-based social feed generator and web interface built on the
AT Protocol for decentralized social networking. Provides both API endpoints for
mobile clients and a web interface for viewing and sharing check-ins.

## 🏗️ Architecture

The system consists of 4 main components:

- **Check-in Creation** - Immediate database saves when check-ins are created
  via mobile app
- **API** - RESTful APIs for global, nearby, user, and following feeds
- **Web Interface** - React-based web frontend for viewing feeds and shareable
  checkin detail pages
- **Social** - Social graph sync from Bluesky for following feeds

## 📁 Project Structure

```
backend/
├── ingestion/          # Check-in processing logic
│   ├── record-processor.ts    # Processes check-in records for database storage
│   ├── followers-crawler.ts   # Social graph data collection
│   └── followers-processor.ts # Social relationship processing
├── api/               # HTTP API endpoints
│   ├── anchor-api.ts      # Main AppView API
│   └── checkins.ts        # Check-in creation with immediate saves
├── admin/             # Administrative tools and backfill operations
└── utils/             # Shared utilities
    ├── profile-resolver.ts # Profile caching and resolution
    └── storage-provider.ts # Database abstraction layer

frontend/
├── main.tsx           # React app entry point and routing
├── components/        # React components
│   ├── CheckinDetail.tsx  # Individual checkin detail view with map
│   ├── Feed.tsx          # Global feed component
│   └── Layout.tsx        # App layout and navigation
└── types/
    └── index.ts       # TypeScript type definitions

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

### Deployment

```bash
deno task deploy              # Runs quality checks and pushes to Val Town
```

> **Note**: No manual database setup required! Tables are created automatically
> when functions first run.

## 🔌 API Endpoints

**Base URL**: `https://dropanchor.app`

### Feed APIs

#### Global Feed

```http
GET https://dropanchor.app/api/global?limit=50&cursor=2025-06-29T15:00:00Z
```

Recent check-ins from all users with pagination.

#### Nearby Checkins

```http
GET https://dropanchor.app/api/nearby?lat=52.0705&lng=4.3007&radius=5&limit=50
```

Spatial query for check-ins within specified radius (km).

#### User Checkins

```http
GET https://dropanchor.app/api/user?did=did:plc:abc123&limit=50
```

All check-ins from a specific user.

#### Following Feed

```http
GET https://dropanchor.app/api/following?user=did:plc:abc123&limit=50&cursor=2025-06-29T15:00:00Z
```

Check-ins from people the specified user follows on Bluesky.

### Individual Checkin

#### Checkin Detail API

```http
GET https://dropanchor.app/api/checkin/{rkey}
```

Individual checkin data by record key for detail views and sharing.

### System APIs

#### Statistics

```http
GET https://dropanchor.app/api/stats
```

AppView health metrics and processing statistics.

## 🌐 Web Interface

### Public Web Pages

#### Global Feed

```
https://dropanchor.app/
```

Web interface showing the global feed of check-ins.

#### Shareable Checkin Details

```
https://dropanchor.app/checkin/{rkey}
```

Individual checkin detail page with interactive map, optimized for sharing on
social media with Open Graph meta tags.

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

### Backend Features

- **Immediate Updates**: Check-ins appear instantly in feeds when created via
  app
- **Address Resolution**: Automatic strongref resolution with caching
- **Profile Resolution**: Automatic profile data fetching and caching
- **Spatial Queries**: Nearby check-ins using Haversine distance calculations
- **Social Integration**: Following feeds leveraging Bluesky's social graph
- **Performance**: SQLite with proper indexing for fast queries
- **Optimized Architecture**: Direct database saves eliminating ingestion delays

### Web Interface Features

- **Global Feed View**: Browse all check-ins with author profiles and timestamps
- **Shareable Checkin Pages**: Individual checkin detail pages with interactive
  maps
- **Interactive Maps**: OpenStreetMap integration via Leaflet with CartoDB tiles
- **Social Sharing**: Optimized sharing with Web Share API and copy
  functionality
- **Responsive Design**: Mobile-friendly interface using system fonts
- **Open Graph Tags**: Rich social media previews for shared checkin URLs

## 🔧 Development

### Known Technical Debt

- **Share URL Collisions**: Currently using AT Protocol rkeys as unique
  identifiers in share URLs (`/checkin/{rkey}`). While collision risk is
  negligible at current scale (~32 simultaneous checkins per microsecond for 50%
  collision probability), rkeys only provide 10 bits of entropy and are not
  cryptographically guaranteed to be globally unique. Consider migrating to
  composite identifiers (DID+rkey) or backend-generated UUIDs if collision
  issues emerge at scale.

### Testing

The project includes comprehensive tests for all components:

**Unit Tests**:

- `profile-resolver.test.ts` - Profile caching, resolution, and refresh logic
- `handle-resolver.test.ts` - Handle resolution from DIDs
- `address-cache.test.ts` - Address caching and resolution
- `database.test.ts` - Database operations
- `spatial.test.ts` - Spatial calculations
- `record-processor.test.ts` - Check-in processing and immediate saves

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
- **Import SQLite**: `import { sqlite } from "https://esm.town/v/std/sqlite2"`
  - ⚠️ **IMPORTANT**: Always use `sqlite2`, not `sqlite` (deprecated)
  - Use object format: `await sqlite.execute({ sql: "...", args: [...] })`
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

- Creates records via `com.atproto.repo.createRecord` with immediate local saves
- Resolves DIDs using PLC directory and Slingshot resolver
- Supports personal PDS servers with automatic DID document resolution
- Integrates with Bluesky social graph APIs for following feeds

## 📄 License

This implementation is part of the Anchor project for location-based social
networking on the AT Protocol.
