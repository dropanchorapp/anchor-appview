# Anchor AppView API Documentation

The Anchor AppView provides a RESTful API for accessing location-based social
check-ins from the AT Protocol network.

## Base URL

```
https://dropanchor.app/api
```

**Note:** All API endpoints are now under the `/api/` namespace to separate them
from frontend routes.

## Authentication

**Read Endpoints**: No authentication required (public feeds)

**Write Endpoints**: Require OAuth authentication via:

- **Web**: Secure cookies (Iron Session)
- **Mobile**: Bearer token in `Authorization` header

See [Creating Check-ins](#7-create-check-in) for authenticated endpoint details.

## Response Format

All responses are JSON with proper CORS headers enabled.

### Success Response

```json
{
  "checkins": [...],
  "cursor": "2025-07-04T10:00:00Z"
}
```

### Check-in Object

Each check-in in the response includes full profile information and optional
image:

```json
{
  "id": "3lbmo5gsjgv2f",
  "uri": "at://did:plc:wxex3wx5k4ctciupsv5m5stb/app.dropanchor.checkin/3lbmo5gsjgv2f",
  "author": {
    "did": "did:plc:wxex3wx5k4ctciupsv5m5stb",
    "handle": "tijs.social",
    "displayName": "Tijs",
    "avatar": "https://cdn.bsky.app/img/avatar/..."
  },
  "text": "Great coffee here!",
  "createdAt": "2025-07-04T10:00:00Z",
  "coordinates": {
    "latitude": 37.7749,
    "longitude": -122.4194
  },
  "address": {
    "name": "Blue Bottle Coffee",
    "street": "1 Ferry Building",
    "locality": "San Francisco",
    "region": "CA",
    "country": "US",
    "postalCode": "94111"
  },
  "image": {
    "thumbUrl": "https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=...&cid=bafyrei...",
    "fullsizeUrl": "https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=...&cid=bafyrei...",
    "alt": "Latte art at Blue Bottle"
  }
}
```

**Note**: The `image` field is optional and only present when a check-in has an
attached photo.

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

### 1. Nearby Check-ins

Get check-ins within a specified radius of coordinates using spatial queries.

**Endpoint:** `GET /api/nearby`

**Required Parameters:**

- `lat`: Latitude (decimal degrees)
- `lng`: Longitude (decimal degrees)

**Optional Parameters:**

- `radius`: Search radius in kilometers (default: 5, max: 50)
- `limit`: Number of results (default: 50, max: 100)

**Example Request:**

```bash
curl "https://dropanchor.app/api/nearby?lat=52.3676&lng=4.9041&radius=10&limit=20"
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

**Endpoint:** `GET /api/user`

**Required Parameters:**

- `did`: User's decentralized identifier

**Optional Parameters:**

- `limit`: Number of results (default: 50, max: 100)
- `cursor`: ISO timestamp for pagination

**Example Request:**

```bash
curl "https://dropanchor.app/api/user?did=did:plc:example123&limit=10"
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

**Endpoint:** `GET /api/following`

**Required Parameters:**

- `user`: User's DID to get following feed for

**Optional Parameters:**

- `limit`: Number of results (default: 50, max: 100)
- `cursor`: ISO timestamp for pagination

**Example Request:**

```bash
curl "https://dropanchor.app/api/following?user=did:plc:example123&limit=10"
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

### 5. Place Discovery

Search for nearby places using OpenStreetMap data via the Overpass API. This
endpoint enables location-based place discovery for check-ins.

**Endpoint:** `GET /api/places/nearby`

**Required Parameters:**

- `lat`: Latitude coordinate (-90 to 90)
- `lng`: Longitude coordinate (-180 to 180)

**Optional Parameters:**

- `radius`: Search radius in meters (default: 300, max: 2000)
- `categories`: Comma-separated list of OSM categories (e.g.,
  "amenity=cafe,amenity=restaurant")

**Example Request:**

```bash
curl "https://dropanchor.app/api/places/nearby?lat=37.7749&lng=-122.4194&radius=500&categories=amenity%3Dcafe,amenity%3Drestaurant"
```

**Example Response:**

```json
{
  "places": [
    {
      "id": "node:2895323815",
      "elementType": "node",
      "elementId": 2895323815,
      "name": "Blue Bottle Coffee",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "address": {
        "$type": "community.lexicon.location.address",
        "name": "Blue Bottle Coffee",
        "street": "315 Linden St",
        "locality": "San Francisco",
        "region": "CA",
        "country": "US",
        "postalCode": "94102"
      },
      "category": "cafe",
      "categoryGroup": "food_and_drink",
      "icon": "☕",
      "distanceMeters": 45.8,
      "formattedDistance": "46m",
      "tags": {
        "amenity": "cafe",
        "name": "Blue Bottle Coffee",
        "addr:street": "Linden St",
        "addr:housenumber": "315",
        "addr:city": "San Francisco",
        "addr:state": "CA",
        "addr:country": "US",
        "addr:postcode": "94102"
      }
    }
  ],
  "totalCount": 23,
  "searchRadius": 500,
  "categories": ["amenity=cafe", "amenity=restaurant"],
  "searchCoordinate": {
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

**Place Categories:**

Common category filters include:

- **Food & Drink:** `amenity=restaurant`, `amenity=cafe`, `amenity=bar`,
  `shop=supermarket`
- **Entertainment:** `amenity=cinema`, `tourism=attraction`, `leisure=park`
- **Sports:** `leisure=fitness_centre`, `leisure=climbing`,
  `leisure=swimming_pool`
- **Shopping:** `shop=clothes`, `shop=electronics`, `shop=books`
- **Accommodation:** `tourism=hotel`, `tourism=hostel`
- **Transportation:** `amenity=bus_station`, `amenity=fuel`

**Notes:**

- Results include complete address information extracted from OpenStreetMap data
- Places are sorted by distance (closest first)
- Address data follows the AT Protocol `community.lexicon.location.address`
  format
- Results are cached for 5 minutes per location to improve performance
- Uses Overpass API for real-time OpenStreetMap data

### 6. Statistics

Get AppView health metrics.

**Endpoint:** `GET /api/stats`

**Parameters:** None

**Example Request:**

```bash
curl "https://dropanchor.app/api/stats"
```

**Example Response:**

```json
{
  "activeUsers": 89,
  "timestamp": "2025-07-04T10:45:00Z"
}
```

**Fields:**

- `activeUsers`: Number of users with active OAuth sessions
- `timestamp`: Current server timestamp

**Note**: Statistics reflect active OAuth sessions, not total check-ins (which
are stored in users' PDS servers).

### 7. Create Check-in

Create a new check-in with optional image attachment.

**Endpoint:** `POST /api/checkins`

**Authentication Required**: Yes (OAuth via cookie or Bearer token)

**Content-Type**:

- `application/json` (without image)
- `multipart/form-data` (with image)

**Request Body (JSON)**:

```json
{
  "place": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "name": "Blue Bottle Coffee",
    "address": {
      "$type": "community.lexicon.location.address",
      "name": "Blue Bottle Coffee",
      "street": "1 Ferry Building",
      "locality": "San Francisco",
      "region": "CA",
      "country": "US",
      "postalCode": "94111"
    }
  },
  "message": "Great coffee here!"
}
```

**Request Body (FormData with image)**:

```typescript
const formData = new FormData();
formData.append(
  "place",
  JSON.stringify({
    latitude: 37.7749,
    longitude: -122.4194,
    name: "Blue Bottle Coffee",
    address: {/* ... */},
  }),
);
formData.append("message", "Great coffee here!");
formData.append("image", imageFile); // File object (JPEG, PNG, WebP, GIF)
formData.append("imageAlt", "Latte art at Blue Bottle");
```

**Image Requirements**:

- **Formats**: JPEG, PNG, WebP, GIF
- **Max Size**: 10MB (hard limit), <5MB recommended
- **Validation**: Magic number detection (security)
- **Privacy**: EXIF data stripped (including GPS)
- **Processing**: Creates thumbnail (300KB max) and fullsize (2MB max) versions

**Example Request (cURL with image)**:

```bash
curl -X POST "https://dropanchor.app/api/checkins" \
  -H "Authorization: Bearer YOUR_SESSION_ID" \
  -F "place={\"latitude\":37.7749,\"longitude\":-122.4194,\"name\":\"Blue Bottle Coffee\"}" \
  -F "message=Great coffee here!" \
  -F "image=@photo.jpg" \
  -F "imageAlt=Latte art at Blue Bottle"
```

**Example Request (Swift/iOS)**:

```swift
var request = URLRequest(url: URL(string: "https://dropanchor.app/api/checkins")!)
request.httpMethod = "POST"
request.setValue("Bearer \(sessionId)", forHTTPHeaderField: "Authorization")

let boundary = UUID().uuidString
request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

var body = Data()
// Add place JSON
body.append("--\(boundary)\r\n".data(using: .utf8)!)
body.append("Content-Disposition: form-data; name=\"place\"\r\n\r\n".data(using: .utf8)!)
body.append(placeJSON.data(using: .utf8)!)

// Add image
body.append("\r\n--\(boundary)\r\n".data(using: .utf8)!)
body.append("Content-Disposition: form-data; name=\"image\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
body.append(imageData)

body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
request.httpBody = body

let (data, _) = try await URLSession.shared.data(for: request)
```

**Success Response** (201 Created):

```json
{
  "success": true,
  "checkin": {
    "id": "3lbmo5gsjgv2f",
    "uri": "at://did:plc:wxex3wx5k4ctciupsv5m5stb/app.dropanchor.checkin/3lbmo5gsjgv2f",
    "author": {
      "did": "did:plc:wxex3wx5k4ctciupsv5m5stb",
      "handle": "tijs.social"
    },
    "text": "Great coffee here!",
    "createdAt": "2025-07-04T10:00:00Z",
    "image": {
      "thumbUrl": "https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=...&cid=...",
      "fullsizeUrl": "https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=...&cid=...",
      "alt": "Latte art at Blue Bottle"
    }
  }
}
```

**Error Response** (400 Bad Request):

```json
{
  "error": "Image too large (max 10MB)"
}
```

**Possible Errors**:

- `401 Unauthorized`: Missing or invalid authentication
- `400 Bad Request`: Invalid image format, size exceeded, or missing required
  fields
- `500 Internal Server Error`: Failed to upload to PDS or create record

### 8. Delete Check-in

Delete a check-in (only the author can delete their own check-ins).

**Endpoint:** `DELETE /api/checkins/:did/:rkey`

**Authentication Required**: Yes (must be the check-in author)

**Example Request**:

```bash
curl -X DELETE "https://dropanchor.app/api/checkins/did:plc:wxex3wx5k4ctciupsv5m5stb/3lbmo5gsjgv2f" \
  -H "Authorization: Bearer YOUR_SESSION_ID"
```

**Success Response** (200 OK):

```json
{
  "success": true
}
```

**Error Responses**:

- `401 Unauthorized`: Not authenticated or not the author
- `404 Not Found`: Check-in doesn't exist
- `500 Internal Server Error`: Failed to delete from PDS

## Data Model

### Checkin Object

```typescript
interface Checkin {
  id: string; // Unique record identifier (rkey)
  uri: string; // Full AT Protocol URI
  author: {
    did: string; // User's decentralized identifier
    handle: string; // User's Bluesky handle
    displayName?: string; // User's display name
    avatar?: string; // User's avatar URL
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
  image?: { // Optional image attachment
    thumbUrl: string; // Thumbnail URL (300KB max)
    fullsizeUrl: string; // Full-size URL (2MB max)
    alt?: string; // Alt text description
  };
  distance?: number; // Distance in km (only in nearby results)
}
```

## Error Codes

| Status Code | Description                                 |
| ----------- | ------------------------------------------- |
| 200         | Success                                     |
| 201         | Created - Check-in successfully created     |
| 400         | Bad Request - Missing or invalid parameters |
| 401         | Unauthorized - Authentication required      |
| 404         | Not Found - Resource doesn't exist          |
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
  private baseURL = "https://dropanchor.app/api";

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

  async getNearbyPlaces(
    lat: number,
    lng: number,
    radius = 300,
    categories?: string[],
  ) {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
      ...(categories && { categories: categories.join(",") }),
    });

    const response = await fetch(`${this.baseURL}/places/nearby?${params}`);
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
    private let baseURL = "https://dropanchor.app/api"

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
- Consider showing nearby checkins when following feed is empty

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

### v1.1.0 (2025-10-03)

- **Image Support**: Optional image attachments for check-ins
  - Thumbnail and fullsize versions
  - Privacy-first: EXIF data stripped including GPS
  - Magic number validation for security
  - Support for JPEG, PNG, WebP, GIF
- **Delete Endpoint**: Users can delete their own check-ins
- **OAuth Authentication**: Secure authentication for write operations
- **PDS-Only Architecture**: All check-in data stored in users' PDS

### v1.0.0 (2025-07-04)

- Initial API release
- Nearby, user, and following feeds
- Statistics endpoint
- Spatial queries with Haversine distance
- AT Protocol integration
