/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, {
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@19.1.0";
import { createPortal } from "https://esm.sh/react-dom@19.1.0?deps=react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState, CheckinData } from "../types/index.ts";
import { ImageLightbox } from "./ImageLightbox.tsx";
import { SIDEBAR_PORTAL_ID } from "./RightSidebar.tsx";
import { apiDelete, apiFetch } from "../utils/api.ts";
import { checkinCache } from "../utils/checkin-cache.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import { avatar, avatarFallback, flexCenter } from "../styles/components.ts";
import {
  breakpoints,
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface CheckinDetailProps {
  checkinId: string;
  auth?: AuthState;
}

interface MapWidgetProps {
  latitude: number;
  longitude: number;
  venueName?: string;
}

// ============ LOCAL STYLES ============

const loadingStyle = css`
  ${flexCenter} min-height: 200px;
  font-size: ${typography.sizes.lg};
  color: ${colors.textSecondary};
`;

const errorStyle = css`
  ${flexCenter} min-height: 200px;
  font-size: ${typography.sizes.lg};
  color: ${colors.error};
`;

const pageContainerStyle = css`
  font-family: ${typography.fontFamily};
  line-height: ${typography.lineHeights.normal};
  color: ${colors.text};
`;

const mainCardStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xxl};
  box-shadow: ${shadows.md};
  padding: ${spacing.xxl};
  margin-bottom: ${spacing.lg};
`;

const authorHeaderStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.lg};
  margin-bottom: ${spacing.lg};
`;

const authorInfoStyle = css`
  flex: 1;
`;

const displayNameStyle = css`
  font-weight: ${typography.weights.semibold};
  font-size: ${typography.sizes.xl};
  color: ${colors.text};
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
`;

const handleStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textSecondary};
`;

const timestampStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
  text-align: right;
`;

const checkinTextStyle = css`
  font-size: ${typography.sizes.xl};
  line-height: ${typography.lineHeights.normal};
  color: ${colors.text};
  margin-bottom: ${spacing.xl};
`;

const imageContainerStyle = css`
  margin-bottom: ${spacing.xl};
  border-radius: ${radii.lg};
  overflow: hidden;
  border: 1px solid ${colors.border};
  cursor: pointer;

  img {
    width: 100%;
    height: auto;
    display: block;
  }
`;

const locationSectionStyle = css`
  background: ${colors.surfaceHover};
  padding: ${spacing.lg};
  border-radius: ${radii.lg};
  border: 1px solid ${colors.borderLight};
`;

const locationHeaderStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  margin-bottom: ${spacing.sm};
`;

const locationLabelStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
`;

const venueNameStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.medium};
  color: ${colors.text};
  margin-bottom: ${spacing.xs};
`;

const addressTextStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
  line-height: ${typography.lineHeights.relaxed};
`;

const coordinatesStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  font-family: monospace;
  margin-top: ${spacing.sm};
  margin-bottom: ${spacing.md};
`;

const mapContainerStyle = css`
  width: 100%;
  height: 200px;
  border-radius: ${radii.lg};
  overflow: hidden;
  background: ${colors.surfaceActive};
`;

// Location section in main content - only visible on mobile
const mobileLocationSectionStyle = css`
  display: none;

  @media (max-width: ${breakpoints.lg}) {
    display: block;
  }
`;

// Sidebar location section styles
const sidebarLocationSectionStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.sm};
  overflow: hidden;
  margin-bottom: ${spacing.lg};
`;

const sidebarLocationDetailsStyle = css`
  padding: ${spacing.md};
`;

const sidebarVenueNameStyle = css`
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.xs};
  line-height: ${typography.lineHeights.tight};
`;

const sidebarAddressTextStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  line-height: ${typography.lineHeights.normal};
  margin-bottom: ${spacing.xs};
`;

const sidebarCoordinatesStyle = css`
  font-size: ${typography.sizes.xs};
  color: ${colors.textMuted};
  font-family: monospace;
`;

const sidebarMapContainerStyle = css`
  width: 100%;
  height: 160px;
  background: ${colors.surfaceActive};
`;

const likesSectionStyle = css`
  background: ${colors.surfaceHover};
  padding: ${spacing.lg};
  border-radius: ${radii.lg};
  border: 1px solid ${colors.borderLight};
  margin-top: ${spacing.lg};
