/** @jsxImportSource https://esm.sh/react@19.1.0 */
import React, { useEffect, useState } from "https://esm.sh/react@19.1.0";
import { Layout } from "./Layout.tsx";
import { Feed } from "./Feed.tsx";
import { About } from "./About.tsx";
import { Help } from "./Help.tsx";
import { PrivacyPolicy } from "./PrivacyPolicy.tsx";
import { TermsOfService } from "./TermsOfService.tsx";
import { LoginForm } from "./LoginForm.tsx";
import { MobileAuth } from "./MobileAuth.tsx";
import { CheckinDetail } from "./CheckinDetail.tsx";
import { CheckinComposer } from "./CheckinComposer.tsx";
import { AuthState, CheckinData } from "../types/index.ts";
import { apiFetch } from "../utils/api.ts";
import { checkinCache } from "../utils/checkin-cache.ts";
import { injectGlobalStyles } from "../styles/globalStyles.ts";
import { alertError } from "../styles/components.ts";

export function App() {
  // Parse route first, before any hooks
  let currentPath = "/";
  let isMobileAuth = false;
  let isPrivacyPolicy = false;
  let isTermsOfService = false;
  let isHelp = false;
  let isCheckinDetail = false;
  let checkinId: string | null = null;
  let checkinDid: string | null = null;
  let checkinRkey: string | null = null;

  try {
    const pathname = globalThis.location?.pathname || "/";
    currentPath = pathname;
    isMobileAuth = pathname === "/mobile-auth";
    isPrivacyPolicy = pathname === "/privacy-policy";
    isTermsOfService = pathname === "/terms";
    isHelp = pathname === "/help";

    // Try new REST-style URL first: /checkins/:did/:rkey
    const restMatch = pathname.match(/^\/checkins\/([^\/]+)\/([^\/]+)$/);
    if (restMatch) {
      [, checkinDid, checkinRkey] = restMatch;
      isCheckinDetail = true;
      checkinId = `${checkinDid}/${checkinRkey}`;
    } else {
      // Fallback to legacy URL: /checkin/:id
      const legacyMatch = pathname.match(/^\/checkin\/(.+)$/);
      if (legacyMatch) {
        isCheckinDetail = true;
        checkinId = legacyMatch[1];
      }
    }
  } catch (error) {
    console.error("Error parsing route:", error);
  }

  // Mobile auth is a special standalone page
  if (isMobileAuth) {
    return <MobileAuth />;
  }

  const [allCheckins, setAllCheckins] = useState<CheckinData[]>([]);
  const [displayedCount, setDisplayedCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false });
  const [authLoading, setAuthLoading] = useState(true); // Track initial auth check
  const [error, setError] = useState<string | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginHandle, setLoginHandle] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
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
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch checkins from API and cache them
  const fetchAndCacheCheckins = async (
    userDid: string,
  ): Promise<CheckinData[]> => {
    const allFetchedCheckins: CheckinData[] = [];
    let cursor: string | null = null;

    do {
      const url = cursor
        ? `/api/checkins/${userDid}?limit=100&cursor=${
          encodeURIComponent(cursor)
        }`
        : `/api/checkins/${userDid}?limit=100`;

      const response = await apiFetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", errorText);
        throw new Error(`Failed to fetch: ${response.status} - ${errorText}`);
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

    // Cache the fresh data
    await checkinCache.setFeed(userDid, sortedCheckins);

    return sortedCheckins;
  };

  // Load checkins with cache-first strategy (stale-while-revalidate)
  useEffect(() => {
    const loadFeed = async () => {
      setError(null);
      setDisplayedCount(20);

      if (!auth.isAuthenticated || !auth.userDid) {
        setAllCheckins([]);
        setLoading(false);
        return;
      }

      const userDid = auth.userDid;

      try {
        // Try cache first
        const cached = await checkinCache.getFeed(userDid);

        if (cached && checkinCache.isCacheValid(cached.timestamp)) {
          // Use cached data immediately
          setAllCheckins(cached.checkins);
          setLoading(false);

          // Background revalidate if cache is getting stale
          if (checkinCache.needsRevalidation(cached.timestamp)) {
            fetchAndCacheCheckins(userDid)
              .then(setAllCheckins)
              .catch((err) => console.warn("Background refresh failed:", err));
          }
          return;
        }

        // No cache or expired - fetch fresh with loading state
        setLoading(true);
        const checkins = await fetchAndCacheCheckins(userDid);
        setAllCheckins(checkins);
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
        // Clear cache before logout
        await checkinCache.clearAll(auth.userDid);

        await apiFetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ did: auth.userDid }),
        });
      }

      setAuth({ isAuthenticated: false });
      globalThis.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleCreateCheckin = () => {
    setShowCheckinComposer(true);
  };

  // Render content based on route
  const renderContent = () => {
    // Privacy policy is a full-page standalone
    if (isPrivacyPolicy) {
      return <PrivacyPolicy />;
    }

    // Terms of service is a full-page standalone
    if (isTermsOfService) {
      return <TermsOfService />;
    }

    // Help page
    if (isHelp) {
      return <Help />;
    }

    // Checkin detail page
    if (isCheckinDetail && checkinId) {
      return <CheckinDetail checkinId={checkinId} auth={auth} />;
    }

    // Home/Feed page - show loading state while checking auth
    if (authLoading) {
      return null; // Minimal loading - just empty content, layout still shows
    }

    if (auth.isAuthenticated) {
      return (
        <Feed
          checkins={checkins}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          auth={auth}
          onLogin={handleLogin}
        />
      );
    }

    // Not authenticated - show about page
    return <About onLogin={handleLogin} />;
  };

  // Privacy policy is standalone without layout
  if (isPrivacyPolicy) {
    return <PrivacyPolicy />;
  }

  // Terms of service is standalone without layout
  if (isTermsOfService) {
    return <TermsOfService />;
  }

  return (
    <>
      <Layout
        auth={auth}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onCreateCheckin={handleCreateCheckin}
        currentPath={currentPath}
      >
        {renderContent()}
      </Layout>

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

      <CheckinComposer
        isOpen={showCheckinComposer}
        onClose={() => setShowCheckinComposer(false)}
        onSuccess={async (checkinUrl) => {
          setShowCheckinComposer(false);
          // Invalidate cache so feed refreshes with new checkin
          if (auth.userDid) {
            await checkinCache.invalidateFeed(auth.userDid);
          }
          globalThis.location.href = checkinUrl;
        }}
      />
    </>
  );
}
