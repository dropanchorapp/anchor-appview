/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { AuthState, CheckinData, FeedType } from "../types/index.ts";
import { CheckinCard } from "./CheckinCard.tsx";

interface FeedProps {
  feedType: FeedType;
  setFeedType: (type: FeedType) => void;
  checkins: CheckinData[];
  loading: boolean;
  auth: AuthState;
  onLogin: () => void;
}

export function Feed(
  { feedType, setFeedType, checkins, loading, auth, onLogin }: FeedProps,
) {
  return (
    <>
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          margin: "16px 0",
          padding: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            background: "#f2f2f7",
            borderRadius: "8px",
            padding: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setFeedType("timeline")}
            style={{
              flex: "1",
              padding: "8px 16px",
              textAlign: "center",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              border: "none",
              background: feedType === "timeline" ? "white" : "none",
              cursor: "pointer",
              color: feedType === "timeline" ? "#007aff" : "#3c3c43",
              transition: "all 0.2s",
              boxShadow: feedType === "timeline"
                ? "0 1px 2px rgba(0,0,0,0.1)"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (feedType !== "timeline") {
                e.currentTarget.style.background = "#e5e5ea";
              }
            }}
            onMouseLeave={(e) => {
              if (feedType !== "timeline") {
                e.currentTarget.style.background = "none";
              }
            }}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => setFeedType("following")}
            style={{
              flex: "1",
              padding: "8px 16px",
              textAlign: "center",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              border: "none",
              background: feedType === "following" ? "white" : "none",
              cursor: "pointer",
              color: feedType === "following" ? "#007aff" : "#3c3c43",
              transition: "all 0.2s",
              boxShadow: feedType === "following"
                ? "0 1px 2px rgba(0,0,0,0.1)"
                : "none",
            }}
          >
            Following
          </button>
        </div>
      </div>

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

      {checkins.length === 0 && !loading && (
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
          {/* Show login illustration for timeline and following when not authenticated */}
          {(feedType === "timeline" || feedType === "following") &&
              !auth.isAuthenticated
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
                  Sign in to see your {feedType}
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
                  {feedType === "following"
                    ? "Connect with your Bluesky account to see check-ins from people you follow."
                    : "Connect with your Bluesky account to see your personalized timeline."}
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
                  {feedType === "following"
                    ? "No check-ins from people you follow"
                    : "Your timeline is empty"}
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
                  {feedType === "following"
                    ? "Check-ins from people you follow will appear here."
                    : "Your personalized timeline is empty. Check back later!"}
                </p>
              </>
            )}
        </div>
      )}

      {checkins.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {checkins.map((checkin) => (
            <CheckinCard key={checkin.id} checkin={checkin} />
          ))}
        </div>
      )}
    </>
  );
}
