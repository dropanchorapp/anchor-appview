/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState, CheckinData } from "../types/index.ts";
import { ImageLightbox } from "./ImageLightbox.tsx";
import { apiDelete, apiFetch } from "../utils/api.ts";
import { checkinCache } from "../utils/checkin-cache.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import { avatar, avatarFallback, flexCenter } from "../styles/components.ts";
import {
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

const backButtonStyle = css`
  background: ${colors.surfaceHover};
  border: 1px solid ${colors.borderLight};
  padding: ${spacing.sm} ${spacing.lg};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.md};
  color: ${colors.text};
  cursor: pointer;
  margin-bottom: ${spacing.xl};
  font-weight: ${typography.weights.medium};
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceActive};
    border-color: ${colors.primary};
    color: ${colors.primary};
  }
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

const shareCardStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.lg};
  box-shadow: ${shadows.sm};
  padding: ${spacing.lg};
`;

const shareTitleStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.md};
`;

const shareInputRowStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  background: ${colors.surfaceHover};
  padding: ${spacing.md};
  border-radius: ${radii.md};
  border: 1px solid ${colors.borderLight};
`;

const shareInputStyle = css`
  flex: 1;
  background: transparent;
  border: none;
  font-size: ${typography.sizes.md};
  color: ${colors.text};
  outline: none;
`;

const copyButtonStyle = css`
  background: ${colors.surfaceHover};
  color: ${colors.primary};
  border: 1px solid ${colors.primary};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.sm};
  font-size: ${typography.sizes.md};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.primaryLight};
  }
`;

const shareButtonStyle = css`
  background: ${colors.primary};
  color: white;
  border: none;
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.sm};
  font-size: ${typography.sizes.md};
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

  // Local authentication state (fallback if not provided via props)
  const [localAuth, setLocalAuth] = useState<AuthState>({
    isAuthenticated: false,
  });

  // Inject global styles on mount
  useEffect(() => {
    injectGlobalStyles();
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
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          globalThis.location.href = "/";
        }}
        className={backButtonStyle}
      >
        ← Back to Feed
      </button>

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

        {/* Location info */}
        {(checkin.address || checkin.coordinates) && (
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

      {/* Share section */}
      <div className={shareCardStyle}>
        <div className={shareTitleStyle}>Share this checkin</div>

        <div className={shareInputRowStyle}>
          <input
            type="text"
            value={shareUrl}
            readOnly
            className={shareInputStyle}
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                alert("Link copied to clipboard!");
              } catch (err) {
                console.error("Failed to copy to clipboard:", err);
                alert("Failed to copy link. Please copy manually.");
              }
            }}
            className={copyButtonStyle}
          >
            Copy
          </button>
          {navigator.share && (
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
              className={shareButtonStyle}
            >
              Share
            </button>
          )}
        </div>
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
