/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  alertWarning,
  buttonPrimaryLarge,
  heading1,
  heading2,
  heading3,
  textBody,
  textSecondary,
} from "../styles/components.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface AboutProps {
  onLogin: () => void;
}

const containerStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xxl};
  padding: ${spacing.xxl};
`;

const heroStyle = css`
  text-align: center;
  margin-bottom: ${spacing.xxxxl};
`;

const heroImageStyle = css`
  width: 200px;
  height: auto;
  margin-bottom: ${spacing.xl};
`;

const heroTitleStyle = css`
  ${heading1} margin: 0 0 ${spacing.md} 0;
`;

const heroSubtitleStyle = css`
  font-size: ${typography.sizes.xl};
  color: ${colors.textSecondary};
  margin: 0;
  line-height: ${typography.lineHeights.relaxed};
`;

const sectionStyle = css`
  margin-bottom: ${spacing.xxxl};
`;

const sectionTitleStyle = css`
  ${heading2} margin: 0 0 ${spacing.lg} 0;
`;

const paragraphStyle = css`
  ${textBody} margin: 0 0 ${spacing.lg} 0;
`;

const listStyle = css`
  font-size: ${typography.sizes.lg};
  color: ${colors.textBody};
  line-height: ${typography.lineHeights.loose};
  padding-left: ${spacing.xl};
`;

const listItemStyle = css`
  margin-bottom: ${spacing.sm};
`;

const privacyNoticeStyle = css`
  ${alertWarning} margin-bottom: ${spacing.xxxl};
`;

const privacyTitleStyle = css`
  ${heading3} color: ${colors.warningText};
  margin: 0 0 ${spacing.sm} 0;
`;

const privacyTextStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.warningText};
  line-height: ${typography.lineHeights.relaxed};
  margin: 0;
`;

const subsectionTitleStyle = css`
  ${heading3} margin: 0 0 ${spacing.sm} 0;
`;

const buttonRowStyle = css`
  display: flex;
  gap: ${spacing.md};
  flex-wrap: wrap;
`;

const primaryLinkStyle = css`
  background: ${colors.primary};
  color: white;
  text-decoration: none;
  padding: 10px ${spacing.lg};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.semibold};
  display: inline-block;
  transition: all ${transitions.normal};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

const secondaryLinkStyle = css`
  background: ${colors.background};
  color: ${colors.primary};
  text-decoration: none;
  padding: 10px ${spacing.lg};
  border-radius: ${radii.md};
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.semibold};
  display: inline-block;
  border: 1px solid ${colors.border};
  transition: all ${transitions.normal};

  &:hover {
    background: ${colors.border};
  }
`;

const ctaContainerStyle = css`
  text-align: center;
  padding-top: ${spacing.xl};
`;

const ctaButtonStyle = css`
  ${buttonPrimaryLarge} padding: ${spacing.lg} ${spacing.xxxl};
  font-size: ${typography.sizes.xl};
  box-shadow: ${shadows.primary};

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: ${shadows.primaryHover};
  }
`;

const ctaHelpTextStyle = css`
  ${textSecondary} margin: ${spacing.md} 0 0 0;
`;

const linkStyle = css`
  color: ${colors.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

export function About({ onLogin }: AboutProps) {
  return (
    <div className={containerStyle}>
      <div className={heroStyle}>
        <img
          src="https://cdn.dropanchor.app/images/seagull-looking.png"
          alt="Anchor Logo"
          className={heroImageStyle}
        />
        <h1 className={heroTitleStyle}>Anchor</h1>
        <p className={heroSubtitleStyle}>
          Your personal location logger, powered by the AT Protocol
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={sectionTitleStyle}>What is Anchor?</h2>
        <p className={paragraphStyle}>
          Anchor is a personal location journal that stores your check-ins
          directly on{" "}
          <strong>your own Personal Data Server (PDS)</strong>. Your location
          history is yours to keep and control.
        </p>
        <p className={paragraphStyle} style={{ marginBottom: 0 }}>
          Optionally share individual check-ins with friends on Bluesky when you
          want to, but by default your journal is just for you.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={sectionTitleStyle}>Key Features</h2>
        <ul className={listStyle}>
          <li className={listItemStyle}>
            <strong>Your Data, Your Server</strong>{" "}
            - Check-ins are stored on your personal AT Protocol server
          </li>
          <li className={listItemStyle}>
            <strong>Open Protocol</strong>{" "}
            - Built on the decentralized AT Protocol network
          </li>
          <li className={listItemStyle}>
            <strong>Optional Sharing</strong>{" "}
            - Share individual check-ins on Bluesky when you choose to
          </li>
          <li className={listItemStyle}>
            <strong>Rich Location Data</strong>{" "}
            - Detailed venue information and interactive maps
          </li>
        </ul>
      </div>

      <div className={privacyNoticeStyle}>
        <h3 className={privacyTitleStyle}>🔒 Privacy Notice</h3>
        <p className={privacyTextStyle}>
          Your location check-ins are stored unencrypted on your Personal Data
          Server and are publicly visible to anyone who knows how to query AT
          Protocol records. Only check in at locations you're comfortable
          sharing publicly.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={sectionTitleStyle}>Get Started</h2>

        <div style={{ marginBottom: spacing.xl }}>
          <h3 className={subsectionTitleStyle}>📱 iOS App</h3>
          <p className={paragraphStyle}>
            Download the Anchor iOS app to start logging your locations:
          </p>
          <div className={buttonRowStyle}>
            <a
              href="https://testflight.apple.com/join/gmSQv4Gh"
              target="_blank"
              rel="noopener noreferrer"
              className={primaryLinkStyle}
            >
              📥 TestFlight Beta
            </a>
            <a
              href="https://github.com/dropanchorapp/Anchor"
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryLinkStyle}
            >
              📱 iOS Source Code
            </a>
          </div>
        </div>

        <div>
          <h3 className={subsectionTitleStyle}>🌐 Web & API</h3>
          <p className={paragraphStyle}>
            Explore the web interface and API source code:
          </p>
          <a
            href="https://github.com/dropanchorapp/anchor-appview"
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryLinkStyle}
          >
            💻 Web Source Code
          </a>
        </div>
      </div>

      <div className={ctaContainerStyle}>
        <button type="button" onClick={onLogin} className={ctaButtonStyle}>
          Sign in with Bluesky to get started
        </button>
        <p className={ctaHelpTextStyle}>
          You'll need a Bluesky account to use Anchor
        </p>
        <p className={ctaHelpTextStyle}>
          By using Anchor, you agree to our{" "}
          <a href="/privacy-policy" className={linkStyle}>
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
