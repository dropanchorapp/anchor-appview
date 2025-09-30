/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, {
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@19.1.0";
import { Header } from "./Header.tsx";
import { Feed } from "./Feed.tsx";
import { About } from "./About.tsx";
import { PrivacyPolicy } from "./PrivacyPolicy.tsx";
import { LoginForm } from "./LoginForm.tsx";
import { MobileAuth } from "./MobileAuth.tsx";
import { CheckinDetail } from "./CheckinDetail.tsx";
import { CheckinComposer } from "./CheckinComposer.tsx";
import { AuthState, CheckinData } from "../types/index.ts";

export function App() {
  // Check if we're on the mobile-auth route first, before any hooks
  let isMobileAuth = false;
  let isPrivacyPolicy = false;
  try {
    isMobileAuth = globalThis.location?.pathname === "/mobile-auth";
    isPrivacyPolicy = globalThis.location?.pathname === "/privacy-policy";
  } catch (error) {
    console.error("Error checking routes:", error);
    isMobileAuth = false;
    isPrivacyPolicy = false;
  }

  // Check if we're on a checkin detail route
  let checkinMatch = null;
  let isCheckinDetail = false;
  let checkinId = null;
  let checkinDid = null;
  let checkinRkey = null;

  try {
    const pathname = globalThis.location?.pathname || "";

    // Try new REST-style URL first: /checkins/:did/:rkey
    const restMatch = pathname.match(/^\/checkins\/([^\/]+)\/([^\/]+)$/);
    if (restMatch) {
      [, checkinDid, checkinRkey] = restMatch;
      isCheckinDetail = true;
      checkinId = `${checkinDid}/${checkinRkey}`; // For CheckinDetail component
    } else {
      // Fallback to legacy URL: /checkin/:id
      checkinMatch = pathname.match(/^\/checkin\/(.+)$/);
      isCheckinDetail = !!checkinMatch;
      checkinId = checkinMatch?.[1];
    }
  } catch (error) {
    console.error("Error parsing checkin route:", error);
    isCheckinDetail = false;
    checkinId = null;
  }

  if (isMobileAuth) {
    return <MobileAuth />;
  }

  if (isPrivacyPolicy) {
    return <PrivacyPolicy />;
  }

  if (isCheckinDetail && checkinId) {
    return <CheckinDetail checkinId={checkinId} />;
  }

  const [checkins, setCheckins] = useState<CheckinData[]>([]);
  const [loading, setLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false });
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginHandle, setLoginHandle] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const [showCheckinComposer, setShowCheckinComposer] = useState(false);

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

      /* Mobile responsive styles */
      @media (max-width: 768px) {
        body {
          font-size: 16px; /* Prevent iOS zoom on input focus */
        }
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

        if (data.valid) {
          setAuth({
            isAuthenticated: true,
            userHandle: data.handle,
            userDid: data.did,
            userDisplayName: data.displayName,
            userAvatar: data.avatar,
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
        // For timeline feed, require authentication
        if (!auth.isAuthenticated) {
          // Don't fetch data, show login prompt instead
          setCheckins([]);
          setLoading(false);
          return;
        }

        let url = "";
        if (auth.isAuthenticated) {
          url = `/api/checkins/${auth.userDid}`;
        }

        // If no valid URL, don't fetch
        if (!url) {
          setCheckins([]);
          setLoading(false);
          return;
        }

        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error response:", errorText);
          throw new Error(`Failed to fetch: ${response.status} - ${errorText}`);
        }

        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error("Failed to parse JSON response:", jsonError);
          throw new Error("Invalid response format from server");
        }

        if (data && typeof data === "object") {
          setCheckins(data.checkins || []);
        } else {
          console.error("Unexpected response format:", data);
          throw new Error("Unexpected response format from server");
        }
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
  }, [auth.isAuthenticated, auth.userDid]);

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
        {auth.isAuthenticated
          ? (
            <Feed
              checkins={checkins}
              loading={loading}
              auth={auth}
              onLogin={handleLogin}
            />
          )
          : <About onLogin={handleLogin} />}
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

      {/* Floating Action Button (FAB) - only for authenticated users */}
      {auth.isAuthenticated && (
        <button
          type="button"
          onClick={() => setShowCheckinComposer(true)}
          style={{
            position: "fixed",
            bottom: globalThis.innerWidth <= 768 ? "16px" : "24px",
            right: globalThis.innerWidth <= 768 ? "16px" : "24px",
            width: globalThis.innerWidth <= 768 ? "60px" : "56px",
            height: globalThis.innerWidth <= 768 ? "60px" : "56px",
            borderRadius: globalThis.innerWidth <= 768 ? "30px" : "28px",
            background: "#007aff",
            border: "none",
            boxShadow: "0 4px 12px rgba(0, 122, 255, 0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            zIndex: "100",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow =
              "0 6px 16px rgba(0, 122, 255, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow =
              "0 4px 12px rgba(0, 122, 255, 0.4)";
          }}
          title="Create check-in"
        >
          <svg
            width={globalThis.innerWidth <= 768 ? "32" : "28"}
            height={globalThis.innerWidth <= 768 ? "32" : "28"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* Check-in Composer Modal */}
      <CheckinComposer
        isOpen={showCheckinComposer}
        onClose={() => setShowCheckinComposer(false)}
        onSuccess={(checkinUrl) => {
          setShowCheckinComposer(false);
          // Redirect to checkin detail page
          globalThis.location.href = checkinUrl;
        }}
      />
    </div>
  );
}
