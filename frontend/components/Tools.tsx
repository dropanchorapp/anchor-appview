/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

const containerStyle = css`
  max-width: 680px;
`;

const sectionStyle = css`
  background: ${colors.surface};
  border-radius: ${radii.xl};
  padding: ${spacing.xxl};
  margin-bottom: ${spacing.xl};
`;

const headingStyle = css`
  font-size: ${typography.sizes.xxxl};
  font-weight: ${typography.weights.bold};
  color: ${colors.text};
  margin: 0 0 ${spacing.lg} 0;
`;

const paragraphStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textBody};
  line-height: ${typography.lineHeights.relaxed};
  margin: 0 0 ${spacing.lg} 0;

  &:last-child {
    margin-bottom: 0;
  }
`;

const toolCardStyle = css`
  display: flex;
  gap: ${spacing.lg};
  padding: ${spacing.lg};
  background: ${colors.surfaceHover};
  border-radius: ${radii.lg};
  margin-bottom: ${spacing.lg};
  border: 1px solid ${colors.borderLight};
  text-decoration: none;
  transition: all ${transitions.fast};

  &:hover {
    border-color: ${colors.primary};
    box-shadow: ${shadows.sm};
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const toolIconStyle = css`
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.primaryLight};
  border-radius: ${radii.lg};
  color: ${colors.primary};
`;

const toolContentStyle = css`
  flex: 1;
  min-width: 0;
`;

const toolTitleStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin: 0 0 ${spacing.xs} 0;
`;

const toolDescriptionStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  line-height: ${typography.lineHeights.normal};
  margin: 0;
`;

const badgeStyle = css`
  display: inline-block;
  font-size: ${typography.sizes.xs};
  font-weight: ${typography.weights.medium};
  color: ${colors.primary};
  background: ${colors.primaryLight};
  padding: ${spacing.xs} ${spacing.sm};
  border-radius: ${radii.pill};
  margin-left: ${spacing.sm};
`;

const MobileIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

const ImportIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export function Tools() {
  return (
    <div className={containerStyle}>
      <div className={sectionStyle}>
        <h1 className={headingStyle}>Tools</h1>
        <p className={paragraphStyle}>
          Additional tools and utilities to enhance your Anchor experience.
        </p>

        <a
          href="https://testflight.apple.com/join/gmSQv4Gh"
          target="_blank"
          rel="noopener noreferrer"
          className={toolCardStyle}
        >
          <div className={toolIconStyle}>
            <MobileIcon />
          </div>
          <div className={toolContentStyle}>
            <h3 className={toolTitleStyle}>
              Anchor for iOS
              <span className={badgeStyle}>Alpha</span>
            </h3>
            <p className={toolDescriptionStyle}>
              Native iOS app with GPS location detection and a streamlined
              check-in experience. Available via TestFlight - work in progress.
            </p>
          </div>
        </a>

        <a
          href="https://tangled.org/tijs.org/fsq2anchor"
          target="_blank"
          rel="noopener noreferrer"
          className={toolCardStyle}
        >
          <div className={toolIconStyle}>
            <ImportIcon />
          </div>
          <div className={toolContentStyle}>
            <h3 className={toolTitleStyle}>Foursquare Import</h3>
            <p className={toolDescriptionStyle}>
              Import your Foursquare/Swarm check-in history into Anchor. Migrate
              your location data to the AT Protocol.
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
