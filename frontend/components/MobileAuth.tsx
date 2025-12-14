/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, { useEffect, useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  buttonPrimaryLarge,
  label,
  spinnerWhite,
} from "../styles/components.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

const pageStyle = css`
  min-height: 100vh;
  background: ${colors.background};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl};
`;

const cardStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xxl};
  padding: 60px ${spacing.xxxxl};
  max-width: 400px;
  width: 100%;
  box-shadow: ${shadows.lg};
  text-align: center;
`;

const logoContainerStyle = css`
  width: 160px;
  height: 160px;
  margin: 0 auto ${spacing.xxl};
  display: flex;
  align-items: center;
  justify-content: center;
`;

const logoStyle = css`
  width: 160px;
  height: 160px;
  object-fit: contain;
`;

const titleStyle = css`
  font-size: 28px;
  font-weight: ${typography.weights.bold};
  margin-bottom: ${spacing.sm};
  color: ${colors.text};
`;

const subtitleStyle = css`
  color: ${colors.textSecondary};
  margin-bottom: ${spacing.xxxl};
  font-size: ${typography.sizes.lg};
  line-height: ${typography.lineHeights.normal};
`;

const errorStyle = css`
  background: ${colors.error};
  color: white;
  padding: ${spacing.md};
  border-radius: ${radii.md};
  margin-bottom: ${spacing.xl};
  font-size: ${typography.sizes.md};
`;

const formGroupStyle = css`
  margin-bottom: ${spacing.xl};
  text-align: left;
`;

const inputStyle = css`
  width: 100%;
  padding: ${spacing.lg};
  border: 2px solid ${colors.background};
  border-radius: ${radii.xl};
  font-size: ${typography.sizes.lg};
  background: #f9f9f9;
  transition: all ${transitions.normal};
  box-sizing: border-box;
  color: ${colors.text};
  outline: none;

  &:focus {
    border-color: ${colors.primary};
    background: ${colors.surface};
    box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.1);
  }

  &::placeholder {
    color: ${colors.textMuted};
  }
`;

const buttonStyle = css`
  ${buttonPrimaryLarge} width: 100%;
  padding: ${spacing.lg};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }
`;

const footerStyle = css`
  margin-top: ${spacing.xxxl};
  padding-top: ${spacing.xxl};
  border-top: 1px solid ${colors.background};
  color: ${colors.textSecondary};
  font-size: ${typography.sizes.md};
`;

export function MobileAuth() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    injectGlobalStyles();
  }, []);

  const generatePKCE = async () => {
    const array = new Uint8Array(96);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeChallenge = btoa(String.fromCharCode(...hashArray))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    return { codeVerifier, codeChallenge };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!handle.trim()) {
      setError("Please enter your Bluesky handle");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem("pkce_code_verifier", codeVerifier);

      const response = await fetch("/api/auth/mobile-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          handle: handle.trim(),
          code_challenge: codeChallenge,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start authentication");
      }

      const data = await response.json();

      if (data.authUrl) {
        globalThis.location.href = data.authUrl;
      } else {
        throw new Error("No authorization URL received");
      }
    } catch (error) {
      console.error("Login failed:", error);
      setError("Login failed. Please check your handle and try again.");
      setLoading(false);
    }
  };

  return (
    <div className={pageStyle}>
      <div className={cardStyle}>
        <div className={logoContainerStyle}>
          <img
            src="https://cdn.dropanchor.app/images/anchor-logo.png"
            alt="Anchor Logo"
            className={logoStyle}
          />
        </div>

        <h1 className={titleStyle}>Sign in to Anchor</h1>

        <p className={subtitleStyle}>Connect with your Bluesky account</p>

        {error && <div className={errorStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={formGroupStyle}>
            <label htmlFor="handle" className={label}>
              Bluesky Handle
            </label>
            <input
              type="text"
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice.bsky.social"
              autoComplete="username"
              required
              className={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={buttonStyle}
          >
            {loading
              ? (
                <>
                  <div className={spinnerWhite(20)} />
                  Signing in...
                </>
              )
              : (
                "Sign in with Bluesky"
              )}
          </button>
        </form>

        <div className={footerStyle}>Powered by AT Protocol</div>
      </div>
    </div>
  );
}
