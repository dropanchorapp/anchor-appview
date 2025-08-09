/** @jsxImportSource https://esm.sh/react */
import { CheckinData } from "../types/index.ts";

interface CheckinCardProps {
  checkin: CheckinData;
}

export function CheckinCard({ checkin }: CheckinCardProps) {
  return (
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
