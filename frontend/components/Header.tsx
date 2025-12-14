/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState } from "../types/index.ts";
import {
  avatar,
  avatarFallback,
  dropdown,
  dropdownItemDanger,
  header,
  headerContent,
} from "../styles/components.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface HeaderProps {
  auth: AuthState;
  onLogin: () => void;
  onLogout: () => void;
  showUserDropdown: boolean;
  setShowUserDropdown: (show: boolean) => void;
}

const logoContainerStyle = css`
  display: flex;
  align-items: center;
  flex: 1;
`;

const logoStyle = css`
  height: 48px;
  width: auto;
  max-width: 200px;
`;

const actionsStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.lg};
  flex: 0 0 auto;
`;

const loginButtonStyle = css`
  background: ${colors.primary};
  color: white;
  border: none;
  padding: 10px ${spacing.xl};
  border-radius: ${radii.pill};
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  display: inline-flex;
  align-items: center;
  gap: ${spacing.sm};
  cursor: pointer;
  min-width: 80px;
  justify-content: center;
  transition: background ${transitions.normal};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

const userButtonStyle = css`
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: 24px;
  padding: 6px ${spacing.lg} 6px 6px;
  cursor: pointer;
  box-shadow: ${shadows.md};
  font-size: ${typography.sizes.base};
  color: ${colors.text};
  transition: all ${transitions.normal};

  &:hover {
    border-color: ${colors.textMuted};
  }
`;

const userNameStyle = css`
  font-weight: ${typography.weights.medium};
  white-space: nowrap;
`;

const chevronStyle = (isOpen: boolean) =>
  css`
    font-size: ${typography.sizes.xs};
    color: ${colors.textSecondary};
    transform: ${isOpen ? "rotate(180deg)" : "rotate(0deg)"};
    transition: transform ${transitions.normal};
  `;

export function Header({
  auth,
  onLogin,
  onLogout,
  showUserDropdown,
  setShowUserDropdown,
}: HeaderProps) {
  return (
    <div className={header}>
      <div className={headerContent}>
        <div className={logoContainerStyle}>
          <img
            src="https://cdn.dropanchor.app/images/anchor-logo.png"
            alt="Anchor"
            className={logoStyle}
          />
        </div>

        <div className={actionsStyle}>
          {!auth.isAuthenticated
            ? (
              <button
                type="button"
                onClick={onLogin}
                className={loginButtonStyle}
              >
                Login
              </button>
            )
            : (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className={userButtonStyle}
                >
                  {auth.userAvatar
                    ? (
                      <img
                        src={auth.userAvatar}
                        alt={auth.userDisplayName || auth.userHandle}
                        className={avatar(36)}
                      />
                    )
                    : (
                      <div className={avatarFallback(36, 16)}>
                        {(auth.userDisplayName || auth.userHandle)?.[0]
                          ?.toUpperCase() || "?"}
                      </div>
                    )}
                  <span className={userNameStyle}>
                    {auth.userDisplayName || auth.userHandle}
                  </span>
                  <div className={chevronStyle(showUserDropdown)}>▼</div>
                </button>

                {showUserDropdown && (
                  <div className={dropdown}>
                    <button
                      type="button"
                      onClick={onLogout}
                      className={dropdownItemDanger}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
