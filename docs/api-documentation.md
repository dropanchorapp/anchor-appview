# Anchor AppView API Documentation

The Anchor AppView provides a RESTful API for accessing location-based social
check-ins from the AT Protocol network.

## Base URL

```
https://anchor-feed-generator.val.run
```

## Authentication

No authentication required. All endpoints are public.

## Response Format

All responses are JSON with proper CORS headers enabled.

### Success Response

```json
{
  "checkins": [...],
  "cursor": "2025-07-04T10:00:00Z"
}
```

### Error Response

```json
{
  "error": "Description of the error"
}
```

## Rate Limits

- 1000 requests per hour per IP
- Rate limit headers included in all responses

## Endpoints

### 1. Global Feed

Get recent check-ins from all users with pagination support.

**Endpoint:** `GET /global`

**Parameters:**

- `limit` (optional): Number of check-ins to return (default: 50, max: 100)
- `cursor` (optional): ISO timestamp for pagination

**Example Request:**

```bash
curl "https://anchor-feed-generator.val.run/global?limit=10&cursor=2025-07-04T10:00:00Z"
```

**Example Response:**

```json
{
  "checkins": [
    {
      "id": "record123",
      "uri": "at://did:plc:example123/app.dropanchor.checkin/record123",
      "author": {
        "did": "did:plc:example123",
        "handle": "alice.bsky.social"
      },
      "text": "Amazing coffee and cozy atmosphere!",
      "createdAt": "2025-07-04T10:15:00Z",
      "coordinates": {
        "latitude": 52.3676,
        "longitude": 4.9041
      },
      "address": {
        "name": "Cafe Central",
        "street": "Damrak 123",
        "locality": "Amsterdam",
        "region": "North Holland",
        "country": "Netherlands",
        "postalCode": "1012 LP"
      }
    }
  ],
  "cursor": "2025-07-04T10:15:00Z"
}
```

### 2. Nearby Check-ins

Get check-ins within a specified radius of coordinates using spatial queries.

**Endpoint:** `GET /nearby`

**Required Parameters:**

- `lat`: Latitude (decimal degrees)
- `lng`: Longitude (decimal degrees)

**Optional Parameters:**

- `radius`: Search radius in kilometers (default: 5, max: 50)
- `limit`: Number of results (default: 50, max: 100)

**Example Request:**

```bash
curl "https://anchor-feed-generator.val.run/nearby?lat=52.3676&lng=4.9041&radius=10&limit=20"
```

**Example Response:**

```json
{
  "checkins": [
    {
      "id": "record123",
      "uri": "at://did:plc:example123/app.dropanchor.checkin/record123",
      "author": {
        "did": "did:plc:example123",
        "handle": "alice.bsky.social"
      },
      "text": "Great spot for lunch!",
      "createdAt": "2025-07-04T10:15:00Z",
      "coordinates": {
        "latitude": 52.3700,
        "longitude": 4.9000
      },
      "address": {
        "name": "Restaurant Brown",
        "street": "Herengracht 456",
        "locality": "Amsterdam",
        "region": "North Holland",
        "country": "Netherlands",
        "postalCode": "1017 CA"
      },
      "distance": 2.34
    }
  ],
  "center": {
    "latitude": 52.3676,
    "longitude": 4.9041
  },
  "radius": 10
}
```

**Notes:**

- Results are sorted by distance (closest first)
- Distance is calculated using the Haversine formula
- `distance` field is included in nearby results (in kilometers)

### 3. User Check-ins

Get all check-ins from a specific user.

**Endpoint:** `GET /user`

**Required Parameters:**

- `did`: User's decentralized identifier

**Optional Parameters:**

- `limit`: Number of results (default: 50, max: 100)
- `cursor`: ISO timestamp for pagination

**Example Request:**

```bash
curl "https://anchor-feed-generator.val.run/user?did=did:plc:example123&limit=10"
```

**Example Response:**

```json
{
  "checkins": [
    {
      "id": "record123",
      "uri": "at://did:plc:example123/app.dropanchor.checkin/record123",
      "author": {
        "did": "did:plc:example123",
        "handle": "alice.bsky.social"
      },
      "text": "Love this place!",
      "createdAt": "2025-07-04T10:15:00Z",
      "coordinates": {
        "latitude": 52.3676,
        "longitude": 4.9041
      },
      "address": {
        "name": "Cafe Central",
        "street": "Damrak 123",
        "locality": "Amsterdam",
        "region": "North Holland",
        "country": "Netherlands",
        "postalCode": "1012 LP"
      }
    }
  ],
  "user": {
    "did": "did:plc:example123"
  }
}
```

### 4. Following Feed

Get check-ins from users that the specified user follows on Bluesky.

**Endpoint:** `GET /following`

**Required Parameters:**

- `user`: User's DID to get following feed for

**Optional Parameters:**

- `limit`: Number of results (default: 50, max: 100)
- `cursor`: ISO timestamp for pagination

**Example Request:**

```bash
curl "https://anchor-feed-generator.val.run/following?user=did:plc:example123&limit=10"
```

**Example Response:**

```json
{
  "checkins": [
    {
      "id": "record456",
      "uri": "at://did:plc:friend789/app.dropanchor.checkin/record456",
      "author": {
        "did": "did:plc:friend789",
        "handle": "bob.bsky.social"
      },
      "text": "Best pizza in town!",
      "createdAt": "2025-07-04T10:30:00Z",
      "coordinates": {
        "latitude": 52.3600,
        "longitude": 4.8800
      },
      "address": {
        "name": "Pizza Palace",
        "street": "Prinsengracht 789",
        "locality": "Amsterdam",
        "region": "North Holland",
        "country": "Netherlands",
        "postalCode": "1016 HT"
      }
    }
  ],
  "user": {
    "did": "did:plc:example123"
  },
  "cursor": "2025-07-04T10:30:00Z"
}
```

