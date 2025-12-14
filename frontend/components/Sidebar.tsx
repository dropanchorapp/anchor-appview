/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState } from "../types/index.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface SidebarProps {
  auth: AuthState;
  onLogin: () => void;
  onLogout: () => void;
  onCreateCheckin: () => void;
  currentPath?: string;
  onNavigate?: () => void;
}

const sidebarContainerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const userPillStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  padding: ${spacing.md};
  margin-bottom: ${spacing.xl};
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: ${radii.xl};
  cursor: default;
`;

const userAvatarStyle = css`
  width: 44px;
  height: 44px;
  border-radius: ${radii.round};
  object-fit: cover;
  flex-shrink: 0;
`;

const userAvatarFallbackStyle = css`
  width: 44px;
  height: 44px;
  border-radius: ${radii.round};
  background: ${colors.avatarGradient};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  flex-shrink: 0;
`;

const userInfoStyle = css`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const userNameStyle = css`
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const userHandleStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const navListStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.xs};
  flex: 1;
`;

const navItemStyle = (isActive: boolean) =>
  css`
    display: flex;
    align-items: center;
    gap: ${spacing.md};
    padding: ${spacing.md} ${spacing.lg};
    border-radius: ${radii.lg};
    font-size: ${typography.sizes.base};
    font-weight: ${isActive
      ? typography.weights.semibold
      : typography.weights.medium};
    color: ${isActive ? colors.primary : colors.text};
    background: ${isActive ? colors.primaryLight : "transparent"};
    text-decoration: none;
    cursor: pointer;
    transition: all ${transitions.fast};
    border: none;
    width: 100%;
    text-align: left;

    &:hover {
      background: ${isActive ? colors.primaryLight : colors.surfaceHover};
    }

    svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
  `;

const logoutButtonStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  padding: ${spacing.md} ${spacing.lg};
  border-radius: ${radii.lg};
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.medium};
  color: ${colors.textSecondary};
  background: transparent;
  text-decoration: none;
  cursor: pointer;
  transition: all ${transitions.fast};
  border: none;
  width: 100%;
  text-align: left;
  margin-top: ${spacing.sm};

  &:hover {
    background: ${colors.surfaceHover};
    color: ${colors.error};
  }

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

const createButtonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm};
  padding: ${spacing.md} ${spacing.xl};
  margin-top: ${spacing.xl};
  background: ${colors.primary};
  color: white;
  border: none;
  border-radius: ${radii.pill};
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  cursor: pointer;
  transition: all ${transitions.normal};
  box-shadow: ${shadows.primary};

  &:hover {
    background: ${colors.primaryHover};
    transform: translateY(-1px);
    box-shadow: ${shadows.primaryHover};
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const loginButtonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm};
  padding: ${spacing.md} ${spacing.xl};
  margin-bottom: ${spacing.xl};
  background: ${colors.primary};
  color: white;
  border: none;
  border-radius: ${radii.pill};
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  cursor: pointer;
  transition: all ${transitions.normal};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

// SVG Icons
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const HelpIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
  </svg>
);

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export function Sidebar({
  auth,
  onLogin,
  onLogout,
  onCreateCheckin,
  currentPath = "/",
  onNavigate,
}: SidebarProps) {
  const handleNavClick = (path: string) => {
    if (onNavigate) {
      onNavigate();
    }
    if (globalThis.location?.pathname !== path) {
      globalThis.location.href = path;
    }
  };

  const isActive = (path: string) => {
    if (path === "/") {
      return currentPath === "/" || currentPath === "";
    }
    return currentPath.startsWith(path);
  };

  return (
    <div className={sidebarContainerStyle}>
      {/* User pill - only when authenticated */}
      {auth.isAuthenticated && (
        <div className={userPillStyle}>
          {auth.userAvatar
            ? (
              <img
                src={auth.userAvatar}
                alt={auth.userDisplayName || auth.userHandle}
                className={userAvatarStyle}
              />
            )
            : (
              <div className={userAvatarFallbackStyle}>
                {(auth.userDisplayName || auth.userHandle)?.[0]
                  ?.toUpperCase() ||
                  "?"}
              </div>
            )}
          <div className={userInfoStyle}>
            <span className={userNameStyle}>
              {auth.userDisplayName || auth.userHandle}
            </span>
            {auth.userHandle && (
              <span className={userHandleStyle}>@{auth.userHandle}</span>
            )}
          </div>
        </div>
      )}

      {/* Login button - only when not authenticated */}
      {!auth.isAuthenticated && (
        <button type="button" onClick={onLogin} className={loginButtonStyle}>
          Sign in with Bluesky
        </button>
      )}

      {/* Navigation */}
      <nav className={navListStyle}>
        <button
          type="button"
          onClick={() => handleNavClick("/")}
          className={navItemStyle(isActive("/"))}
        >
          <HomeIcon />
          <span>Feed</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavClick("/help")}
          className={navItemStyle(isActive("/help"))}
        >
          <HelpIcon />
          <span>Help</span>
        </button>

        {/* Logout - only when authenticated */}
        {auth.isAuthenticated && (
          <button
            type="button"
            onClick={onLogout}
            className={logoutButtonStyle}
          >
            <LogoutIcon />
            <span>Sign out</span>
          </button>
        )}
      </nav>

      {/* Create checkin button - only when authenticated */}
      {auth.isAuthenticated && (
        <button
          type="button"
          onClick={onCreateCheckin}
          className={createButtonStyle}
        >
          <PlusIcon />
          <span>New Check-in</span>
        </button>
      )}
    </div>
  );
}
