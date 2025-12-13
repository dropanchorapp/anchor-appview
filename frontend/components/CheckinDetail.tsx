/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@19.1.0";
import { AuthState, CheckinData } from "../types/index.ts";
import { ImageLightbox } from "./ImageLightbox.tsx";
import { apiDelete, apiFetch } from "../utils/api.ts";

interface CheckinDetailProps {
  checkinId: string;
  auth?: AuthState; // Optional auth prop for when used in App context
}

interface MapWidgetProps {
  latitude: number;
  longitude: number;
  venueName?: string;
}

function MapWidget({ latitude, longitude, venueName }: MapWidgetProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    // Dynamically load Leaflet
    const loadLeaflet = async () => {
      if (mapInstanceRef.current || !mapRef.current) return;

      try {
        // Load Leaflet CSS
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);

        // Load Leaflet JS
        const L = await import("https://esm.sh/leaflet@1.9.4");

        // Create map
        const map = L.default.map(mapRef.current).setView(
          [latitude, longitude],
          16,
        );

        // Add CartoDB Voyager tiles - clean and modern style
        L.default.tileLayer(
          "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            maxZoom: 20,
            subdomains: "abcd",
          },
        ).addTo(map);

        // Add marker
        const marker = L.default.marker([latitude, longitude]).addTo(map);

        if (venueName) {
          marker.bindPopup(venueName).openPopup();
        }

        mapInstanceRef.current = map;

        // Clean up on unmount
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

  return (
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "200px",
        borderRadius: "12px",
        overflow: "hidden",
        background: "#f0f0f0",
      }}
    />
  );
}

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

  // Inject proper CSS styles on mount
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        line-height: 1.5;
        color: #1c1c1e;
        background: #f2f2f7;
        min-height: 100vh;
      }

      /* Heart icon styles */
      .heart-icon {
        transition: all 0.2s ease;
        cursor: pointer;
      }

      .heart-icon:hover {
        transform: scale(1.1);
      }

      .heart-icon.liked {
        color: #ff3b30;
        fill: #ff3b30;
      }

      .heart-icon:not(.liked) {
        color: #8e8e93;
        fill: none;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);

  useEffect(() => {
    async function fetchCheckin() {
      try {
        setLoading(true);
        setError(null);

        // Check if checkinId is in new format (identifier/rkey) or legacy format
        let apiUrl = "";
        if (checkinId.includes("/")) {
          // New format: identifier/rkey (identifier can be DID or handle)
          apiUrl = `/api/checkins/${checkinId}`;
        } else {
          // Legacy format: use old API endpoint
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
  // NOTE: Use regular fetch() here, not apiFetch(), to avoid redirect loops
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

    // Only check auth if not provided via props
    if (!auth) {
      checkAuth();
    }
  }, [auth]);

  // Get current auth state (from props or local)
  const currentAuth = auth || localAuth;

  // Fetch likes data for the checkin
  const fetchLikesData = async () => {
    if (!checkin || !checkinId.includes("/")) return;

    try {
      setLikesLoading(true);
      setLikesError(null);

      // Parse checkin ID to get DID and rkey
      const [checkinDid, checkinRkey] = checkinId.split("/");

      const response = await apiFetch(
        `/api/checkins/${checkinDid}/${checkinRkey}/likes`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch likes: ${response.status}`);
      }

      const data = await response.json();

      setLikesCount(data.count || 0);

      // Check if current user has liked this checkin
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

  // Fetch likes data when checkin is loaded
  useEffect(() => {
    if (checkin && checkinId.includes("/")) {
      fetchLikesData();
    }
  }, [checkin, checkinId, currentAuth.userDid]);

  // Handle like/unlike action
  const handleLike = async () => {
    // Should not be called if not authenticated (button is disabled)
    if (!currentAuth.isAuthenticated) {
      return;
    }

    if (!checkin || !checkinId.includes("/")) return;

    try {
      setLikesLoading(true);
      setLikesError(null);

      const [checkinDid, checkinRkey] = checkinId.split("/");

      if (isLiked) {
        // Unlike
        const response = await apiDelete(
          `/api/checkins/${checkinDid}/${checkinRkey}/likes`,
        );

        if (!response.ok) {
          throw new Error(`Failed to unlike: ${response.status}`);
        }

        setIsLiked(false);
        setLikesCount((prev) => Math.max(0, prev - 1));
      } else {
        // Like
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

        setIsLiked(true);
        setLikesCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to toggle like:", error);
      setLikesError("Failed to update like");
    } finally {
      setLikesLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
          fontSize: "16px",
          color: "#8e8e93",
        }}
      >
        Loading checkin...
      </div>
    );
  }

  if (error || !checkin) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
          fontSize: "16px",
          color: "#ff3b30",
        }}
      >
        {error || "Checkin not found"}
      </div>
    );
  }

  // Use DID-based URL for sharing (consistent, permanent identifier)
  const shareUrl =
    `${globalThis.location.origin}/checkins/${checkin.author.did}/${checkin.id}`;

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "20px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        lineHeight: "1.5",
        color: "#1c1c1e",
      }}
    >
      {/* Back button */}
      <button
        type="button"
        onClick={() => {
          // Always go to main feed for consistency
          globalThis.location.href = "/";
        }}
        style={{
          background: "#f8f9fa",
          border: "1px solid #d1d1d6",
          padding: "8px 16px",
          borderRadius: "8px",
          fontSize: "14px",
          color: "#1c1c1e",
          cursor: "pointer",
          marginBottom: "20px",
          fontWeight: "500",
          transition: "all 0.1s ease-in-out",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#e9ecef";
          e.currentTarget.style.borderColor = "#007aff";
          e.currentTarget.style.color = "#007aff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "#f8f9fa";
          e.currentTarget.style.borderColor = "#d1d1d6";
          e.currentTarget.style.color = "#1c1c1e";
        }}
      >
        ← Back to Feed
      </button>

      {/* Main checkin card */}
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          padding: "24px",
          marginBottom: "16px",
        }}
      >
        {/* Author header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          {checkin.author.avatar
            ? (
              <img
                src={checkin.author.avatar}
                alt={checkin.author.displayName || checkin.author.handle}
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "28px",
                  objectFit: "cover",
                }}
              />
            )
            : (
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  borderRadius: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "white",
                }}
              >
                {(checkin.author.displayName || checkin.author.handle)?.[0]
                  ?.toUpperCase() || "?"}
              </div>
            )}

          <div style={{ flex: "1" }}>
            <div
              style={{
                fontWeight: "600",
                fontSize: "18px",
                color: "#1c1c1e",
                marginBottom: "2px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {checkin.author.displayName || checkin.author.handle}
              {checkin.source === "beaconbits" && (
                <a
                  href={`https://www.beaconbits.app/beacons/${checkin.id}?did=${checkin.author.did}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on BeaconBits"
                  style={{ display: "flex" }}
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
            <div
              style={{
                fontSize: "15px",
                color: "#8e8e93",
              }}
            >
              @{checkin.author.handle}
            </div>
          </div>

          <time
            style={{
              fontSize: "14px",
              color: "#8e8e93",
              textAlign: "right",
            }}
          >
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
        {checkin.text && (
          <div
            style={{
              fontSize: "18px",
              lineHeight: "1.5",
              color: "#1c1c1e",
              marginBottom: "20px",
            }}
          >
            {checkin.text}
          </div>
        )}

        {/* Image */}
        {checkin.image && (
          <div
            style={{
              marginBottom: "20px",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #e5e5ea",
              cursor: "pointer",
            }}
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
              style={{
                width: "100%",
                height: "auto",
                display: "block",
              }}
            />
          </div>
        )}

        {/* Location info */}
        {(checkin.address || checkin.coordinates) && (
          <div
            style={{
              background: "#f8f9fa",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #e1e1e6",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "16px" }}>📍</span>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#1c1c1e",
                }}
              >
                Location
              </span>
            </div>

            {checkin.address && (
              <div>
                {checkin.address.name && (
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: "500",
                      color: "#1c1c1e",
                      marginBottom: "4px",
                    }}
                  >
                    {checkin.address.name}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "14px",
                    color: "#8e8e93",
                    lineHeight: "1.4",
                  }}
                >
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
                <div
                  style={{
                    fontSize: "13px",
                    color: "#8e8e93",
                    marginTop: checkin.address ? "8px" : "0",
                    fontFamily: "monospace",
                    marginBottom: "12px",
                  }}
                >
                  {checkin.coordinates.latitude.toFixed(6)},{" "}
                  {checkin.coordinates.longitude.toFixed(6)}
                </div>

                {/* Map widget */}
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
        <div
          style={{
            background: "#f8f9fa",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #e1e1e6",
            marginTop: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={handleLike}
              disabled={!currentAuth.isAuthenticated || likesLoading}
              style={{
                background: "none",
                border: "none",
                cursor: !currentAuth.isAuthenticated || likesLoading
                  ? "not-allowed"
                  : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px",
                borderRadius: "8px",
                transition: "all 0.2s ease",
                opacity: !currentAuth.isAuthenticated ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (currentAuth.isAuthenticated && !likesLoading) {
                  e.currentTarget.style.background = "#e9ecef";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
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
                className={`heart-icon ${isLiked ? "liked" : ""}`}
                style={{
                  opacity: likesLoading ? 0.5 : 1,
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: isLiked ? "#ff3b30" : "#1c1c1e",
                  minWidth: "20px",
                  textAlign: "left",
                }}
              >
                {likesCount}
              </span>
            </button>

            {likesError && (
              <span
                style={{
                  fontSize: "14px",
                  color: "#ff3b30",
                  marginLeft: "8px",
                }}
              >
                {likesError}
              </span>
            )}
          </div>

          {!currentAuth.isAuthenticated && (
            <div
              style={{
                fontSize: "14px",
                color: "#8e8e93",
                marginTop: "8px",
              }}
            >
              Sign in to like this checkin
            </div>
          )}
        </div>
      </div>

      {/* Share section */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: "16px",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            fontWeight: "600",
            color: "#1c1c1e",
            marginBottom: "12px",
          }}
        >
          Share this checkin
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#f8f9fa",
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #e1e1e6",
          }}
        >
          <input
            type="text"
            value={shareUrl}
            readOnly
            style={{
              flex: "1",
              background: "transparent",
              border: "none",
              fontSize: "14px",
              color: "#1c1c1e",
              outline: "none",
            }}
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
            style={{
              background: "#f8f9fa",
              color: "#007aff",
              border: "1px solid #007aff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer",
              marginRight: "4px",
            }}
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
              style={{
                background: "#007aff",
                color: "white",
                border: "none",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "14px",
                cursor: "pointer",
              }}
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