`;

const likesRowStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
`;

const likeButtonStyle = css`
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  padding: ${spacing.sm};
  border-radius: ${radii.md};
  transition: all ${transitions.normal};

  &:hover:not(:disabled) {
    background: ${colors.surfaceActive};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const heartIconStyle = css`
  transition: all ${transitions.normal};

  &:hover {
    transform: scale(1.1);
  }
`;

const likesErrorStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.error};
  margin-left: ${spacing.sm};
`;

const signInHintStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
  margin-top: ${spacing.sm};
`;

const shareTitleStyle = css`
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.sm};
`;

const shareInputStyle = css`
  width: 100%;
  background: ${colors.surfaceHover};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.sm};
  border: 1px solid ${colors.borderLight};
  font-size: ${typography.sizes.xs};
  color: ${colors.textSecondary};
  margin-bottom: ${spacing.md};
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${colors.primary};
  }
`;

const shareButtonRowStyle = css`
  display: flex;
  gap: ${spacing.sm};
`;

const copyButtonStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs};
  background: ${colors.surfaceHover};
  color: ${colors.text};
  border: 1px solid ${colors.border};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.sm};
  font-size: ${typography.sizes.sm};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceActive};
    border-color: ${colors.primary};
    color: ${colors.primary};
  }
`;

const shareButtonStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs};
  background: ${colors.primary};
  color: white;
  border: none;
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.sm};
  font-size: ${typography.sizes.sm};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

const beaconBitsLinkStyle = css`
  display: flex;

  &:hover svg {
    opacity: 0.8;
  }
`;

// ============ CHECKIN ACTIONS STYLES ============

const sidebarActionsStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.sm};
  padding: ${spacing.lg};
`;

// Inline mobile actions - only visible on mobile (desktop uses sidebar)
const inlineMobileActionsStyle = css`
  display: none;
  background: ${colors.surfaceHover};
  border-radius: ${radii.lg};
  padding: ${spacing.lg};
  margin-top: ${spacing.lg};
  border: 1px solid ${colors.borderLight};

  @media (max-width: ${breakpoints.lg}) {
    display: block;
  }
`;

const inlineActionsTitleStyle = css`
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.md};
`;

const inlineActionsRowStyle = css`
  display: flex;
  gap: ${spacing.sm};
  flex-wrap: wrap;
`;

const inlineActionButtonStyle = css`
  flex: 1;
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs};
  background: ${colors.surface};
  color: ${colors.text};
  border: 1px solid ${colors.border};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.sm};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceActive};
    border-color: ${colors.primary};
    color: ${colors.primary};
  }
`;

const inlineShareButtonStyle = css`
  flex: 1;
  min-width: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs};
  background: ${colors.primary};
  color: white;
  border: none;
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.sm};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

