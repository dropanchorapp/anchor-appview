/** @jsxImportSource https://esm.sh/react */
import React, { useEffect, useRef, useState } from "https://esm.sh/react";
import { Header } from "./Header.tsx";
import { Feed } from "./Feed.tsx";
import { LoginForm } from "./LoginForm.tsx";
import { MobileAuth } from "./MobileAuth.tsx";
import { CheckinDetail } from "./CheckinDetail.tsx";
import { AuthState, CheckinData, FeedType } from "../types/index.ts";

export function App() {
  // Check if we're on the mobile-auth route first, before any hooks
  const isMobileAuth = globalThis.location?.pathname === "/mobile-auth";

  // Check if we're on a checkin detail route
  const checkinMatch = globalThis.location?.pathname.match(/^\/checkin\/(.+)$/);
  const isCheckinDetail = !!checkinMatch;
  const checkinId = checkinMatch?.[1];

  if (isMobileAuth) {
    return <MobileAuth />;
  }

  if (isCheckinDetail && checkinId) {
    return <CheckinDetail checkinId={checkinId} />;
  }

  const [checkins, setCheckins] = useState<CheckinData[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedType, setFeedType] = useState<FeedType>("timeline");
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false });
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginHandle, setLoginHandle] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Inject proper CSS styles on mount
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
        background: #f2f2f7;
        min-height: 100vh;
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

  // Check authentication status on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/session");
        const data = await response.json();

        if (data.authenticated) {
          setAuth({
            isAuthenticated: true,
            userHandle: data.userHandle,
            userDid: data.userDid,
            userDisplayName: data.userDisplayName,
            userAvatar: data.userAvatar,
          });
        }
      } catch (error) {
        console.error("Auth check failed:", error);
      }
    };

    checkAuth();
  }, []);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target as Node)
      ) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [showUserDropdown]);

  // Load feed data
  useEffect(() => {
    const loadFeed = async () => {
      setLoading(true);
      setError(null);

      try {
        // For timeline and following feeds, require authentication
        if (
          (feedType === "timeline" || feedType === "following") &&
          !auth.isAuthenticated
        ) {
          // Don't fetch data, show login prompt instead
          setCheckins([]);
          setLoading(false);
          return;
        }

        let url = "/api/global";
        if (feedType === "following" && auth.isAuthenticated && auth.userDid) {
          url = `/api/following?user=${auth.userDid}`;
        } else if (
          feedType === "timeline" && auth.isAuthenticated && auth.userDid
        ) {
          url = `/api/user?did=${auth.userDid}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }

        const data = await response.json();
        setCheckins(data.checkins || []);
      } catch (error) {
        console.error("Failed to load feed:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load feed",
        );
        setCheckins([]);
      } finally {
        setLoading(false);
      }
    };

    loadFeed();
  }, [feedType, auth.isAuthenticated, auth.userDid]);

  const handleLogin = () => {
    setShowLoginForm(true);
  };

  const handleSubmitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      // Iron Session OAuth: direct redirect to /login with handle parameter
      globalThis.location.href = `/login?handle=${
        encodeURIComponent(loginHandle)
      }`;
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed. Please try again.");
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (auth.userDid) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ did: auth.userDid }),
        });
      }

      setAuth({ isAuthenticated: false });
      setShowUserDropdown(false);
      // Refresh page to clear any cached state
      globalThis.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header
        auth={auth}
        onLogin={handleLogin}
        onLogout={handleLogout}
        showUserDropdown={showUserDropdown}
        setShowUserDropdown={setShowUserDropdown}
      />

      <div
        style={{
          padding: "0 20px",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <Feed
          feedType={feedType}
          setFeedType={setFeedType}
          checkins={checkins}
          loading={loading}
          auth={auth}
          onLogin={handleLogin}
        />
      </div>

      <LoginForm
        showLoginForm={showLoginForm}
        setShowLoginForm={setShowLoginForm}
        loginHandle={loginHandle}
        setLoginHandle={setLoginHandle}
        loginLoading={loginLoading}
        onSubmitLogin={handleSubmitLogin}
      />

      {error && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            background: "#ff3b30",
            color: "white",
            borderRadius: "12px",
            boxShadow: "0 4px 12px rgba(255, 59, 48, 0.3)",
            padding: "12px 16px",
            maxWidth: "300px",
            fontSize: "14px",
            zIndex: "1000",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
