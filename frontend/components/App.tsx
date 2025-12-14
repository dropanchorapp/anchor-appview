/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, {
  useEffect,
  useRef,
  useState,
} from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { Header } from "./Header.tsx";
import { Feed } from "./Feed.tsx";
import { About } from "./About.tsx";
import { PrivacyPolicy } from "./PrivacyPolicy.tsx";
import { LoginForm } from "./LoginForm.tsx";
import { MobileAuth } from "./MobileAuth.tsx";
import { CheckinDetail } from "./CheckinDetail.tsx";
import { CheckinComposer } from "./CheckinComposer.tsx";
import { AuthState, CheckinData } from "../types/index.ts";
import { apiFetch } from "../utils/api.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import { alertError, container, fab } from "../styles/components.ts";
import { spacing } from "../styles/theme.ts";

const appContainerStyle = css`
  min-height: 100vh;
`;

const mainContentStyle = css`
  ${container} padding-top: ${spacing.xl};
`;

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
      checkinId = `${checkinDid}/${checkinRkey}`;
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

  const [allCheckins, setAllCheckins] = useState<CheckinData[]>([]);
  const [displayedCount, setDisplayedCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false });
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginHandle, setLoginHandle] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const [showCheckinComposer, setShowCheckinComposer] = useState(false);

  // Inject global styles on mount
  useEffect(() => {
    injectGlobalStyles();
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

  // Load all checkins, sort by date, paginate client-side
  useEffect(() => {
    const loadFeed = async () => {
      setLoading(true);
      setError(null);
      setDisplayedCount(20);

      try {
        if (!auth.isAuthenticated) {
          setAllCheckins([]);
          setLoading(false);
          return;
        }

        if (!auth.userDid) {
          setAllCheckins([]);
          setLoading(false);
          return;
        }

        const allFetchedCheckins: CheckinData[] = [];
        let cursor: string | null = null;

        do {
          const url = cursor
            ? `/api/checkins/${auth.userDid}?limit=100&cursor=${
              encodeURIComponent(cursor)
            }`
            : `/api/checkins/${auth.userDid}?limit=100`;

          const response = await apiFetch(url);
          if (!response.ok) {
            const errorText = await response.text();
            console.error("API error response:", errorText);
            throw new Error(
              `Failed to fetch: ${response.status} - ${errorText}`,
            );
          }

          const data = await response.json();
          if (data && typeof data === "object") {
            allFetchedCheckins.push(...(data.checkins || []));
            cursor = data.cursor || null;
          } else {
            throw new Error("Unexpected response format from server");
          }
        } while (cursor);

        const sortedCheckins = allFetchedCheckins.sort(
          (a: CheckinData, b: CheckinData) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
          },
        );
        setAllCheckins(sortedCheckins);
      } catch (error) {
        console.error("Failed to load feed:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load feed",
        );
        setAllCheckins([]);
      } finally {
        setLoading(false);
      }
    };

    loadFeed();
  }, [auth.isAuthenticated, auth.userDid]);

  const checkins = allCheckins.slice(0, displayedCount);
  const hasMore = displayedCount < allCheckins.length;
  const loadingMore = false;

  const loadMore = () => {
    if (displayedCount >= allCheckins.length) return;
    setDisplayedCount((prev) => Math.min(prev + 20, allCheckins.length));
  };

  const handleLogin = () => {
    setShowLoginForm(true);
  };

  const handleSubmitLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
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
        await apiFetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ did: auth.userDid }),
        });
      }

      setAuth({ isAuthenticated: false });
      setShowUserDropdown(false);
      globalThis.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className={appContainerStyle}>
      <Header
        auth={auth}
        onLogin={handleLogin}
        onLogout={handleLogout}
        showUserDropdown={showUserDropdown}
        setShowUserDropdown={setShowUserDropdown}
      />

      <div className={mainContentStyle}>
        {auth.isAuthenticated
          ? (
            <Feed
              checkins={checkins}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
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
        <div className={alertError}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {auth.isAuthenticated && (
        <button
          type="button"
          onClick={() => setShowCheckinComposer(true)}
          className={fab}
          title="Create check-in"
        >
          <svg
            width="28"
            height="28"
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

      <CheckinComposer
        isOpen={showCheckinComposer}
        onClose={() => setShowCheckinComposer(false)}
        onSuccess={(checkinUrl) => {
          setShowCheckinComposer(false);
          globalThis.location.href = checkinUrl;
        }}
      />
    </div>
  );
}
