/** @jsxImportSource https://esm.sh/react */
import React, { useEffect, useState } from "https://esm.sh/react";

export function MobileAuth() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inject proper CSS styles for fonts and animations
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        line-height: 1.5;
        color: #1c1c1e;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style.parentNode) {
        document.head.removeChild(style);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!handle.trim()) {
      setError("Please enter your Bluesky handle");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/mobile-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to start authentication");
      }

      const data = await response.json();

      if (data.authUrl) {
        // Redirect to OAuth authorization
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
    <div
      style={{
        minHeight: "100vh",
        background: "#f2f2f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "20px",
          padding: "60px 40px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "160px",
            height: "160px",
            margin: "0 auto 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png"
            alt="Anchor Logo"
            style={{
              width: "160px",
              height: "160px",
              objectFit: "contain",
            }}
          />
        </div>

        <h1
          style={{
            fontSize: "28px",
            fontWeight: "700",
            marginBottom: "8px",
            color: "#1c1c1e",
          }}
        >
          Sign in to Anchor
        </h1>

        <p
          style={{
            color: "#8e8e93",
            marginBottom: "32px",
            fontSize: "16px",
            lineHeight: "1.4",
          }}
        >
          Connect with your Bluesky account
        </p>

        {error && (
          <div
            style={{
              background: "#ff3b30",
              color: "white",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "20px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px", textAlign: "left" }}>
            <label
              htmlFor="handle"
              style={{
                display: "block",
                fontWeight: "600",
                marginBottom: "8px",
                color: "#1c1c1e",
                fontSize: "14px",
              }}
            >
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
              style={{
                width: "100%",
                padding: "16px",
                border: "2px solid #f2f2f7",
                borderRadius: "12px",
                fontSize: "16px",
                background: "#f9f9f9",
                transition: "all 0.2s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#007aff";
                e.target.style.background = "white";
                e.target.style.boxShadow = "0 0 0 4px rgba(0, 122, 255, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#f2f2f7";
                e.target.style.background = "#f9f9f9";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#8e8e93" : "#007aff",
              color: "white",
              border: "none",
              padding: "16px",
              borderRadius: "12px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#0056b3";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#007aff";
                e.currentTarget.style.transform = "translateY(0)";
              }
            }}
          >
            {loading
              ? (
                <>
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid transparent",
                      borderTop: "2px solid white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  Signing in...
                </>
              )
              : (
                "Sign in with Bluesky"
              )}
          </button>
        </form>

        <div
          style={{
            marginTop: "32px",
            paddingTop: "24px",
            borderTop: "1px solid #f2f2f7",
            color: "#8e8e93",
            fontSize: "14px",
          }}
        >
          Powered by AT Protocol
        </div>
      </div>
    </div>
  );
}
