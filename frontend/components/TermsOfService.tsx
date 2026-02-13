/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  alertWarning,
  buttonPrimary,
  cardLarge,
  heading1,
  heading2,
} from "../styles/components.ts";
import { colors, spacing, typography } from "../styles/theme.ts";

const containerStyle = css`
  ${cardLarge} margin: ${spacing.xl} auto;
  max-width: 800px;
`;

const headerStyle = css`
  text-align: center;
  margin-bottom: ${spacing.xxxxl};
`;

const titleStyle = css`
  ${heading1} margin: 0 0 ${spacing.md} 0;
`;

const lastUpdatedStyle = css`
  font-size: ${typography.sizes.lg};
  color: ${colors.textSecondary};
  margin: 0;
  line-height: ${typography.lineHeights.relaxed};
`;

const contentStyle = css`
  line-height: ${typography.lineHeights.loose};
  font-size: ${typography.sizes.lg};
  color: ${colors.textBody};
`;

const sectionStyle = css`
  margin-bottom: ${spacing.xxxl};
`;

const sectionTitleStyle = css`
  ${heading2} margin-bottom: ${spacing.lg};
`;

const paragraphStyle = css`
  margin-bottom: ${spacing.lg};
`;

const listStyle = css`
  padding-left: ${spacing.xxl};
  margin-bottom: ${spacing.lg};
`;

const listItemStyle = css`
  margin-bottom: ${spacing.sm};
`;

const noticeStyle = css`
  ${alertWarning} margin-top: ${spacing.xxxl};
  padding: ${spacing.xl};
`;

const noticeTitleStyle = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.bold};
  color: ${colors.warningText};
  margin: 0 0 ${spacing.md} 0;
`;

const noticeTextStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.warningText};
  line-height: ${typography.lineHeights.loose};
  margin: 0;
`;

const linkStyle = css`
  color: ${colors.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const footerStyle = css`
  text-align: center;
  margin-top: ${spacing.xxxxl};
`;

const backLinkStyle = css`
  ${buttonPrimary} text-decoration: none;
  display: inline-block;

  &:hover {
    background: ${colors.primaryHover};
  }