**Note:** Social graph data is synced daily from Bluesky. If no follows are
found, returns an empty array.

### 5. Statistics

Get AppView health metrics and processing statistics.

**Endpoint:** `GET /stats`

**Parameters:** None

**Example Request:**

```bash
curl "https://anchor-feed-generator.val.run/stats"
```

**Example Response:**

```json
{
  "totalCheckins": 1247,
  "totalUsers": 89,
  "recentActivity": 23,
  "lastProcessingRun": "2025-07-04T10:00:00Z",
  "timestamp": "2025-07-04T10:45:00Z"
}
```

**Fields:**

- `totalCheckins`: Total number of check-ins in the database
- `totalUsers`: Number of unique users who have checked in
- `recentActivity`: Check-ins in the last 24 hours
- `lastProcessingRun`: Timestamp of last successful data ingestion
- `timestamp`: Current server timestamp

## Data Model

### Checkin Object

```typescript
interface Checkin {
  id: string; // Unique record identifier
  uri: string; // Full AT Protocol URI
  author: {
    did: string; // User's decentralized identifier
    handle: string; // User's Bluesky handle
  };
  text: string; // Check-in message/review
  createdAt: string; // ISO timestamp
  coordinates?: { // Optional location coordinates
    latitude: number;
    longitude: number;
  };
  address?: { // Optional resolved venue information
    name?: string; // Venue name
    street?: string; // Street address
    locality?: string; // City
    region?: string; // State/Province
    country?: string; // Country
    postalCode?: string; // Postal/ZIP code
  };
  distance?: number; // Distance in km (only in nearby results)
}
```

## Error Codes

| Status Code | Description                                 |
| ----------- | ------------------------------------------- |
| 200         | Success                                     |
| 400         | Bad Request - Missing or invalid parameters |
| 404         | Not Found - Invalid endpoint                |
| 429         | Too Many Requests - Rate limit exceeded     |
| 500         | Internal Server Error                       |

## Common Error Examples

### Missing Required Parameters

```json
{
  "error": "lat and lng parameters required"
}
```

### Invalid Coordinates

```json
{
  "error": "Invalid latitude or longitude"
}
```

### Rate Limit Exceeded

```json
{
  "error": "Rate limit exceeded. Try again later."
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
class AnchorAPI {
  private baseURL = "https://anchor-feed-generator.val.run";

  async getGlobalFeed(limit = 50, cursor?: string) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...(cursor && { cursor }),
    });

    const response = await fetch(`${this.baseURL}/global?${params}`);
    return response.json();
  }

  async getNearbyCheckins(lat: number, lng: number, radius = 5, limit = 50) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
      limit: limit.toString(),
    });

    const response = await fetch(`${this.baseURL}/nearby?${params}`);
    return response.json();
  }

  async getUserCheckins(did: string, limit = 50, cursor?: string) {
    const params = new URLSearchParams({
      did,
      limit: limit.toString(),
      ...(cursor && { cursor }),
    });

    const response = await fetch(`${this.baseURL}/user?${params}`);
    return response.json();
  }

  async getFollowingFeed(userDid: string, limit = 50, cursor?: string) {
    const params = new URLSearchParams({
      user: userDid,
      limit: limit.toString(),
      ...(cursor && { cursor }),
    });

    const response = await fetch(`${this.baseURL}/following?${params}`);
    return response.json();
  }

  async getStats() {
    const response = await fetch(`${this.baseURL}/stats`);
    return response.json();
  }
}
```

### Swift (iOS)

```swift
import Foundation

class AnchorAPI {
    private let baseURL = "https://anchor-feed-generator.val.run"
    
    func getGlobalFeed(limit: Int = 50, cursor: String? = nil) async throws -> GlobalFeedResponse {
        var components = URLComponents(string: "\(baseURL)/global")!
        components.queryItems = [
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let cursor = cursor {
            components.queryItems?.append(URLQueryItem(name: "cursor", value: cursor))
        }
        
        let (data, _) = try await URLSession.shared.data(from: components.url!)
        return try JSONDecoder().decode(GlobalFeedResponse.self, from: data)
    }
    
    func getNearbyCheckins(lat: Double, lng: Double, radius: Double = 5, limit: Int = 50) async throws -> NearbyResponse {
        var components = URLComponents(string: "\(baseURL)/nearby")!
        components.queryItems = [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lng", value: String(lng)),
            URLQueryItem(name: "radius", value: String(radius)),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        
        let (data, _) = try await URLSession.shared.data(from: components.url!)
        return try JSONDecoder().decode(NearbyResponse.self, from: data)
    }
}
```

## Best Practices

### Performance

- Use pagination with cursors for large datasets
- Cache responses when appropriate
- Use reasonable limits (avoid requesting more than needed)

### Spatial Queries

- Keep radius reasonable (< 50km) for good performance
- Consider user's location accuracy when setting radius
- Sort by distance when displaying nearby results

### Social Features

- Check if social graph data is available before using /following
- Handle empty following lists gracefully
- Consider falling back to /global when following feed is empty

### Error Handling

- Always check for error responses
- Implement retry logic for temporary failures
- Handle rate limits appropriately

## Support

For API support and feature requests, please visit:

- GitHub:
  [Anchor AppView Issues](https://github.com/your-org/anchor-appview/issues)
- AT Protocol Documentation: [atproto.com](https://atproto.com)

## Changelog

### v1.0.0 (2025-07-04)

- Initial API release
- Global, nearby, user, and following feeds
- Statistics endpoint
- Spatial queries with Haversine distance
- AT Protocol integration
