# Anchor AppView

> **Anchor is closing down.** Read the announcement on Bluesky: [dropanchor.app/post/3mj3beavwhs2c](https://bsky.app/profile/dropanchor.app/post/3mj3beavwhs2c)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/tijsteulings)

A personal location journal built on the AT Protocol. Log your visits and
check-ins to your own Personal Data Server (PDS), with optional sharing on
Bluesky. Provides both API endpoints for mobile clients and a web interface for
viewing your location history.

## 🏗️ Architecture

**PDS-Only Architecture**: This system does NOT store checkin data locally. All
checkins are:

- Created directly in users' PDS via AT Protocol `com.atproto.repo.createRecord`
- Read on-demand from PDS via `com.atproto.repo.getRecord` and
  `com.atproto.repo.listRecords`
- Never cached or persisted in local database (only OAuth sessions stored
  locally)

The system consists of 4 main components:

- **Check-in Creation** - Direct writes to user PDS with optional image
  attachments
- **API** - RESTful APIs for nearby, user, and following feeds (reads from PDS)
- **Web Interface** - React-based web frontend for viewing feeds and shareable
  checkin detail pages with image lightbox
- **OAuth** - Secure authentication with automatic token refresh and DPoP
  handling

## 📁 Project Structure

```
backend/
├── oauth/             # OAuth authentication and session management
│   └── storage.ts         # Drizzle storage adapter for OAuth sessions
├── routes/            # Hono route handlers
│   └── oauth.ts          # OAuth configuration and endpoints
├── api/               # HTTP API endpoints
│   ├── anchor-api.ts      # Main feed API (reads from PDS)
│   └── checkins.ts        # Check-in creation API with image upload
├── services/          # Business logic services
│   ├── image-service.ts   # Image validation (magic numbers) and processing
│   └── overpass-service.ts # Address enrichment via OpenStreetMap
└── database/          # Database layer (OAuth sessions only)
    ├── db.ts             # Drizzle ORM setup with sqlite-proxy
    ├── schema.ts         # Database schema (iron_session_storage)
    └── migrations.ts     # Table creation and migrations

frontend/
├── main.tsx           # Entry point and routing
├── components/        # React components
│   ├── CheckinComposer.tsx # Create checkin with image picker
│   ├── CheckinCard.tsx     # Feed card with square thumbnail
│   ├── CheckinDetail.tsx   # Detail view with full-size image and map
│   ├── ImageLightbox.tsx   # Full-screen image viewer with alt text
│   └── Layout.tsx          # App layout and navigation
└── types/
    └── index.ts       # TypeScript type definitions

lexicons/              # AT Protocol lexicon definitions
└── app/dropanchor/
    └── checkin.json       # Checkin record schema with embedded address, geo, image

docs/
├── api-documentation.md # Complete API reference for client development
└── deployment-guide.md  # Deployment instructions

scripts/
├── test.sh               # Run complete test suite
├── debug-oauth-sessions.ts # Debug OAuth session status
└── publish-lexicons.ts   # Publish lexicons to PDS as AT Protocol records

tests/
├── unit/              # Unit tests for individual functions
│   ├── image-service.test.ts    # Image validation with magic numbers
│   ├── lexicon-validation.test.ts # Lexicon structure validation
│   └── spatial.test.ts
├── integration/       # Integration tests for API endpoints
│   ├── api.test.ts              # Feed APIs
│   └── checkin-api.test.ts      # Checkin creation with image upload
└── fixtures/          # Test data and fixtures
    └── test-data.ts
```

## 🚀 Quick Start

### Deployment

Anchor deploys automatically to Deno Deploy when changes are pushed to `main`.

```bash
git push origin main          # Triggers automatic deploy
```

> **Note**: No manual database setup required! Tables are created automatically
> on startup.

## 🔌 API Endpoints

**Base URL**: `https://dropanchor.app`

### Feed APIs

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

#### Feed Interface

```
https://dropanchor.app/
```

Web interface showing user feeds and check-ins.

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

### Authentication

For developers integrating with Anchor's authentication system:

**[🔐 Authentication Guide](docs/authentication.md)** - Anchor-specific setup
guide:

- Quick configuration example
- Anchor-specific settings (URL scheme, session TTL)
- Authenticated endpoint examples
- Links to complete OAuth documentation

**[📱 Mobile OAuth Guide](https://jsr.io/@tijs/atproto-oauth/doc/docs/MOBILE_OAUTH)** -
Complete OAuth implementation (in package docs):

- API endpoint contracts with request/response schemas
- OAuth flow sequence diagrams
- Session validation and token refresh
- Security considerations and best practices
- iOS Swift and Android Kotlin examples

## 📊 Data Architecture

**PDS-Only Design**: No local checkin storage. All checkin data lives in users'
Personal Data Servers.

**Local Storage**: Only `iron_session_storage` table for OAuth session
management (encrypted with Iron Session).

**AT Protocol Records**:

- `app.dropanchor.checkin` - Checkin with embedded address, geo coordinates, and
  optional image attachment. All location data is self-contained within the
  checkin record.

**Image Storage**: Blobs uploaded to user's PDS via
`com.atproto.repo.uploadBlob`, retrieved via `com.atproto.sync.getBlob`.

## 🌟 Key Features

### Backend Features

- **PDS-First Architecture**: All checkin data stored in users' PDS
  (decentralized, user-controlled)
- **OAuth Authentication**: Secure authentication with automatic token refresh
  and DPoP handling via `@tijs/atproto-oauth`
- **Image Attachments**: Optional image uploads with:
  - Security validation via magic number detection (not just MIME types)
  - Client-side compression to <5MB target (server enforces <10MB hard limit)
  - Privacy-first: EXIF data stripped including GPS coordinates
  - EXIF orientation handling for correct photo display
  - Thumbnail (300KB) and fullsize (2MB) versions
  - Support for JPEG, PNG, WebP, GIF formats
- **Address Enrichment**: OpenStreetMap integration via Overpass API
- **Spatial Queries**: Nearby check-ins using Haversine distance calculations
- **Mobile-Ready APIs**: FormData multipart uploads, Bearer token authentication

### Web Interface Features

- **Feed Views**: Browse feeds with author profiles, timestamps, and square
  thumbnails
- **Image Composer**: Image picker with client-side compression and alt text
  support
- **Image Lightbox**: Full-screen image viewer with alt text display
  (Bluesky-style)
- **Shareable Checkin Pages**: Individual checkin detail pages with interactive
  maps and full-size images
- **Interactive Maps**: OpenStreetMap integration via Leaflet with CartoDB tiles
- **Optional Sharing**: Share individual check-ins via Web Share API or copy
  link
- **Responsive Design**: Mobile-friendly interface using system fonts
- **Open Graph Tags**: Rich social media previews for shared checkin URLs
- **Delete Support**: Users can delete their own check-ins

## 🔧 Development

### Testing

The project includes comprehensive tests for all components (142 tests):

**Unit Tests**:

- `image-service.test.ts` - Image validation with magic number detection
- `lexicon-validation.test.ts` - Lexicon structure and backward compatibility
- `spatial.test.ts` - Spatial distance calculations

**Integration Tests**:

- `checkin-api.test.ts` - Checkin creation with image upload (multipart form
  data)
- `api.test.ts` - Feed APIs and PDS integration

```bash
# Run all tests
deno task test
# or
./scripts/test.sh

# Run specific test suites
deno task test:unit         # Unit tests only
deno task test:integration  # Integration tests only

# Watch mode for TDD
deno task test:watch

# Quality checks (format, lint, type check, test)
deno task quality
```

### Development Practices

- Use TypeScript for all code
- Use `https://esm.sh` for npm packages, `jsr:` for JSR packages
- Never hardcode secrets - use `Deno.env.get('keyname')`
- Let errors bubble up with full context rather than catching and logging

### Data Storage Strategy

- **PDS-First**: All checkin data lives in users' Personal Data Servers
- **SQLite**: Only OAuth session storage (`iron_session_storage`)
- **AT Protocol**: `com.atproto.repo.createRecord` for writes,
  `com.atproto.repo.getRecord`/`listRecords` for reads
- **Image Blobs**: Uploaded to user's PDS via `uploadBlob`, served via `getBlob`

## 📈 Monitoring

- Monitor `/api/stats` endpoint for system health
- Use `scripts/debug-oauth-sessions.ts` to inspect OAuth session status
- Check Deno Deploy dashboard for runtime errors and logs
- Check environment variables are set correctly

## 🔒 Security

- **OAuth Security**: Iron Session encryption, DPoP tokens, automatic token
  refresh
- **Image Security**: Magic number validation (not just MIME types), 10MB hard
  limit
- **Privacy**: EXIF data stripped from all images (including GPS coordinates)
- **CORS**: Proper CORS headers on all API endpoints
- **Authentication**: Bearer tokens (mobile) or secure cookies (web)
- **No Secrets in Code**: All credentials via `Deno.env.get()`

## 🌐 AT Protocol Integration

The AppView is fully compatible with the AT Protocol ecosystem:

- **Lexicon Definition**: `app.dropanchor.checkin` with embedded address and geo
  objects
- **PDS Integration**: Direct reads/writes to user PDS (no local caching)
- **OAuth Client**: Uses `@tijs/atproto-oauth` with PKCE flow and DPoP
- **DID Resolution**: PLC directory and personal PDS servers
- **Embedded Objects**: Address and geo data stored directly in the checkin
  record (no separate records or StrongRefs)
- **Blob Storage**: Images stored as AT Protocol blobs in user's PDS

### Lexicon Publishing

Lexicons are published as `com.atproto.lexicon.schema` records following the
official AT Protocol spec:

| Lexicon                  | AT-URI                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `app.dropanchor.checkin` | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.checkin` |
| `app.dropanchor.like`    | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.like`    |
| `app.dropanchor.comment` | `at://did:plc:aq7owa5y7ndc2hzjz37wy7ma/com.atproto.lexicon.schema/app.dropanchor.comment` |

Resolution chain: `app.dropanchor.*` → DNS TXT `_lexicon.dropanchor.app` →
`did:plc:aq7owa5y7ndc2hzjz37wy7ma` → PDS (hamster.farm) → schema records.

See `docs/lexicon-publishing.md` for details on updating lexicons.

## 🖼️ Static Assets

Static images are hosted on Bunny CDN at `cdn.dropanchor.app`:

- `https://cdn.dropanchor.app/images/anchor-logo.png` - App logo
- `https://cdn.dropanchor.app/images/seagull-looking.png` - Empty state
- `https://cdn.dropanchor.app/images/seagull-chest.png` - Login prompt

## ☕ Support Development

If you find this project useful and would like to support its development, you
can [buy me a coffee on Ko-fi](https://ko-fi.com/tijsteulings).

## 📄 License

This implementation is part of the Anchor project — a personal location journal
built on the AT Protocol.
