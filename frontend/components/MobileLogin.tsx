/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, {
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  buttonPrimaryLarge,
  input,
  label,
  spinnerWhite,
} from "../styles/components.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../styles/theme.ts";

interface MobileLoginProps {
  redirectUri: string;
}

const pageStyle = css`
  min-height: 100vh;
  background: ${colors.background};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl};
  font-family: ${typography.fontFamily};
`;

const cardStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xxl};
  box-shadow: ${shadows.md};
  padding: ${spacing.xxxxl};
  width: 100%;
  max-width: 400px;
`;

const headerStyle = css`
  text-align: center;
  margin-bottom: ${spacing.xxxl};
`;

const logoStyle = css`
  height: 64px;
  width: auto;
  margin-bottom: ${spacing.lg};
`;

const titleStyle = css`
  font-size: ${typography.sizes.xxxl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin: 0 0 ${spacing.sm} 0;
`;

const subtitleStyle = css`
  color: ${colors.textSecondary};
  font-size: ${typography.sizes.lg};
  margin: 0 0 ${spacing.xxxl} 0;
  line-height: ${typography.lineHeights.normal};
`;

const formGroupStyle = css`
  margin-bottom: ${spacing.xxl};
`;

const inputLargeStyle = css`
  ${input} border-radius: ${radii.xl};
`;

const buttonFullWidth = css`
  ${buttonPrimaryLarge} width: 100%;
  padding: 14px;
`;

const errorStyle = css`
  color: ${colors.error};
  font-size: ${typography.sizes.md};
  margin-top: ${spacing.md};
  text-align: center;
  padding: ${spacing.sm};
  background: rgba(255, 59, 48, 0.1);
  border-radius: ${radii.md};
`;

const securityNoteStyle = css`
  margin-top: ${spacing.xxl};
  padding: ${spacing.lg};
  background: rgba(52, 199, 89, 0.1);
  border-radius: ${radii.xl};
  text-align: center;
`;

const securityHeaderStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm};
  margin-bottom: ${spacing.sm};
`;

const securityIconStyle = css`
  color: ${colors.success};
  font-size: ${typography.sizes.lg};
`;

const securityTitleStyle = css`
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.medium};
  color: ${colors.text};
`;

const securityTextStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  margin: 0;
  line-height: ${typography.lineHeights.normal};
`;

const typeaheadStyle = css`
  --color-background: ${colors.surface};
  --color-border: ${colors.border};
  --color-hover: ${colors.surfaceHover};
  --color-avatar-fallback: ${colors.surfaceActive};
  --radius: ${radii.xl};
  --padding-menu: ${spacing.xs};
`;

export function MobileLogin({ redirectUri }: MobileLoginProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    injectGlobalStyles();
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (e: Event) =>
      setHandle((e.target as HTMLInputElement).value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!handle.trim()) {
      setError("Please enter your Bluesky handle");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        handle: handle.trim(),
        redirect_uri: redirectUri,
      });

      globalThis.location.href = `/mobile/login?${params.toString()}`;
    } catch (_err) {
      setError("Failed to connect. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className={pageStyle}>
      <div className={cardStyle}>
        <div className={headerStyle}>
          <img
            src="https://cdn.dropanchor.app/images/anchor-logo.png"
            alt="Anchor"
            className={logoStyle}
          />
          <h1 className={titleStyle}>Sign in to Anchor</h1>
          <p className={subtitleStyle}>
            Enter your Bluesky handle to continue
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={formGroupStyle}>
            <label htmlFor="handle" className={label}>
              Bluesky Handle
            </label>
            <actor-typeahead className={typeaheadStyle}>
              <input
                ref={inputRef}
                type="text"
                id="handle"
                name="handle"
                defaultValue={handle}
                placeholder="username.bsky.social or your.domain"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={loading}
                className={inputLargeStyle}
              />
            </actor-typeahead>
          </div>

          <button
            type="submit"
            disabled={loading || !handle.trim()}
            className={buttonFullWidth}
          >
            {loading && <div className={spinnerWhite(16)} />}
            {loading ? "Connecting..." : "Continue with Bluesky"}
          </button>

          {error && <div className={errorStyle}>{error}</div>}
        </form>

        <div className={securityNoteStyle}>
          <div className={securityHeaderStyle}>
            <span className={securityIconStyle}>🔒</span>
            <span className={securityTitleStyle}>Secure Authentication</span>
          </div>
          <p className={securityTextStyle}>
            Your password will be entered securely on Bluesky's servers. Anchor
            never sees your password.
          </p>
        </div>
      </div>
    </div>
  );
}
