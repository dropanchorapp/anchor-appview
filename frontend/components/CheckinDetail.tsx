/** @jsxImportSource https://esm.sh/react */
import { useEffect, useState } from "https://esm.sh/react";
import { CheckinData } from "../types/index.ts";

interface CheckinDetailProps {
  checkinId: string;
}

export function CheckinDetail({ checkinId }: CheckinDetailProps) {
  const [checkin, setCheckin] = useState<CheckinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const response = await fetch(`/api/checkin/${checkinId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Checkin not found");
          } else {
            setError("Failed to load checkin");
          }
          return;
        }

        const data = await response.json();
        setCheckin(data);
      } catch (err) {
        setError("Failed to load checkin");
        console.error("Failed to fetch checkin:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCheckin();
  }, [checkinId]);

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

  const shareUrl = `${globalThis.location.origin}/checkin/${checkinId}`;

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
          // If there's history, go back, otherwise go to feed
          if (globalThis.history.length > 1) {
            globalThis.history.back();
          } else {
            globalThis.location.href = "/";
          }
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
              }}
            >
              {checkin.author.displayName || checkin.author.handle}
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
              <div
                style={{
                  fontSize: "13px",
                  color: "#8e8e93",
                  marginTop: checkin.address ? "8px" : "0",
                  fontFamily: "monospace",
                }}
              >
                {checkin.coordinates.latitude.toFixed(6)},{" "}
                {checkin.coordinates.longitude.toFixed(6)}
              </div>
            )}
          </div>
        )}
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
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              // Simple feedback - could be enhanced with a toast
              alert("Link copied to clipboard!");
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
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
