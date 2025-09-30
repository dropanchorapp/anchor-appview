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
    // Use REST-style URL: /checkins/:did/:rkey
    globalThis.location.href = `/checkins/${checkin.author.did}/${checkin.id}`;
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
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                background: "none",
                border: "none",
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontSize: "14px",
                color: isDeleting ? "#c7c7cc" : "#ff3b30",
                padding: "4px",
                borderRadius: "4px",
                transition: "all 0.1s ease-in-out",
                opacity: isDeleting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isDeleting) {
                  e.currentTarget.style.background = "#fee";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
              title={isDeleting ? "Deleting..." : "Delete check-in"}
            >
              {isDeleting ? "..." : "🗑️"}
            </button>
          )}
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
              marginBottom: "8px",
            }}
          >
            {checkin.text}
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
    </div>
  );
}
