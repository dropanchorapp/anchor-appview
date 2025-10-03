/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useState } from "https://esm.sh/react@19.1.0";
import { AuthState, CheckinData } from "../types/index.ts";

interface CheckinCardProps {
  checkin: CheckinData;
  auth: AuthState;
  onDelete?: (checkinId: string) => void;
}

export function CheckinCard({ checkin, auth, onDelete }: CheckinCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClick = () => {
    // Use handle-based URL for better readability, fallback to DID if handle not available
    const identifier = checkin.author.handle || checkin.author.did;
    globalThis.location.href = `/checkins/${identifier}/${checkin.id}`;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click

    if (!confirm("Are you sure you want to delete this check-in?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/checkins/${checkin.author.did}/${checkin.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (response.ok) {
        if (onDelete) {
          onDelete(checkin.id);
        } else {
          // Refresh the page if no callback provided
          globalThis.location.reload();
        }
      } else {
        const error = await response.json();
        alert(`Failed to delete check-in: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete check-in. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Check if current user can delete this checkin
  const canDelete = auth.isAuthenticated && auth.userDid === checkin.author.did;

  return (
    <div
      onClick={handleClick}
      style={{
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        padding: "16px",
        cursor: "pointer",
        transition: "transform 0.1s ease-in-out, box-shadow 0.1s ease-in-out",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        // Change arrow color on hover
        const arrow = e.currentTarget.querySelector(
          "[data-arrow]",
        ) as HTMLElement;
        if (arrow) arrow.style.color = "#007aff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
        // Reset arrow color
        const arrow = e.currentTarget.querySelector(
          "[data-arrow]",
        ) as HTMLElement;
        if (arrow) arrow.style.color = "#c7c7cc";
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        {checkin.author.avatar
          ? (
            <img
              src={checkin.author.avatar}
              alt={checkin.author.displayName || checkin.author.handle}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "20px",
                objectFit: "cover",
              }}
            />
          )
          : (
            <div
              style={{
                width: "40px",
                height: "40px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
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
              fontSize: "15px",
              color: "#1c1c1e",
            }}
          >
            {checkin.author.displayName || checkin.author.handle}
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#8e8e93",
            }}
          >
            @{checkin.author.handle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <time
            style={{
              fontSize: "13px",
              color: "#8e8e93",
            }}
          >
            {(() => {
              const date = new Date(checkin.createdAt);
              const now = new Date();
              const diffMs = now.getTime() - date.getTime();
              const diffSecs = Math.floor(diffMs / 1000);
              const diffMins = Math.floor(diffSecs / 60);
              const diffHours = Math.floor(diffMins / 60);
              const diffDays = Math.floor(diffHours / 24);

              if (diffSecs < 60) return "now";
              if (diffMins < 60) return diffMins + "m";
              if (diffHours < 24) return diffHours + "h";
              if (diffDays < 7) return diffDays + "d";
              return date.toLocaleDateString();
            })()}
          </time>
          <span
            data-arrow
            style={{
              fontSize: "12px",
              color: "#c7c7cc",
              transition: "color 0.1s ease-in-out",
            }}
          >
            →
          </span>
        </div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        {checkin.text && (
          <div
            style={{
              fontSize: "15px",
              lineHeight: "1.4",
              color: "#1c1c1e",
              marginBottom: "12px",
            }}
          >
            {checkin.text}
          </div>
        )}

        {checkin.image && (
          <div
            style={{
              marginBottom: "12px",
              width: "120px",
              height: "120px",
              borderRadius: "8px",
              overflow: "hidden",
              border: "1px solid #e5e5ea",
            }}
          >
            <img
              src={checkin.image.thumbUrl}
              alt={checkin.image.alt || "Check-in photo"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        )}

        {(checkin.address || checkin.coordinates) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              color: "#007aff",
              background: "#f0f8ff",
              padding: "6px 10px",
              borderRadius: "8px",
              width: "fit-content",
            }}
          >
            <span style={{ fontSize: "12px" }}>📍</span>
            <span>
              {checkin.address
                ? [
                  checkin.address.name,
                  checkin.address.locality,
                ].filter(Boolean).join(", ")
                : checkin.coordinates
                ? `${checkin.coordinates.latitude.toFixed(4)}, ${
                  checkin.coordinates.longitude.toFixed(4)
                }`
                : ""}
            </span>
          </div>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          style={{
            position: "absolute",
            bottom: "12px",
            right: "12px",
            background: "rgba(255, 255, 255, 0.95)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            cursor: isDeleting ? "not-allowed" : "pointer",
            color: isDeleting ? "#c7c7cc" : "#ff3b30",
            padding: "6px",
            borderRadius: "6px",
            transition: "all 0.2s ease-in-out",
            opacity: isDeleting ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
          onMouseEnter={(e) => {
            if (!isDeleting) {
              e.currentTarget.style.background = "#ffebee";
              e.currentTarget.style.transform = "scale(1.05)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.95)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title={isDeleting ? "Deleting..." : "Delete check-in"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isDeleting
              ? (
                // Loader icon (rotating circle)
                <circle cx="12" cy="12" r="10" opacity="0.25" />
              )
              : (
                // Trash icon (lucide-trash-2)
                <>
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" x2="10" y1="11" y2="17" />
                  <line x1="14" x2="14" y1="11" y2="17" />
                </>
              )}
          </svg>
        </button>
      )}
    </div>
  );
}
