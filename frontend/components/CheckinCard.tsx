/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState, CheckinData } from "../types/index.ts";
import { apiDelete } from "../utils/api.ts";
import { avatar, avatarFallback, locationBadge } from "../styles/components.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface CheckinCardProps {
  checkin: CheckinData;
  auth: AuthState;
  onDelete?: (checkinId: string) => void;
}

const cardStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xl};
  box-shadow: ${shadows.sm};
  padding: ${spacing.lg};
  cursor: pointer;
  transition: transform ${transitions.fast}, box-shadow ${transitions.fast};
  position: relative;

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${shadows.lg};
  }

  &:hover .arrow-indicator {
    color: ${colors.primary};
  }
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  margin-bottom: ${spacing.md};
`;

const authorInfoStyle = css`
  flex: 1;
`;

const displayNameStyle = css`
  font-weight: ${typography.weights.semibold};
  font-size: ${typography.sizes.base};
  color: ${colors.text};
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
`;

const handleStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
`;

const metaStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
`;

const timeStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
`;

const arrowStyle = css`
  font-size: ${typography.sizes.xs};
  color: ${colors.textMuted};
  transition: color ${transitions.fast};
`;

const contentStyle = css`
  margin-bottom: ${spacing.md};
`;

const textStyle = css`
  font-size: ${typography.sizes.base};
  line-height: ${typography.lineHeights.normal};
  color: ${colors.text};
  margin-bottom: ${spacing.md};
`;

const imageContainerStyle = css`
  margin-bottom: ${spacing.md};
  width: 120px;
  height: 120px;
  border-radius: ${radii.md};
  overflow: hidden;
  border: 1px solid ${colors.border};
`;

const imageStyle = css`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const likesStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  margin-top: ${spacing.sm};
`;

const deleteButtonStyle = css`
  position: absolute;
  bottom: ${spacing.md};
  right: ${spacing.md};
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  color: ${colors.error};
  padding: ${spacing.sm};
  border-radius: ${radii.sm};
  transition: all ${transitions.normal};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  box-shadow: ${shadows.sm};

  &:hover:not(:disabled) {
    background: ${colors.errorLight};
    transform: scale(1.05);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    color: ${colors.textMuted};
  }
`;

const beaconBitsLinkStyle = css`
  display: flex;

  &:hover svg {
    opacity: 0.8;
  }
`;

export function CheckinCard({ checkin, auth, onDelete }: CheckinCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClick = () => {
    globalThis.location.href = `/checkins/${checkin.author.did}/${checkin.id}`;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this check-in?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await apiDelete(
        `/api/checkins/${checkin.author.did}/${checkin.id}`,
      );

      if (response.ok) {
        if (onDelete) {
          onDelete(checkin.id);
        } else {
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

  const canDelete = auth.isAuthenticated && auth.userDid === checkin.author.did;

  const formatTime = () => {
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
  };

  return (
    <div onClick={handleClick} className={cardStyle}>
      <div className={headerStyle}>
        {checkin.author.avatar
          ? (
            <img
              src={checkin.author.avatar}
              alt={checkin.author.displayName || checkin.author.handle}
              className={avatar(40)}
            />
          )
          : (
            <div className={avatarFallback(40, 16)}>
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
                onClick={(e) => e.stopPropagation()}
              >
                <svg viewBox="0 0 705 704" width="14" height="14" fill="none">
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

        <div className={metaStyle}>
          <time className={timeStyle}>{formatTime()}</time>
          <span className={`${arrowStyle} arrow-indicator`}>→</span>
        </div>
      </div>

      <div className={contentStyle}>
        {checkin.text && <div className={textStyle}>{checkin.text}</div>}

        {checkin.image && (
          <div className={imageContainerStyle}>
            <img
              src={checkin.image.thumbUrl}
              alt={checkin.image.alt || "Check-in photo"}
              className={imageStyle}
            />
          </div>
        )}

        {(checkin.address || checkin.coordinates) && (
          <div className={locationBadge}>
            <span style={{ fontSize: typography.sizes.xs }}>📍</span>
            <span>
              {checkin.address
                ? [checkin.address.name, checkin.address.locality]
                  .filter(Boolean)
                  .join(", ")
                : checkin.coordinates
                ? `${checkin.coordinates.latitude.toFixed(4)}, ${
                  checkin.coordinates.longitude.toFixed(4)
                }`
                : ""}
            </span>
          </div>
        )}

        {checkin.likesCount && checkin.likesCount > 0 && (
          <div className={likesStyle}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              style={{ opacity: 0.8 }}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{checkin.likesCount}</span>
          </div>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className={deleteButtonStyle}
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
            {isDeleting ? <circle cx="12" cy="12" r="10" opacity="0.25" /> : (
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
