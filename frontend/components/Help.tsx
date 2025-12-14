/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  colors,
  radii,
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

const subheadingStyle = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin: ${spacing.xxl} 0 ${spacing.md} 0;

  &:first-of-type {
    margin-top: 0;
  }
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

const listStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textBody};
  line-height: ${typography.lineHeights.loose};
  padding-left: ${spacing.xl};
  margin: 0 0 ${spacing.lg} 0;

  li {
    margin-bottom: ${spacing.sm};
  }
`;

const linkStyle = css`
  color: ${colors.primary};
  text-decoration: none;
  transition: color ${transitions.fast};

  &:hover {
    text-decoration: underline;
  }
`;

const faqItemStyle = css`
  margin-bottom: ${spacing.xl};

  &:last-child {
    margin-bottom: 0;
  }
`;

const faqQuestionStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin: 0 0 ${spacing.sm} 0;
`;

const faqAnswerStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textBody};
  line-height: ${typography.lineHeights.relaxed};
  margin: 0;
`;

export function Help() {
  return (
    <div className={containerStyle}>
      <div className={sectionStyle}>
        <h1 className={headingStyle}>Help</h1>

        <h2 className={subheadingStyle}>What is Anchor?</h2>
        <p className={paragraphStyle}>
          Anchor is a personal location logging app built on the AT Protocol
          (the same network that powers Bluesky). Your check-ins are stored
          directly on your own Personal Data Server (PDS), giving you full
          control over your location history.
        </p>

        <h2 className={subheadingStyle}>How does it work?</h2>
        <p className={paragraphStyle}>
          When you create a check-in, Anchor writes the data directly to your
          PDS using the AT Protocol. This means:
        </p>
        <ul className={listStyle}>
          <li>
            <strong>You own your data</strong>{" "}
            - Check-ins are stored on your server, not ours
          </li>
          <li>
            <strong>Portability</strong>{" "}
            - You can move your data to any PDS that supports the protocol
          </li>
          <li>
            <strong>Transparency</strong>{" "}
            - Your check-ins use open lexicons that anyone can read
          </li>
        </ul>

        <h2 className={subheadingStyle}>Getting Started</h2>
        <p className={paragraphStyle}>
          To use Anchor, you need a Bluesky account. Sign in with your Bluesky
          handle to connect your PDS and start creating check-ins.
        </p>
        <p className={paragraphStyle}>
          For the best experience, download the{" "}
          <a
            href="https://testflight.apple.com/join/gmSQv4Gh"
            target="_blank"
            rel="noopener noreferrer"
            className={linkStyle}
          >
            iOS app via TestFlight
          </a>
          . The mobile app provides GPS-based location detection and a native
          check-in experience.
        </p>

        <h2 className={subheadingStyle}>Privacy Notice</h2>
        <p className={paragraphStyle}>
          Your location check-ins are stored unencrypted on your Personal Data
          Server and are publicly visible to anyone who knows how to query AT
          Protocol records. Only check in at locations you're comfortable
          sharing publicly.
        </p>
      </div>

      <div className={sectionStyle}>
        <h2 className={headingStyle}>FAQ</h2>

        <div className={faqItemStyle}>
          <h3 className={faqQuestionStyle}>
            Can I delete my check-ins?
          </h3>
          <p className={faqAnswerStyle}>
            Yes, you can delete any check-in you've created. The deletion will
            be reflected on your PDS immediately.
          </p>
        </div>

        <div className={faqItemStyle}>
          <h3 className={faqQuestionStyle}>
            Are my check-ins private?
          </h3>
          <p className={faqAnswerStyle}>
            No, check-ins are public and stored on your PDS. Anyone who knows
            your handle can query your check-in records using the AT Protocol.
            Only check in at locations you're comfortable sharing.
          </p>
        </div>

        <div className={faqItemStyle}>
          <h3 className={faqQuestionStyle}>
            What data is collected?
          </h3>
          <p className={faqAnswerStyle}>
            Anchor only stores OAuth session data to keep you logged in. All
            check-in data (locations, photos, text) is stored directly on your
            PDS - we don't keep copies of your check-ins.
          </p>
        </div>

        <div className={faqItemStyle}>
          <h3 className={faqQuestionStyle}>
            Can I use Anchor without Bluesky?
          </h3>
          <p className={faqAnswerStyle}>
            Anchor requires a Bluesky account (or any AT Protocol-compatible
            PDS) for authentication and data storage. We plan to support more
            PDS providers as the AT Protocol ecosystem grows.
          </p>
        </div>

        <div className={faqItemStyle}>
          <h3 className={faqQuestionStyle}>
            Is Anchor open source?
          </h3>
          <p className={faqAnswerStyle}>
            Yes! Both the{" "}
            <a
              href="https://github.com/dropanchorapp/Anchor"
              target="_blank"
              rel="noopener noreferrer"
              className={linkStyle}
            >
              iOS app
            </a>{" "}
            and{" "}
            <a
              href="https://github.com/dropanchorapp/anchor-appview"
              target="_blank"
              rel="noopener noreferrer"
              className={linkStyle}
            >
              web app
            </a>{" "}
            are open source. Contributions are welcome!
          </p>
        </div>
      </div>
    </div>
  );
}
