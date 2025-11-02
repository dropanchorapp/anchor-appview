// Shared TypeScript types for the frontend

export interface CheckinData {
  id: string;
  uri: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text: string;
  createdAt: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  address?: {
    name?: string;
    street?: string;
    locality?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  image?: {
    thumbUrl: string;
    fullsizeUrl: string;
    alt?: string;
  };
  distance?: number;
  likesCount?: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  userHandle?: string;
  userDid?: string;
  userAvatar?: string;
  userDisplayName?: string;
}

export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  tags: Record<string, string>;
  elementType?: "node" | "way" | "relation";
  elementId?: number;
  address?: {
    name?: string;
    street?: string;
    locality?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  category?: string;
  categoryGroup?: string;
  icon?: string;
}
