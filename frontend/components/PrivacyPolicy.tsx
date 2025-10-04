/** @jsxImportSource https://esm.sh/react@19.1.0 */

export function PrivacyPolicy() {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        margin: "20px 0",
        padding: "40px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        maxWidth: "800px",
        marginLeft: "auto",
        marginRight: "auto",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "700",
            color: "#1c1c1e",
            margin: "0 0 12px 0",
          }}
        >
          Privacy Policy
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: "#8e8e93",
            margin: "0",
            lineHeight: "1.5",
          }}
        >
          Last updated: {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Content */}
      <div style={{ lineHeight: "1.7", fontSize: "16px", color: "#3c3c43" }}>
        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Overview
          </h2>
          <p style={{ marginBottom: "16px" }}>
            Anchor is a personal location logging application built on the
            decentralized AT Protocol network. All location check-ins are stored
            exclusively on your Personal Data Server (PDS), which you control.
            Anchor's servers do not store or cache your check-in data. This
            privacy policy explains how your data is handled within this
            decentralized architecture.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Data Storage and Ownership
          </h2>
          <p style={{ marginBottom: "16px" }}>
            <strong>Your Data, Your Server:</strong>{" "}
            All location check-ins are stored exclusively on your Personal Data
            Server (PDS), which you control. Anchor's servers read your
            check-ins directly from your PDS when displaying feeds—we do not
            store or cache your location data.
          </p>
          <p style={{ marginBottom: "16px" }}>
            <strong>Public Visibility:</strong>{" "}
            Location check-ins are stored unencrypted on your PDS and are
            publicly accessible to anyone who knows how to query AT Protocol
            records. This is by design of the AT Protocol's open architecture.
          </p>
          <p style={{ marginBottom: "16px" }}>
            <strong>Data Portability:</strong>{" "}
            Since your data lives on your PDS, you can export, migrate, or
            delete it at any time through your PDS provider.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            What Information We Collect
          </h2>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#1c1c1e",
            }}
          >
            Information You Provide
          </h3>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              Location coordinates when you create check-ins
            </li>
            <li style={{ marginBottom: "8px" }}>Venue names and addresses</li>
            <li style={{ marginBottom: "8px" }}>
              Optional text descriptions for your check-ins
            </li>
            <li style={{ marginBottom: "8px" }}>
              Your Bluesky handle and profile information for authentication
            </li>
          </ul>

          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              marginBottom: "12px",
              color: "#1c1c1e",
            }}
          >
            Technical Information We Store
          </h3>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              OAuth authentication sessions (encrypted and stored securely for
              login management)
            </li>
            <li style={{ marginBottom: "8px" }}>
              Error logs for debugging purposes
            </li>
          </ul>
          <p style={{ marginBottom: "16px" }}>
            <strong>What we don't store:</strong>{" "}
            We do not store your check-ins, location coordinates, venue
            information, or any other personal content on our servers. All of
            this data lives exclusively on your PDS.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            How We Use Your Information
          </h2>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              To authenticate you via AT Protocol OAuth
            </li>
            <li style={{ marginBottom: "8px" }}>
              To write check-ins directly to your PDS on your behalf
            </li>
            <li style={{ marginBottom: "8px" }}>
              To read check-ins from your PDS and the PDS of users you follow
            </li>
            <li style={{ marginBottom: "8px" }}>
              To resolve venue information via OpenStreetMap/Overpass API
            </li>
            <li style={{ marginBottom: "8px" }}>
              To maintain and improve the Anchor service
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Third-Party Services
          </h2>
          <p style={{ marginBottom: "16px" }}>
            Anchor integrates with several third-party services to provide
            functionality:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              <strong>AT Protocol Network:</strong>{" "}
              For decentralized data storage and social connectivity
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Bluesky:</strong>{" "}
              For authentication and following relationships
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>OpenStreetMap/Overpass API:</strong>{" "}
              For venue search and location enrichment
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Val Town:</strong>{" "}
              Our hosting platform for the web service
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Data Security
          </h2>
          <p style={{ marginBottom: "16px" }}>
            We implement appropriate security measures to protect OAuth
            sessions, which are encrypted using industry-standard methods. Since
            we do not store your location data, the security of your check-ins
            depends entirely on your chosen PDS provider's security practices.
          </p>
          <p style={{ marginBottom: "16px" }}>
            <strong>Important:</strong>{" "}
            Location data stored on your PDS is not encrypted and is publicly
            accessible through the AT Protocol. Only check in at locations
            you're comfortable sharing publicly.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Your Rights and Choices
          </h2>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              <strong>Access:</strong>{" "}
              You can access all your data through your PDS
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Deletion:</strong>{" "}
              You can delete check-ins through the Anchor app or directly on
              your PDS
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Data Portability:</strong>{" "}
              You can export your data from your PDS at any time
            </li>
            <li style={{ marginBottom: "8px" }}>
              <strong>Account Deletion:</strong>{" "}
              You can disconnect from Anchor by revoking OAuth access in your
              Bluesky settings
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Children's Privacy
          </h2>
          <p style={{ marginBottom: "16px" }}>
            Anchor is not intended for users under 13 years of age. We do not
            knowingly collect personal information from children under 13. If
            you become aware that a child has provided us with personal
            information, please contact us so we can take appropriate action.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Changes to This Privacy Policy
          </h2>
          <p style={{ marginBottom: "16px" }}>
            We may update this privacy policy from time to time. We will notify
            users of any material changes by updating the "Last updated" date at
            the top of this policy. Continued use of Anchor after changes
            indicates acceptance of the updated policy.
          </p>
        </section>

        <section style={{ marginBottom: "32px" }}>
          <h2
            style={{
              fontSize: "24px",
              fontWeight: "600",
              marginBottom: "16px",
              color: "#1c1c1e",
            }}
          >
            Contact Us
          </h2>
          <p style={{ marginBottom: "16px" }}>
            If you have questions about this privacy policy or Anchor's privacy
            practices, you can:
          </p>
          <ul style={{ paddingLeft: "24px", marginBottom: "16px" }}>
            <li style={{ marginBottom: "8px" }}>
              Open an issue on our{" "}
              <a
                href="https://github.com/dropanchorapp/anchor-appview"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#007aff", textDecoration: "none" }}
              >
                GitHub repository
              </a>
            </li>
            <li style={{ marginBottom: "8px" }}>
              Contact us on Bluesky at{" "}
              <a
                href="https://bsky.app/profile/dropanchor.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#007aff", textDecoration: "none" }}
              >
                @dropanchor.app
              </a>
            </li>
          </ul>
        </section>

        {/* Important Notice */}
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffeaa7",
            borderRadius: "8px",
            padding: "20px",
            marginTop: "32px",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#856404",
              margin: "0 0 12px 0",
            }}
          >
            🔒 Remember: Your Location Data Is Public
          </h3>
          <p
            style={{
              fontSize: "15px",
              color: "#856404",
              lineHeight: "1.6",
              margin: "0",
            }}
          >
            By design of the AT Protocol, your location check-ins are stored
            unencrypted and are publicly accessible. This enables
            decentralization and data portability, but means anyone with
            technical knowledge can access your location history. Please only
            check in at locations you're comfortable sharing publicly.
          </p>
        </div>

        {/* Back to App */}
        <div style={{ textAlign: "center", marginTop: "40px" }}>
          <a
            href="/"
            style={{
              background: "#007aff",
              color: "white",
              textDecoration: "none",
              padding: "12px 24px",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "600",
              display: "inline-block",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#0056b3";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#007aff";
            }}
          >
            ← Back to Anchor
          </a>
        </div>
      </div>
    </div>
  );
}
