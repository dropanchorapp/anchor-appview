// Test fixtures for Anchor AppView tests

export const mockCheckins = [
  {
    id: "checkin1",
    uri: "at://did:plc:user1/app.dropanchor.checkin/checkin1",
    author_did: "did:plc:user1",
    author_handle: "alice.bsky.social",
    text: "Amazing coffee at this local spot! ☕️",
    created_at: "2024-07-04T10:30:00Z",
    latitude: 40.7128,
    longitude: -74.0060,
    address_ref_uri:
      "at://did:plc:venues/community.lexicon.location.address/cafe-joe",
    address_ref_cid: "bafyreic7...",
    cached_address_name: "Joe's Coffee Shop",
    cached_address_street: "123 Broadway",
    cached_address_locality: "New York",
    cached_address_region: "NY",
    cached_address_country: "US",
    cached_address_postal_code: "10001",
  },
  {
    id: "checkin2",
    uri: "at://did:plc:user2/app.dropanchor.checkin/checkin2",
    author_did: "did:plc:user2",
    author_handle: "bob.bsky.social",
    text: "Great lunch spot with outdoor seating 🌞",
    created_at: "2024-07-04T12:15:00Z",
    latitude: 40.7589,
    longitude: -73.9851,
    address_ref_uri:
      "at://did:plc:venues/community.lexicon.location.address/times-square-cafe",
    address_ref_cid: "bafyreie8...",
    cached_address_name: "Times Square Cafe",
    cached_address_street: "1500 Broadway",
    cached_address_locality: "New York",
    cached_address_region: "NY",
    cached_address_country: "US",
    cached_address_postal_code: "10036",
  },
  {
    id: "checkin3",
    uri: "at://did:plc:user3/app.dropanchor.checkin/checkin3",
    author_did: "did:plc:user3",
    author_handle: "charlie.bsky.social",
    text: "Perfect spot for remote work 💻",
    created_at: "2024-07-04T14:45:00Z",
    latitude: 37.7749,
    longitude: -122.4194,
    address_ref_uri: null,
    address_ref_cid: null,
    cached_address_name: null,
    cached_address_street: null,
    cached_address_locality: "San Francisco",
    cached_address_region: "CA",
    cached_address_country: "US",
    cached_address_postal_code: "94102",
  },
];

export const mockAddresses = [
  {
    uri: "at://did:plc:venues/community.lexicon.location.address/cafe-joe",
    cid: "bafyreic7...",
    name: "Joe's Coffee Shop",
    street: "123 Broadway",
    locality: "New York",
    region: "NY",
    country: "US",
    postal_code: "10001",
    latitude: 40.7128,
    longitude: -74.0060,
    full_data: {
      name: "Joe's Coffee Shop",
      street: "123 Broadway",
      locality: "New York",
      region: "NY",
      country: "US",
      postalCode: "10001",
      latitude: 40.7128,
      longitude: -74.0060,
      hours: {
        monday: "7:00-19:00",
        tuesday: "7:00-19:00",
      },
      amenities: ["wifi", "outdoor_seating", "accepts_cards"],
    },
    resolved_at: "2024-07-04T09:00:00Z",
  },
  {
    uri:
      "at://did:plc:venues/community.lexicon.location.address/times-square-cafe",
    cid: "bafyreie8...",
    name: "Times Square Cafe",
    street: "1500 Broadway",
    locality: "New York",
    region: "NY",
    country: "US",
    postal_code: "10036",
    latitude: 40.7589,
    longitude: -73.9851,
    full_data: {
      name: "Times Square Cafe",
      street: "1500 Broadway",
      locality: "New York",
      region: "NY",
      country: "US",
      postalCode: "10036",
      latitude: 40.7589,
      longitude: -73.9851,
      hours: {
        monday: "6:00-22:00",
        tuesday: "6:00-22:00",
      },
      amenities: ["wifi", "outdoor_seating", "delivery"],
    },
    resolved_at: "2024-07-04T11:30:00Z",
  },
];

