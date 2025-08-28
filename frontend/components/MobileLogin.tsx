/** @jsxImportSource https://esm.sh/react */
import React, { useState } from "https://esm.sh/react";

interface MobileLoginProps {
  redirectUri: string;
}

export function MobileLogin({ redirectUri }: MobileLoginProps) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!handle.trim()) {
      setError("Please enter your Bluesky handle");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Redirect to OAuth flow with handle and redirect_uri
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
    <div
      style={{
        minHeight: "100vh",
        background: "#f2f2f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          padding: "40px",
          width: "100%",
          maxWidth: "400px",
        }}
      >
        {/* Header with logo */}
        <div
          style={{
            textAlign: "center",
            marginBottom: "32px",
          }}
        >
          <img
            src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png"
            alt="Anchor"
            style={{
              height: "64px",
              width: "auto",
              marginBottom: "16px",
            }}
          />
          <h1
            style={{
              fontSize: "24px",
              fontWeight: "600",
              color: "#1c1c1e",
              marginBottom: "8px",
              margin: "0 0 8px 0",
            }}
          >
            Sign in to Anchor
          </h1>
          <p
            style={{
              color: "#8e8e93",
              fontSize: "16px",
              margin: "0 0 32px 0",
              lineHeight: "1.4",
            }}
          >
            Enter your Bluesky handle to continue
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              marginBottom: "24px",
            }}
          >
            <label
              htmlFor="handle"
              style={{
                display: "block",
                fontWeight: "500",
                color: "#1c1c1e",
                marginBottom: "8px",
                fontSize: "15px",
              }}
            >
              Bluesky Handle
            </label>
            <input
              type="text"
              id="handle"
              name="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="username.bsky.social or your.domain"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 16px",
                border: "1px solid #e5e5ea",
                borderRadius: "12px",
                fontSize: "16px",
                background: loading ? "#f8f9fa" : "white",
                color: "#1c1c1e",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#007aff";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e5e5ea";
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !handle.trim()}
            style={{
              width: "100%",
              padding: "14px",
              background: loading || !handle.trim() ? "#c7c7cc" : "#007aff",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading || !handle.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "background-color 0.2s ease",
            }}
            onMouseOver={(e) => {
              if (!loading && handle.trim()) {
                e.currentTarget.style.background = "#0056cc";
              }
            }}
            onMouseOut={(e) => {
              if (!loading && handle.trim()) {
                e.currentTarget.style.background = "#007aff";
              }
            }}
          >
            {loading && (
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              />
            )}
            {loading ? "Connecting..." : "Continue with Bluesky"}
          </button>

          {error && (
            <div
              style={{
                color: "#ff3b30",
                fontSize: "14px",
                marginTop: "12px",
                textAlign: "center",
                padding: "8px",
                background: "rgba(255, 59, 48, 0.1)",
                borderRadius: "8px",
              }}
            >
              {error}
            </div>
          )}
        </form>

        {/* Security note */}
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            background: "rgba(52, 199, 89, 0.1)",
            borderRadius: "12px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              marginBottom: "8px",
            }}
          >
            <span
              style={{
                color: "#34c759",
                fontSize: "16px",
              }}
            >
              🔒
            </span>
            <span
              style={{
                fontSize: "14px",
                fontWeight: "500",
                color: "#1c1c1e",
              }}
            >
              Secure Authentication
            </span>
          </div>
          <p
            style={{
              fontSize: "13px",
              color: "#8e8e93",
              margin: "0",
              lineHeight: "1.4",
            }}
          >
            Your password will be entered securely on Bluesky's servers. Anchor
            never sees your password.
          </p>
        </div>
      </div>

      {/* CSS animation for spinner */}
      <style>
        {`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}
      </style>
    </div>
  );
}
