/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  alertWarning,
  buttonPrimary,
  cardLarge,
  heading1,
  heading2,
  heading3,
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

const subsectionTitleStyle = css`
  ${heading3} margin-bottom: ${spacing.md};
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
  ${heading3} color: ${colors.warningText};
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

export function PrivacyPolicy() {
  return (
    <div className={containerStyle}>
      <div className={headerStyle}>
        <h1 className={titleStyle}>Privacy Policy</h1>
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
          <h2 className={sectionTitleStyle}>Overview</h2>
          <p className={paragraphStyle}>
            Anchor is a personal location logging application built on the
            decentralized AT Protocol network. All location check-ins are stored
            exclusively on your Personal Data Server (PDS), which you control.
            Anchor's servers do not store or cache your check-in data. This
            privacy policy explains how your data is handled within this
            decentralized architecture.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Data Storage and Ownership</h2>
          <p className={paragraphStyle}>
            <strong>Your Data, Your Server:</strong>{" "}
            All location check-ins are stored exclusively on your Personal Data
            Server (PDS), which you control. Anchor's servers read your
            check-ins directly from your PDS when displaying feeds—we do not
            store or cache your location data.
          </p>
          <p className={paragraphStyle}>
            <strong>Public Visibility:</strong>{" "}
            Location check-ins are stored unencrypted on your PDS and are
            publicly accessible to anyone who knows how to query AT Protocol
            records. This is by design of the AT Protocol's open architecture.
          </p>
          <p className={paragraphStyle}>
            <strong>Data Portability:</strong>{" "}
            Since your data lives on your PDS, you can export, migrate, or
            delete it at any time through your PDS provider.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>What Anchor Stores</h2>
          <p className={paragraphStyle}>
            Anchor operates with minimal data storage. The only information
            stored on Anchor's servers is:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              <strong>OAuth sessions:</strong>{" "}
              Encrypted authentication tokens to keep you logged in
            </li>
            <li className={listItemStyle}>
              <strong>Error logs:</strong>{" "}
              Technical logs for debugging (no personal location data)
            </li>
          </ul>

          <h3 className={subsectionTitleStyle}>
            What Anchor Does NOT Store
          </h3>
          <p className={paragraphStyle}>
            Anchor does not store, cache, or index any of the following:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Your location check-ins or coordinates
            </li>
            <li className={listItemStyle}>Venue names or addresses</li>
            <li className={listItemStyle}>Photos or images you upload</li>
            <li className={listItemStyle}>
              Text descriptions or messages
            </li>
            <li className={listItemStyle}>Your location history</li>
          </ul>
          <p className={paragraphStyle}>
            All of this data is written directly to your Personal Data Server
            (PDS) and read from there when needed. Anchor acts as a client
            application that communicates with your PDS—we are not a data
            warehouse.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>How We Use Your Information</h2>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              To authenticate you via AT Protocol OAuth
            </li>
            <li className={listItemStyle}>
              To write check-ins directly to your PDS on your behalf
            </li>
            <li className={listItemStyle}>
              To read check-ins from your PDS and the PDS of users you follow
            </li>
            <li className={listItemStyle}>
              To resolve venue information via OpenStreetMap/Overpass API
            </li>
            <li className={listItemStyle}>
              To maintain and improve the Anchor service
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Third-Party Services</h2>
          <p className={paragraphStyle}>
            Anchor integrates with several third-party services to provide
            functionality:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              <strong>AT Protocol Network:</strong>{" "}
              For decentralized data storage and social connectivity
            </li>
            <li className={listItemStyle}>
              <strong>Bluesky:</strong>{" "}
              For authentication and following relationships
            </li>
            <li className={listItemStyle}>
              <strong>OpenStreetMap/Overpass API:</strong>{" "}
              For venue search and location enrichment
            </li>
            <li className={listItemStyle}>
              <strong>Val Town:</strong>{" "}
              Our hosting platform for the web service
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Data Security</h2>
          <p className={paragraphStyle}>
            We implement appropriate security measures to protect OAuth
            sessions, which are encrypted using industry-standard methods. Since
            we do not store your location data, the security of your check-ins
            depends entirely on your chosen PDS provider's security practices.
          </p>
          <p className={paragraphStyle}>
            <strong>Important:</strong>{" "}
            Location data stored on your PDS is not encrypted and is publicly
            accessible through the AT Protocol. Only check in at locations
            you're comfortable sharing publicly.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Your Rights and Choices</h2>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              <strong>Access:</strong>{" "}
              You can access all your data through your PDS
            </li>
            <li className={listItemStyle}>
              <strong>Deletion:</strong>{" "}
              You can delete check-ins through the Anchor app or directly on
              your PDS
            </li>
            <li className={listItemStyle}>
              <strong>Data Portability:</strong>{" "}
              You can export your data from your PDS at any time
            </li>
            <li className={listItemStyle}>
              <strong>Account Deletion:</strong>{" "}
              You can disconnect from Anchor by revoking OAuth access in your
              Bluesky settings
            </li>
          </ul>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Children's Privacy</h2>
          <p className={paragraphStyle}>
            Anchor is not intended for users under 13 years of age. We do not
            knowingly collect personal information from children under 13. If
            you become aware that a child has provided us with personal
            information, please contact us so we can take appropriate action.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Changes to This Privacy Policy</h2>
          <p className={paragraphStyle}>
            We may update this privacy policy from time to time. We will notify
            users of any material changes by updating the "Last updated" date at
            the top of this policy. Continued use of Anchor after changes
            indicates acceptance of the updated policy.
          </p>
        </section>

        <section className={sectionStyle}>
          <h2 className={sectionTitleStyle}>Contact Us</h2>
          <p className={paragraphStyle}>
            If you have questions about this privacy policy or Anchor's privacy
            practices, you can:
          </p>
          <ul className={listStyle}>
            <li className={listItemStyle}>
              Open an issue on our{" "}
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
              Contact us on Bluesky at{" "}
              <a
                href="https://bsky.app/profile/dropanchor.app"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyle}
              >
                @dropanchor.app
              </a>
            </li>
          </ul>
        </section>

        <div className={noticeStyle}>
          <h3 className={noticeTitleStyle}>
            🔒 Remember: Your Location Data Is Public
          </h3>
          <p className={noticeTextStyle}>
            By design of the AT Protocol, your location check-ins are stored
            unencrypted and are publicly accessible. This enables
            decentralization and data portability, but means anyone with
            technical knowledge can access your location history. Please only
            check in at locations you're comfortable sharing publicly.
          </p>
        </div>

        <div className={footerStyle}>
          <a href="/" className={backLinkStyle}>
            ← Back to Anchor
          </a>
        </div>
      </div>
    </div>
  );
}