`;

export function TermsOfService() {
  return (
    <div className={containerStyle}>
      <div className={headerStyle}>
        <h1 className={titleStyle}>Terms of Service</h1>
        <p className={lastUpdatedStyle}>
          Last updated: {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className={contentStyle}>
        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Agreement to Terms</h2>
          <p className={paragraphStyle}>
            By accessing or using Anchor, you agree to be bound by these Terms
            of Service. If you do not agree to these terms, please do not use
            the service.
          </p>
          <p className={paragraphStyle}>
            Anchor is a personal location journal built on the AT Protocol (the
            decentralized network that powers Bluesky). Your use of Anchor also
            means you accept the terms of your AT Protocol identity provider
            (such as Bluesky).
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Service Description</h2>
          <p className={paragraphStyle}>
            Anchor allows you to create and share location check-ins. The
            service:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Stores check-in data directly on your Personal Data Server (PDS),
              not on our servers
            </li>
            <li className={listItemStyle}>
              Reads check-in data from your PDS and the PDS of users you follow
              to display feeds
            </li>
            <li className={listItemStyle}>
              Provides venue search functionality via third-party mapping
              services
            </li>
            <li className={listItemStyle}>
              Manages authentication sessions to keep you logged in
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Service Provided "As Is"</h2>
          <p className={paragraphStyle}>
            <strong>
              Anchor is provided on an "as is" and "as available" basis without
              warranties of any kind.
            </strong>{" "}
            We do not guarantee that the service will be uninterrupted, secure,
            or error-free.
          </p>
          <p className={paragraphStyle}>
            Specifically, we make no warranties regarding:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              The accuracy, reliability, or completeness of any information
              provided through the service
            </li>
            <li className={listItemStyle}>
              The availability or uptime of the service
            </li>
            <li className={listItemStyle}>
              The security or integrity of data stored on your PDS or
              transmitted through the service
            </li>
            <li className={listItemStyle}>
              The accuracy of location data, venue information, or mapping
              services
            </li>
            <li className={listItemStyle}>
              Compatibility with any particular device, browser, or software
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Your Responsibilities</h2>
          <p className={paragraphStyle}>By using Anchor, you agree to:</p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              <strong>Provide accurate information:</strong>{" "}
              You are responsible for the accuracy of the location data and
              content you share
            </li>
            <li className={listItemStyle}>
              <strong>Respect others:</strong>{" "}
              Do not use the service to harass, stalk, or harm others
            </li>
            <li className={listItemStyle}>
              <strong>Protect your account:</strong>{" "}
              Keep your AT Protocol credentials secure
            </li>
            <li className={listItemStyle}>
              <strong>Comply with laws:</strong>{" "}
              Use the service in accordance with applicable laws and regulations
            </li>
            <li className={listItemStyle}>
              <strong>Understand public visibility:</strong>{" "}
              Location check-ins are publicly accessible on the AT Protocol
              network
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Data and Privacy</h2>
          <p className={paragraphStyle}>
            Your location check-ins are stored on your Personal Data Server
            (PDS), which you control. Anchor does not store your check-in data
            on our servers. For complete details about how your data is handled,
            please read our{" "}
            <a href="/privacy-policy" className={linkStyle}>
              Privacy Policy
            </a>
            .
          </p>
          <p className={paragraphStyle}>
            <strong>Important:</strong>{" "}
            By design of the AT Protocol, your check-ins are publicly
            accessible. Only check in at locations you are comfortable sharing
            publicly.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Limitation of Liability</h2>
          <p className={paragraphStyle}>
            <strong>
              To the maximum extent permitted by law, Anchor and its operators
              shall not be liable for any damages arising from your use of the
              service.
            </strong>
          </p>
          <p className={paragraphStyle}>
            This includes, but is not limited to:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Direct, indirect, incidental, consequential, or punitive damages
            </li>
            <li className={listItemStyle}>
              Loss of data, profits, or business opportunities
            </li>
            <li className={listItemStyle}>
              Damages resulting from unauthorized access to your account or data
            </li>
            <li className={listItemStyle}>
              Damages arising from third-party services (AT Protocol, mapping
              providers, PDS operators)
            </li>
            <li className={listItemStyle}>
              Personal injury or property damage related to your use of location
              features
            </li>
          </ul>
          <p className={paragraphStyle}>
            You use Anchor at your own risk. We are not responsible for any
            consequences arising from sharing your location publicly.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Indemnification</h2>
          <p className={paragraphStyle}>
            You agree to indemnify and hold harmless Anchor and its operators
            from any claims, damages, or expenses (including legal fees) arising
            from:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>Your use of the service</li>
            <li className={listItemStyle}>
              Content you create or share through the service
            </li>
            <li className={listItemStyle}>
              Your violation of these terms or any applicable laws
            </li>
            <li className={listItemStyle}>
              Your violation of any third party's rights
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Service Changes and Termination</h2>
          <p className={paragraphStyle}>We reserve the right to:</p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Modify, suspend, or discontinue the service at any time without
              notice
            </li>
            <li className={listItemStyle}>
              Restrict or terminate access to users who violate these terms
            </li>
            <li className={listItemStyle}>
              Update these terms at any time (continued use constitutes
              acceptance)
            </li>
          </ul>
          <p className={paragraphStyle}>
            Since your data is stored on your PDS (not our servers), you retain
            access to your check-ins even if the Anchor service is discontinued.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Third-Party Services</h2>
          <p className={paragraphStyle}>
            Anchor integrates with third-party services that have their own
            terms:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              <strong>AT Protocol / Bluesky:</strong>{" "}
              For identity and data storage
            </li>
            <li className={listItemStyle}>
              <strong>OpenStreetMap:</strong> For venue and location data
            </li>
            <li className={listItemStyle}>
              <strong>Your PDS provider:</strong> For data storage and retrieval
            </li>
          </ul>
          <p className={paragraphStyle}>
            We are not responsible for the availability, accuracy, or policies
            of these third-party services.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Intellectual Property</h2>
          <p className={paragraphStyle}>
            The Anchor name, logo, and service design are the property of their
            respective owners. The content you create (check-ins, text, photos)
            remains yours, stored on your PDS under your control.
          </p>
          <p className={paragraphStyle}>
            Anchor is open source software. See our{" "}
            <a
              href="https://github.com/dropanchorapp/anchor-appview"
              target="_blank"
              rel="noopener noreferrer"
              className={linkStyle}
            >
              GitHub repository
            </a>{" "}
            for license details.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Contact</h2>
          <p className={paragraphStyle}>
            Questions about these terms can be directed to:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Our{" "}
              <a
                href="https://github.com/dropanchorapp/anchor-appview"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                GitHub repository
              </a>
            </li>
            <li className={listItemStyle}>
              <a
                href="https://bsky.app/profile/dropanchor.app"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                @dropanchor.app
              </a>{" "}
              on Bluesky
            </li>
          </ul>
        </section>

        <div className={noticeStyle}>
          <h3 className={noticeTitleStyle}>Summary</h3>
          <p className={noticeTextStyle}>
            Anchor is provided as-is without warranties. Your data lives on your
            PDS, not our servers. Location check-ins are public by design. Use
            responsibly, and only share locations you're comfortable making
            public. By using Anchor, you accept these terms and assume all
            associated risks.
          </p>
        </div>

        <div className={footerStyle}>
          <a href="/" className={backLinkStyle}>
            Back to Anchor
          </a>
        </div>
      </div>
    </div>
  );
}
