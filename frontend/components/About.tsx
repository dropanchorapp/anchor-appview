/** @jsxImportSource https://esm.sh/react@19.1.0 */

interface AboutProps {
  onLogin: () => void;
}

export function About({ onLogin }: AboutProps) {
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
      }}
    >
      {/* Hero Section */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <img
          src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754731275/seagull-looking_yanxxb.png"
          alt="Anchor Logo"
          style={{
            width: "200px",
            height: "auto",
            marginBottom: "20px",
          }}
        />
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "700",
            color: "#1c1c1e",
            margin: "0 0 12px 0",
          }}
        >
          Anchor
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "#8e8e93",
            margin: "0",
            lineHeight: "1.5",
          }}
        >
          Your personal location logger, powered by the AT Protocol
        </p>
      </div>

      {/* What is Anchor */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: "600",
            color: "#1c1c1e",
            margin: "0 0 16px 0",
          }}
        >
          What is Anchor?
        </h2>
        <p
          style={{
            fontSize: "16px",
            color: "#3c3c43",
            lineHeight: "1.6",
            margin: "0 0 16px 0",
          }}
        >
          Anchor is a personal location logging app that stores your check-ins
          directly on{" "}
          <strong>your own Personal Data Server (PDS)</strong>. Unlike
          traditional social networks, you own and control your data completely.
        </p>
        <p
          style={{
            fontSize: "16px",
            color: "#3c3c43",
            lineHeight: "1.6",
            margin: "0",
          }}
        >
          Share your favorite places with friends on Bluesky or any other social
          network when you want to, but your location history remains yours.
        </p>
      </div>

      {/* Key Features */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: "600",
            color: "#1c1c1e",
            margin: "0 0 16px 0",
          }}
        >
          Key Features
        </h2>
        <ul
          style={{
            fontSize: "16px",
            color: "#3c3c43",
            lineHeight: "1.6",
            paddingLeft: "20px",
          }}
        >
          <li style={{ marginBottom: "8px" }}>
            <strong>Your Data, Your Server</strong>{" "}
            - Check-ins are stored on your personal AT Protocol server
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Open Protocol</strong>{" "}
            - Built on the decentralized AT Protocol network
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Social Integration</strong>{" "}
            - Connect with friends through Bluesky's social network
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Rich Location Data</strong>{" "}
            - Detailed venue information and interactive maps
          </li>
        </ul>
      </div>

      {/* Privacy Notice */}
      <div
        style={{
          background: "#fff3cd",
          border: "1px solid #ffeaa7",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "32px",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "#856404",
            margin: "0 0 8px 0",
          }}
        >
          🔒 Privacy Notice
        </h3>
        <p
          style={{
            fontSize: "14px",
            color: "#856404",
            lineHeight: "1.5",
            margin: "0",
          }}
        >
          Your location check-ins are stored unencrypted on your Personal Data
          Server and are publicly visible to anyone who knows how to query AT
          Protocol records. Only check in at locations you're comfortable
          sharing publicly.
        </p>
      </div>

      {/* Download & Links */}
      <div style={{ marginBottom: "32px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: "600",
            color: "#1c1c1e",
            margin: "0 0 16px 0",
          }}
        >
          Get Started
        </h2>

        <div style={{ marginBottom: "20px" }}>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1c1c1e",
              margin: "0 0 8px 0",
            }}
          >
            📱 iOS App
          </h3>
          <p
            style={{
              fontSize: "16px",
              color: "#3c3c43",
              lineHeight: "1.6",
              margin: "0 0 12px 0",
            }}
          >
            Download the Anchor iOS app to start logging your locations:
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <a
              href="https://testflight.apple.com/join/gmSQv4Gh"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#007aff",
                color: "white",
                textDecoration: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontSize: "14px",
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
              📥 TestFlight Beta
            </a>
            <a
              href="https://github.com/dropanchorapp/Anchor"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "#f2f2f7",
                color: "#007aff",
                textDecoration: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                display: "inline-block",
                border: "1px solid #e5e5ea",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e5e5ea";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f2f2f7";
              }}
            >
              📱 iOS Source Code
            </a>
          </div>
        </div>

        <div>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#1c1c1e",
              margin: "0 0 8px 0",
            }}
          >
            🌐 Web & API
          </h3>
          <p
            style={{
              fontSize: "16px",
              color: "#3c3c43",
              lineHeight: "1.6",
              margin: "0 0 12px 0",
            }}
          >
            Explore the web interface and API source code:
          </p>
          <a
            href="https://github.com/dropanchorapp/location-feed-generator"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#f2f2f7",
              color: "#007aff",
              textDecoration: "none",
              padding: "10px 16px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: "600",
              display: "inline-block",
              border: "1px solid #e5e5ea",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#e5e5ea";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#f2f2f7";
            }}
          >
            💻 Web Source Code
          </a>
        </div>
      </div>

      {/* Sign In Button */}
      <div style={{ textAlign: "center", paddingTop: "20px" }}>
        <button
          type="button"
          onClick={onLogin}
          style={{
            background: "#007aff",
            color: "white",
            border: "none",
            borderRadius: "12px",
            padding: "16px 32px",
            fontSize: "18px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 2px 8px rgba(0, 122, 255, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#0056b3";
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(0, 122, 255, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#007aff";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 2px 8px rgba(0, 122, 255, 0.3)";
          }}
        >
          Sign in with Bluesky to get started
        </button>
        <p
          style={{
            fontSize: "14px",
            color: "#8e8e93",
            margin: "12px 0 0 0",
            lineHeight: "1.4",
          }}
        >
          You'll need a Bluesky account to use Anchor
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "#8e8e93",
            margin: "12px 0 0 0",
            lineHeight: "1.4",
            textAlign: "center",
          }}
        >
          By using Anchor, you agree to our{" "}
          <a
            href="/privacy-policy"
            style={{
              color: "#007aff",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.textDecoration = "underline";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.textDecoration = "none";
            }}
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
