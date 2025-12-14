/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { colors, spacing, transitions, typography } from "../styles/theme.ts";

// Portal target ID for page-specific sidebar content
export const SIDEBAR_PORTAL_ID = "right-sidebar-portal";

const sidebarContainerStyle = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-left: ${spacing.xl};
`;

const portalContainerStyle = css`
  /* Portal content appears at top of sidebar */
`;

const spacerStyle = css`
  flex: 1;
`;

const footerLinksStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
  padding: ${spacing.lg} 0;
  border-top: 1px solid ${colors.borderLight};
`;

const footerLinkStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  text-decoration: none;
  transition: color ${transitions.fast};

  &:hover {
    color: ${colors.primary};
  }
`;

const copyrightStyle = css`
  font-size: ${typography.sizes.xs};
  color: ${colors.textMuted};
  margin-top: ${spacing.md};
`;

export function RightSidebar() {
  return (
    <div className={sidebarContainerStyle}>
      {/* Portal target for page-specific content (e.g., share actions) */}
      <div id={SIDEBAR_PORTAL_ID} className={portalContainerStyle} />

      {/* Spacer pushes footer to bottom */}
      <div className={spacerStyle} />

      {/* Footer links */}
      <div className={footerLinksStyle}>
        <a
          href="https://bsky.app/profile/dropanchor.app"
          target="_blank"
          rel="noopener noreferrer"
          className={footerLinkStyle}
        >
          Feedback
        </a>
        <a href="/privacy-policy" className={footerLinkStyle}>
          Privacy Policy
        </a>
        <a href="/terms" className={footerLinkStyle}>
          Terms of Service
        </a>
        <span className={copyrightStyle}>
          {new Date().getFullYear()} Anchor
        </span>
      </div>
    </div>
  );
}