export const mockUsers = [
  {
    did: "did:plc:user1",
    handle: "alice.bsky.social",
    displayName: "Alice Johnson",
    avatar: "https://example.com/avatar1.jpg",
  },
  {
    did: "did:plc:user2",
    handle: "bob.bsky.social",
    displayName: "Bob Smith",
    avatar: "https://example.com/avatar2.jpg",
  },
  {
    did: "did:plc:user3",
    handle: "charlie.bsky.social",
    displayName: "Charlie Brown",
    avatar: "https://example.com/avatar3.jpg",
  },
];

export const mockFollows = [
  {
    follower_did: "did:plc:user1",
    following_did: "did:plc:user2",
    created_at: "2024-06-01T10:00:00Z",
    synced_at: "2024-07-04T08:00:00Z",
  },
  {
    follower_did: "did:plc:user1",
    following_did: "did:plc:user3",
    created_at: "2024-06-15T14:30:00Z",
    synced_at: "2024-07-04T08:00:00Z",
  },
  {
    follower_did: "did:plc:user2",
    following_did: "did:plc:user1",
    created_at: "2024-06-02T09:15:00Z",
    synced_at: "2024-07-04T08:00:00Z",
  },
];

export const mockJetstreamEvents = [
  {
    kind: "commit",
    commit: {
      repo: "did:plc:user1",
      collection: "app.dropanchor.checkin",
      operation: "create",
      rkey: "checkin1",
      record: {
        text: "Amazing coffee at this local spot! ☕️",
        createdAt: "2024-07-04T10:30:00Z",
        coordinates: {
          latitude: "40.7128",
          longitude: "-74.0060",
        },
        addressRef: {
          uri:
            "at://did:plc:venues/community.lexicon.location.address/cafe-joe",
          cid: "bafyreic7...",
        },
      },
    },
  },
  {
    kind: "commit",
    commit: {
      repo: "did:plc:user2",
      collection: "app.dropanchor.checkin",
      operation: "create",
      rkey: "checkin2",
      record: {
        text: "Great lunch spot with outdoor seating 🌞",
        createdAt: "2024-07-04T12:15:00Z",
        coordinates: {
          latitude: "40.7589",
          longitude: "-73.9851",
        },
        addressRef: {
          uri:
            "at://did:plc:venues/community.lexicon.location.address/times-square-cafe",
          cid: "bafyreie8...",
        },
      },
    },
  },
];

export const mockProcessingLogs = [
  {
    id: 1,
    run_at: "2024-07-04T10:00:00Z",
    events_processed: 5,
    errors: 0,
    duration_ms: 1250,
  },
  {
    id: 2,
    run_at: "2024-07-04T10:05:00Z",
    events_processed: 3,
    errors: 1,
    duration_ms: 2100,
  },
  {
    id: 3,
    run_at: "2024-07-04T10:10:00Z",
    events_processed: 7,
    errors: 0,
    duration_ms: 980,
  },
];

// Coordinate pairs for testing spatial queries
export const testCoordinates = {
  newYork: { lat: 40.7128, lng: -74.0060 },
  sanFrancisco: { lat: 37.7749, lng: -122.4194 },
  london: { lat: 51.5074, lng: -0.1278 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  sydney: { lat: -33.8688, lng: 151.2093 },
};

// Helper function to create formatted checkin records
export function formatTestCheckin(rawCheckin: typeof mockCheckins[0]) {
  return {
    id: rawCheckin.id,
    uri: rawCheckin.uri,
    author: {
      did: rawCheckin.author_did,
      handle: rawCheckin.author_handle,
    },
    text: rawCheckin.text,
    createdAt: rawCheckin.created_at,
    coordinates: rawCheckin.latitude && rawCheckin.longitude
      ? {
        latitude: rawCheckin.latitude,
        longitude: rawCheckin.longitude,
      }
      : undefined,
    address: rawCheckin.cached_address_name
      ? {
        name: rawCheckin.cached_address_name,
        street: rawCheckin.cached_address_street,
        locality: rawCheckin.cached_address_locality,
        region: rawCheckin.cached_address_region,
        country: rawCheckin.cached_address_country,
        postalCode: rawCheckin.cached_address_postal_code,
      }
      : undefined,
  };
}
