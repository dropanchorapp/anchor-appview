/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect, useState } from "https://esm.sh/react@19.1.0";
import { AuthState, CheckinData } from "../types/index.ts";
import { CheckinCard } from "./CheckinCard.tsx";

interface FeedProps {
  checkins: CheckinData[];
  loading: boolean;
  auth: AuthState;
  onLogin: () => void;
  onCheckinsChange?: (checkins: CheckinData[]) => void;
}

export function Feed(
  { checkins, loading, auth, onLogin, onCheckinsChange }: FeedProps,
) {
  const [localCheckins, setLocalCheckins] = useState(checkins);

  // Update local checkins when props change
  useEffect(() => {
    setLocalCheckins(checkins);
  }, [checkins]);

  const handleDelete = (deletedCheckinId: string) => {
    const updatedCheckins = localCheckins.filter((c) =>
      c.id !== deletedCheckinId
    );
    setLocalCheckins(updatedCheckins);
    if (onCheckinsChange) {
      onCheckinsChange(updatedCheckins);
    }
  };
  return (
    <>
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                border: "2px solid #e5e5ea",
                borderTop: "2px solid #007aff",
                borderRadius: "50%",
                animation: "spin 1s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontSize: "15px",
                color: "#8e8e93",
              }}
            >
              Loading check-ins...
            </span>
          </div>
        </div>
      )}

      {localCheckins.length === 0 && !loading && (
        <div
          style={{
            textAlign: "center",
            padding: "80px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Show login illustration when not authenticated */}
          {!auth.isAuthenticated
            ? (
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "60px 40px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  margin: "0 20px",
                }}
              >
                <img
                  src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754731274/seagull-chest_oc7rjd.png"
                  alt="Login required"
                  style={{
                    width: "400px",
                    height: "auto",
                    marginBottom: "40px",
                  }}
                />
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "#1c1c1e",
                    margin: "0 0 8px 0",
                  }}
                >
                  Sign in to see your check-ins
                </h3>
                <p
                  style={{
                    fontSize: "15px",
                    color: "#8e8e93",
                    margin: "0 auto 24px auto",
                    maxWidth: "400px",
                    lineHeight: "1.4",
                  }}
                >
                  Connect with your Bluesky account to see your check-ins.
                </p>
                <button
                  type="button"
                  onClick={onLogin}
                  style={{
                    background: "#007aff",
                    color: "white",
                    border: "none",
                    borderRadius: "22px",
                    padding: "12px 24px",
                    fontSize: "16px",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#0056b3";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#007aff";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  Sign in with Bluesky
                </button>
              </div>
            )
            : (
              /* Show regular empty state for authenticated empty feeds */
              <>
                <img
                  src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754731275/seagull-looking_yanxxb.png"
                  alt="Seagull looking around"
                  style={{
                    width: "400px",
                    height: "auto",
                    marginBottom: "40px",
                  }}
                />
                <h3
                  style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "#1c1c1e",
                    margin: "0 0 8px 0",
                  }}
                >
                  Your check-ins will appear here
                </h3>
                <p
                  style={{
                    fontSize: "15px",
                    color: "#8e8e93",
                    margin: "0 auto",
                    maxWidth: "400px",
                    lineHeight: "1.4",
                  }}
                >
                  When you create check-ins with the Anchor app, they'll appear
                  here.
                </p>
              </>
            )}
        </div>
      )}

      {localCheckins.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {localCheckins.map((checkin) => (
            <CheckinCard
              key={checkin.id}
              checkin={checkin}
              auth={auth}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}
