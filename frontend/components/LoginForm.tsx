/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  buttonPrimary,
  buttonText,
  flexBetween,
  heading2,
  helperText,
  input,
  label,
  modalContentSmall,
  modalOverlayDark,
} from "../styles/components.ts";
import {
  colors,
  radii,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface LoginFormProps {
  showLoginForm: boolean;
  setShowLoginForm: (show: boolean) => void;
  loginHandle: string;
  setLoginHandle: (handle: string) => void;
  loginLoading: boolean;
  onSubmitLogin: (e: React.FormEvent) => void;
}

const closeButtonStyle = css`
  background: none;
  border: none;
  font-size: ${typography.sizes.xl};
  color: ${colors.textSecondary};
  cursor: pointer;
  padding: ${spacing.xs};
  border-radius: ${radii.xl};
  transition: background ${transitions.fast};

  &:hover {
    background: ${colors.background};
  }
`;

const formGroupStyle = css`
  margin-bottom: ${spacing.xxl};
`;

const footerStyle = css`
  display: flex;
  gap: ${spacing.md};
  justify-content: flex-end;
`;

export function LoginForm({
  showLoginForm,
  setShowLoginForm,
  loginHandle,
  setLoginHandle,
  loginLoading,
  onSubmitLogin,
}: LoginFormProps) {
  if (!showLoginForm) return null;

  return (
    <div
      className={modalOverlayDark}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowLoginForm(false);
        }
      }}
    >
      <div
        className={modalContentSmall}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={flexBetween} style={{ marginBottom: spacing.xxl }}>
          <h2 className={heading2}>Sign in with Bluesky</h2>
          <button
            type="button"
            onClick={() => setShowLoginForm(false)}
            className={closeButtonStyle}
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmitLogin}>
          <div className={formGroupStyle}>
            <label className={label}>Bluesky Handle</label>
            <input
              type="text"
              value={loginHandle}
              onChange={(e) => setLoginHandle(e.target.value)}
              placeholder="your-handle.bsky.social"
              required
              className={input}
            />
            <p className={helperText}>
              Enter your Bluesky handle (e.g., alice.bsky.social)
            </p>
          </div>

          <div className={footerStyle}>
            <button
              type="button"
              onClick={() => setShowLoginForm(false)}
              className={buttonText}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loginLoading}
              className={buttonPrimary}
            >
              {loginLoading ? "Connecting..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