const inlineDeleteButtonStyle = css`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs};
  background: transparent;
  color: ${colors.textMuted};
  border: none;
  padding: ${spacing.sm} ${spacing.md};
  margin-top: ${spacing.md};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.sm};
  cursor: pointer;
  transition: all ${transitions.fast};
  border-top: 1px solid ${colors.borderLight};
  padding-top: ${spacing.md};

  &:hover:not(:disabled) {
    color: ${colors.error};
    background: rgba(239, 68, 68, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const deleteButtonStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
  padding: ${spacing.sm} ${spacing.md};
  margin-top: ${spacing.md};
  border: none;
  background: transparent;
  color: ${colors.textMuted};
  cursor: pointer;
  font-size: ${typography.sizes.sm};
  border-radius: ${radii.sm};
  transition: all ${transitions.normal};
  width: 100%;
  justify-content: center;
  border-top: 1px solid ${colors.borderLight};
  padding-top: ${spacing.md};

  &:hover:not(:disabled) {
    color: ${colors.error};
    background: rgba(239, 68, 68, 0.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ============ SIDEBAR ACTIONS COMPONENT ============

interface SidebarActionsProps {
  portalTarget: HTMLElement | null;
  shareUrl: string;
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: () => void;
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
  };
}

function SidebarActions({
  portalTarget,
  shareUrl,
  canDelete,
  isDeleting,
  onDelete,
  coordinates,
  address,
}: SidebarActionsProps): React.ReactNode {
  if (!portalTarget) return null;

  const hasLocation = address || coordinates;
  const addressParts = address
    ? [address.street, address.locality, address.region, address.country]
      .filter(
        Boolean,
      )
    : [];

  const content = (
    <>
      {/* Location section - above share */}
      {hasLocation && (
        <div className={sidebarLocationSectionStyle}>
          {/* Map at top */}
          {coordinates && (
            <SidebarMapWidget
              latitude={coordinates.latitude}
              longitude={coordinates.longitude}
              venueName={address?.name}
            />
          )}

          {/* Location details below map */}
          <div className={sidebarLocationDetailsStyle}>
            {address?.name && (
              <div className={sidebarVenueNameStyle}>{address.name}</div>
            )}
            {addressParts.length > 0 && (
              <div className={sidebarAddressTextStyle}>
                {addressParts.join(", ")}
              </div>
            )}
            {coordinates && (
              <div className={sidebarCoordinatesStyle}>
                {coordinates.latitude.toFixed(6)},{" "}
                {coordinates.longitude.toFixed(6)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={sidebarActionsStyle}>
        <div className={shareTitleStyle}>Share</div>
        <input
          type="text"
          value={shareUrl}
          readOnly
          className={shareInputStyle}
          onFocus={(e) => e.target.select()}
        />
        <div className={shareButtonRowStyle}>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                alert("Link copied!");
              } catch (err) {
                console.error("Failed to copy:", err);
              }
            }}
            className={copyButtonStyle}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </button>
          {typeof navigator !== "undefined" && navigator.share && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const shareText = `Dropped anchor at ${
                    address?.name || "a location"
                  } ${shareUrl}`;
                  await navigator.share({ text: shareText });
                } catch (err) {
                  console.log("Share cancelled:", err);
                }
              }}
              className={shareButtonStyle}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className={deleteButtonStyle}
            title={isDeleting ? "Deleting..." : "Delete check-in"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>
    </>
  );

  // Type cast needed due to esm.sh JSX pragma type resolution mismatch
  return createPortal(content, portalTarget) as unknown as React.ReactNode;
}

// ============ SIDEBAR MAP WIDGET ============

function SidebarMapWidget({ latitude, longitude, venueName }: MapWidgetProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    const loadLeaflet = async () => {
      if (mapInstanceRef.current || !mapRef.current) return;

      try {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const L = await import("https://esm.sh/leaflet@1.9.4");

        const map = L.default.map(mapRef.current).setView(
          [latitude, longitude],
          16,
        );

        L.default.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 20,
            subdomains: "abcd",
          },
        ).addTo(map);

        const marker = L.default.marker([latitude, longitude]).addTo(map);

        if (venueName) {
          marker.bindPopup(venueName).openPopup();
        }

        mapInstanceRef.current = map;

        return () => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
          }
        };
      } catch (error) {
        console.error("Failed to load map:", error);
      }
    };

    loadLeaflet();
  }, [latitude, longitude, venueName]);

  return <div ref={mapRef} className={sidebarMapContainerStyle} />;
}

// ============ MAP WIDGET ============

function MapWidget({ latitude, longitude, venueName }: MapWidgetProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    const loadLeaflet = async () => {
      if (mapInstanceRef.current || !mapRef.current) return;

      try {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        const L = await import("https://esm.sh/leaflet@1.9.4");

        const map = L.default.map(mapRef.current).setView(
          [latitude, longitude],
          16,
        );

        L.default.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 20,
            subdomains: "abcd",
          },
        ).addTo(map);

        const marker = L.default.marker([latitude, longitude]).addTo(map);

        if (venueName) {
          marker.bindPopup(venueName).openPopup();
        }

        mapInstanceRef.current = map;

        return () => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
          }
        };
      } catch (error) {
        console.error("Failed to load map:", error);
      }
    };

    loadLeaflet();
  }, [latitude, longitude, venueName]);

  return <div ref={mapRef} className={mapContainerStyle} />;
}

// ============ MAIN COMPONENT ============

export function CheckinDetail({ checkinId, auth }: CheckinDetailProps) {
  const [checkin, setCheckin] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Likes state
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesError, setLikesError] = useState<string | null>(null);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);

  // Portal target for sidebar actions
  const [sidebarPortal, setSidebarPortal] = useState<HTMLElement | null>(null);

  // Local authentication state (fallback if not provided via props)
  const [localAuth, setLocalAuth] = useState<AuthState>({
    isAuthenticated: false,
  });

  // Inject global styles on mount
  useEffect(() => {
    injectGlobalStyles();
  }, []);

  // Find sidebar portal target after mount
  useEffect(() => {
    const portal = document.getElementById(SIDEBAR_PORTAL_ID);
    setSidebarPortal(portal);
  }, []);

  useEffect(() => {
    async function fetchCheckin() {
      try {
        setLoading(true);
        setError(null);

        let apiUrl = "";
        if (checkinId.includes("/")) {
          apiUrl = `/api/checkins/${checkinId}`;
        } else {
          apiUrl = `/api/checkin/${checkinId}`;
        }

        const response = await apiFetch(apiUrl);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Checkin not found");
          } else {
            setError("Failed to load checkin");
          }
          return;
        }

        const data = await response.json();
        setCheckin(data.checkin);
      } catch (err) {
        setError("Failed to load checkin");
        console.error("Failed to fetch checkin:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCheckin();
  }, [checkinId]);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/session");
        const data = await response.json();

        if (data.valid) {
          setLocalAuth({
            isAuthenticated: true,
            userHandle: data.handle,
            userDid: data.did,
            userDisplayName: data.displayName,
            userAvatar: data.avatar,
          });
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      }
    };

    if (!auth) {
      checkAuth();
    }
  }, [auth]);

  const currentAuth = auth || localAuth;

  // Fetch likes data
  const fetchLikesData = async () => {
    if (!checkin || !checkinId.includes("/")) return;

    try {
      setLikesLoading(true);
      setLikesError(null);

      const [checkinDid, checkinRkey] = checkinId.split("/");

      const response = await apiFetch(
        `/api/checkins/${checkinDid}/${checkinRkey}/likes`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch likes: ${response.status}`);
      }

      const data = await response.json();

      setLikesCount(data.count || 0);

      if (currentAuth.isAuthenticated && currentAuth.userDid) {
        const userLiked = data.likes?.some((like: any) =>
          like.author.did === currentAuth.userDid
        );
        setIsLiked(userLiked || false);
      }
    } catch (error) {
      console.error("Failed to fetch likes:", error);
      setLikesError("Failed to load likes");
    } finally {
      setLikesLoading(false);
    }
  };

  useEffect(() => {
    if (checkin && checkinId.includes("/")) {
      fetchLikesData();
    }
  }, [checkin, checkinId, currentAuth.userDid]);

  // Handle like/unlike
  const handleLike = async () => {
    if (!currentAuth.isAuthenticated || !currentAuth.userDid) return;
    if (!checkin || !checkinId.includes("/")) return;

    try {
      setLikesLoading(true);
      setLikesError(null);

      const [checkinDid, checkinRkey] = checkinId.split("/");

      if (isLiked) {
        const response = await apiDelete(
          `/api/checkins/${checkinDid}/${checkinRkey}/likes`,
        );

        if (!response.ok) {
          throw new Error(`Failed to unlike: ${response.status}`);
        }

        const newCount = Math.max(0, likesCount - 1);
        setIsLiked(false);
        setLikesCount(newCount);

        // Update cache with new like count
        if (checkin.uri) {
          await checkinCache.updateCheckinLikes(
            currentAuth.userDid,
            checkin.uri,
            newCount,
          );
        }
      } else {
        const response = await apiFetch(
          `/api/checkins/${checkinDid}/${checkinRkey}/likes`,
          {
            method: "POST",
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to like: ${response.status}`);
        }

        const newCount = likesCount + 1;
        setIsLiked(true);
        setLikesCount(newCount);

        // Update cache with new like count
        if (checkin.uri) {
          await checkinCache.updateCheckinLikes(
            currentAuth.userDid,
            checkin.uri,
            newCount,
          );
        }
      }
    } catch (error) {
      console.error("Failed to toggle like:", error);
      setLikesError("Failed to update like");
    } finally {
      setLikesLoading(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this check-in?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await apiDelete(
        `/api/checkins/${checkin?.author.did}/${checkin?.id}`,
      );

      if (response.ok) {
        // Invalidate cache
        if (currentAuth.userDid) {
          await checkinCache.invalidateFeed(currentAuth.userDid);
        }
        // Redirect to feed
        globalThis.location.href = "/";
      } else {
        const errorData = await response.json();
        alert(
          `Failed to delete check-in: ${errorData.error || "Unknown error"}`,
        );
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete check-in. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = currentAuth.isAuthenticated &&
    currentAuth.userDid === checkin?.author.did;

  if (loading) {
    return <div className={loadingStyle}>Loading checkin...</div>;
  }

  if (error || !checkin) {
    return <div className={errorStyle}>{error || "Checkin not found"}</div>;
  }

  const shareUrl =
    `${globalThis.location.origin}/checkins/${checkin.author.did}/${checkin.id}`;

  return (
    <div className={pageContainerStyle}>
      {/* Main checkin card */}
      <div className={mainCardStyle}>
        {/* Author header */}
        <div className={authorHeaderStyle}>
          {checkin.author.avatar
            ? (
              <img
                src={checkin.author.avatar}
                alt={checkin.author.displayName || checkin.author.handle}
                className={avatar(56)}
              />
            )
            : (
              <div className={avatarFallback(56, 20)}>
                {(checkin.author.displayName || checkin.author.handle)?.[0]
                  ?.toUpperCase() || "?"}
              </div>
            )}

          <div className={authorInfoStyle}>
            <div className={displayNameStyle}>
              {checkin.author.displayName || checkin.author.handle}
              {checkin.source === "beaconbits" && (
                <a
                  href={`https://www.beaconbits.app/beacons/${checkin.id}?did=${checkin.author.did}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on BeaconBits"
                  className={beaconBitsLinkStyle}
                >
                  <svg
                    viewBox="0 0 705 704"
                    width="18"
                    height="18"
                    fill="none"
                    style={{ flexShrink: 0 }}
                  >
                    <path
                      fill="#E24630"
                      fillRule="evenodd"
                      d="M0 350.996c.04-10.352.258-66.426 24.46-127.069 88.188-220.98 353.658-290.2 538.505-154.374 104.17 76.546 160.762 211.775 135.265 349.385-24.074 129.929-113.769 208.359-169.863 239.601-169.703 94.514-380.779 35.564-476.113-120.317C-.7 451.638.005 375.87 0 350.996Z"
                      clipRule="evenodd"
                    />
                    <path
                      fill="#F7F7F7"
                      fillRule="evenodd"
                      d="M353.992 344.986c5.231 50.808 61.671 74.893 33.865 156.094-7.743 22.612-38.143 75.581-60.212 67.864-16.179-5.657-18.418-20.395-9.568-31.61 45.692-57.901 40.89-89.345 11.937-136.575-57.392-93.622 22.565-125.319 22.455-187.758-.073-41.005-41.264-49.577-24.442-71.699 4.208-5.534 16.876-14.627 35.359 1.969 69.336 62.256 10.012 134.209-.504 156.844-11.108 23.909-8.889 43.083-8.89 44.871ZM243.992 344.986c5.231 50.808 61.671 74.893 33.865 156.094-7.743 22.612-38.143 75.581-60.212 67.864-16.179-5.657-18.418-20.395-9.568-31.61 45.692-57.901 40.89-89.345 11.937-136.575-57.392-93.622 22.565-125.319 22.455-187.758-.073-41.005-41.264-49.577-24.442-71.699 4.208-5.534 16.876-14.627 35.359 1.969 69.336 62.256 10.012 134.209-.504 156.844-11.108 23.909-8.889 43.083-8.89 44.871ZM463.992 344.986c5.231 50.808 61.671 74.893 33.865 156.094-7.743 22.612-38.143 75.581-60.212 67.864-16.179-5.657-18.418-20.395-9.568-31.61 45.692-57.901 40.89-89.345 11.937-136.575-57.392-93.622 22.565-125.319 22.455-187.758-.073-41.005-41.264-49.577-24.442-71.699 4.208-5.534 16.876-14.627 35.359 1.969 69.336 62.256 10.012 134.209-.504 156.844-11.108 23.909-8.889 43.083-8.89 44.871Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>
              )}
            </div>
            <div className={handleStyle}>@{checkin.author.handle}</div>
          </div>

          <time className={timestampStyle}>
            {new Date(checkin.createdAt).toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            <br />
            {new Date(checkin.createdAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>

        {/* Checkin message */}
        {checkin.text && <div className={checkinTextStyle}>{checkin.text}</div>}

        {/* Image */}
        {checkin.image && (
          <div
            className={imageContainerStyle}
            onClick={() => setLightboxOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setLightboxOpen(true);
              }
            }}
          >
            <img
              src={checkin.image.fullsizeUrl}
              alt={checkin.image.alt || "Check-in photo"}
            />
          </div>
        )}

        {/* Location info - only shown on mobile, desktop shows in sidebar */}
        {(checkin.address || checkin.coordinates) && (
          <div className={mobileLocationSectionStyle}>
            <div className={locationSectionStyle}>
              <div className={locationHeaderStyle}>
                <span style={{ fontSize: typography.sizes.lg }}>📍</span>
                <span className={locationLabelStyle}>Location</span>
              </div>

              {checkin.address && (
                <div>
                  {checkin.address.name && (
                    <div className={venueNameStyle}>{checkin.address.name}</div>
                  )}
                  <div className={addressTextStyle}>
                    {[
                      checkin.address.street,
                      checkin.address.locality,
                      checkin.address.region,
                      checkin.address.country,
                    ].filter(Boolean).join(", ")}
                  </div>
                </div>
              )}

              {checkin.coordinates && (
                <>
                  <div className={coordinatesStyle}>
                    {checkin.coordinates.latitude.toFixed(6)},{" "}
                    {checkin.coordinates.longitude.toFixed(6)}
                  </div>

                  <MapWidget
                    latitude={checkin.coordinates.latitude}
                    longitude={checkin.coordinates.longitude}
                    venueName={checkin.address?.name}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Likes section */}
        <div className={likesSectionStyle}>
          <div className={likesRowStyle}>
            <button
              type="button"
              onClick={handleLike}
              disabled={!currentAuth.isAuthenticated || likesLoading}
              className={likeButtonStyle}
              title={currentAuth.isAuthenticated
                ? (isLiked ? "Unlike" : "Like")
                : "Sign in to like"}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill={isLiked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={heartIconStyle}
                style={{
                  opacity: likesLoading ? 0.5 : 1,
                  color: isLiked ? colors.error : colors.textSecondary,
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span
                style={{
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  color: isLiked ? colors.error : colors.text,
                  minWidth: "20px",
                  textAlign: "left",
                }}
              >
                {likesCount}
              </span>
            </button>

            {likesError && <span className={likesErrorStyle}>{likesError}
            </span>}
          </div>

          {!currentAuth.isAuthenticated && (
            <div className={signInHintStyle}>
              Sign in to like this checkin
            </div>
          )}
        </div>
      </div>

      {/* Desktop sidebar actions via portal */}
      <SidebarActions
        portalTarget={sidebarPortal}
        shareUrl={shareUrl}
        canDelete={canDelete}
        isDeleting={isDeleting}
        onDelete={handleDelete}
        coordinates={checkin.coordinates}
        address={checkin.address}
      />

      {/* Inline mobile actions - only visible on mobile */}
      <div className={inlineMobileActionsStyle}>
        <div className={inlineActionsTitleStyle}>Share</div>
        <div className={inlineActionsRowStyle}>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                alert("Link copied!");
              } catch (err) {
                console.error("Failed to copy to clipboard:", err);
                alert("Failed to copy link.");
              }
            }}
            className={inlineActionButtonStyle}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Link
          </button>

          {typeof navigator !== "undefined" && navigator.share && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const shareText = `Dropped anchor at ${
                    checkin.address?.name || "a location"
                  } ${shareUrl}`;
                  await navigator.share({
                    text: shareText,
                  });
                } catch (err) {
                  console.log("Share cancelled or failed:", err);
                }
              }}
              className={inlineShareButtonStyle}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className={inlineDeleteButtonStyle}
            title={isDeleting ? "Deleting..." : "Delete check-in"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>

      {/* Image Lightbox */}
      {checkin.image && (
        <ImageLightbox
          isOpen={lightboxOpen}
          imageUrl={checkin.image.fullsizeUrl}
          alt={checkin.image.alt || "Check-in photo"}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
