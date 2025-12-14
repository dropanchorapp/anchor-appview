/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState, CheckinData } from "../types/index.ts";
import { CheckinCard } from "./CheckinCard.tsx";
import { checkinCache } from "../utils/checkin-cache.ts";
import {
  buttonPrimaryPill,
  card,
  emptyState,
  emptyStateText,
  emptyStateTitle,
  flexCenter,
  spinner,
} from "../styles/components.ts";
import { colors, spacing, typography } from "../styles/theme.ts";

interface FeedProps {
  checkins: CheckinData[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  auth: AuthState;
  onLogin: () => void;
  onCheckinsChange?: (checkins: CheckinData[]) => void;
}

const loadingContainerStyle = css`
  ${flexCenter} padding: 60px 0;
`;

const loadingContentStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.lg};
`;

const loadingTextStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textSecondary};
`;

const emptyContainerStyle = css`
  ${emptyState} padding: 80px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

const loginCardStyle = css`
  ${card} padding: 60px ${spacing.xxxxl};
  margin: 0 ${spacing.xl};
`;

const illustrationStyle = css`
  width: 400px;
  height: auto;
  margin-bottom: ${spacing.xxxxl};
`;

const feedListStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.lg};
`;

const loadingMoreStyle = css`
  ${flexCenter} padding: ${spacing.xxl} 0;
`;

const loadingMoreContentStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
`;

const loadingMoreTextStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
`;

const endMessageStyle = css`
  text-align: center;
  padding: ${spacing.xxxl} 0;
  color: ${colors.textSecondary};
  font-size: ${typography.sizes.md};
`;

export function Feed({
  checkins,
  loading,
  loadingMore = false,
  hasMore = true,
  onLoadMore,
  auth,
  onLogin,
  onCheckinsChange,
}: FeedProps) {
  const [localCheckins, setLocalCheckins] = useState(checkins);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalCheckins(checkins);
  }, [checkins]);

  useEffect(() => {
    if (!onLoadMore || !sentinelRef.current || localCheckins.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0,
      },
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, loadingMore, localCheckins.length]);

  const handleDelete = async (deletedCheckinId: string) => {
    // Find the checkin to get its URI for cache removal
    const deletedCheckin = localCheckins.find((c) => c.id === deletedCheckinId);

    const updatedCheckins = localCheckins.filter((c) =>
      c.id !== deletedCheckinId
    );
    setLocalCheckins(updatedCheckins);

    // Update cache
    if (auth.userDid && deletedCheckin?.uri) {
      await checkinCache.removeCheckin(auth.userDid, deletedCheckin.uri);
    }

    if (onCheckinsChange) {
      onCheckinsChange(updatedCheckins);
    }
  };

  return (
    <>
      {loading && (
        <div className={loadingContainerStyle}>
          <div className={loadingContentStyle}>
            <div className={spinner(20)} />
            <span className={loadingTextStyle}>Loading check-ins...</span>
          </div>
        </div>
      )}

      {localCheckins.length === 0 && !loading && (
        <div className={emptyContainerStyle}>
          {!auth.isAuthenticated
            ? (
              <div className={loginCardStyle}>
                <img
                  src="https://cdn.dropanchor.app/images/seagull-chest.png"
                  alt="Login required"
                  className={illustrationStyle}
                />
                <h3 className={emptyStateTitle}>
                  Sign in to see your check-ins
                </h3>
                <p
                  className={emptyStateText}
                  style={{ marginBottom: spacing.xxl }}
                >
                  Connect with your Bluesky account to see your check-ins.
                </p>
                <button
                  type="button"
                  onClick={onLogin}
                  className={buttonPrimaryPill}
                >
                  Sign in with Bluesky
                </button>
              </div>
            )
            : (
              <>
                <img
                  src="https://cdn.dropanchor.app/images/seagull-looking.png"
                  alt="Seagull looking around"
                  className={illustrationStyle}
                />
                <h3 className={emptyStateTitle}>
                  Your check-ins will appear here
                </h3>
                <p className={emptyStateText}>
                  When you create check-ins with the Anchor app, they'll appear
                  here.
                </p>
              </>
            )}
        </div>
      )}

      {localCheckins.length > 0 && (
        <div className={feedListStyle}>
          {localCheckins.map((checkin) => (
            <CheckinCard
              key={checkin.id}
              checkin={checkin}
              auth={auth}
              onDelete={handleDelete}
            />
          ))}

          <div ref={sentinelRef} style={{ height: "1px" }} />

          {loadingMore && (
            <div className={loadingMoreStyle}>
              <div className={loadingMoreContentStyle}>
                <div className={spinner(16)} />
                <span className={loadingMoreTextStyle}>Loading more...</span>
              </div>
            </div>
          )}

          {!hasMore && !loadingMore && localCheckins.length > 0 && (
            <div className={endMessageStyle}>You've reached the end</div>
          )}
        </div>
      )}
    </>
  );
}
