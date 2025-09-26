/** @jsxImportSource https://esm.sh/react@19.1.0 */

interface LoginFormProps {
  showLoginForm: boolean;
  setShowLoginForm: (show: boolean) => void;
  loginHandle: string;
  setLoginHandle: (handle: string) => void;
  loginLoading: boolean;
  onSubmitLogin: (e: any) => void;
}

export function LoginForm({
  showLoginForm,
  setShowLoginForm,
  loginHandle,
  setLoginHandle,
  loginLoading,
  onSubmitLogin,
}: LoginFormProps) {
  if (!showLoginForm) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: "2000",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowLoginForm(false);
        }
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          padding: "32px",
          maxWidth: "400px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "22px",
              fontWeight: "600",
              color: "#1c1c1e",
              margin: "0",
            }}
          >
            Sign in with Bluesky
          </h2>
          <button
            type="button"
            onClick={() => setShowLoginForm(false)}
            style={{
              background: "none",
              border: "none",
              fontSize: "18px",
              color: "#8e8e93",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "12px",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#f2f2f7";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmitLogin}>
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "15px",
                fontWeight: "500",
                color: "#1c1c1e",
                marginBottom: "8px",
              }}
            >
              Bluesky Handle
            </label>
            <input
              type="text"
              value={loginHandle}
              onChange={(e) => setLoginHandle(e.target.value)}
              placeholder="your-handle.bsky.social"
              required
              style={{
                width: "100%",
                fontSize: "16px",
                padding: "12px 16px",
                border: "1px solid #e5e5ea",
                borderRadius: "8px",
                background: "white",
                color: "#1c1c1e",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#007aff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e5e5ea";
              }}
            />
            <p
              style={{
                fontSize: "13px",
                color: "#8e8e93",
                marginTop: "6px",
              }}
            >
              Enter your Bluesky handle (e.g., alice.bsky.social)
            </p>
          </div>

          <div
            style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={() => setShowLoginForm(false)}
              style={{
                fontSize: "16px",
                fontWeight: "500",
                background: "none",
                color: "#007aff",
                border: "none",
                borderRadius: "8px",
                padding: "10px 16px",
                cursor: "pointer",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#f0f8ff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loginLoading}
              style={{
                fontSize: "16px",
                fontWeight: "500",
                background: loginLoading ? "#8e8e93" : "#007aff",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: loginLoading ? "not-allowed" : "pointer",
              }}
              onMouseOver={(e) => {
                if (!loginLoading) {
                  e.currentTarget.style.background = "#0056cc";
                }
              }}
              onMouseOut={(e) => {
                if (!loginLoading) {
                  e.currentTarget.style.background = "#007aff";
                }
              }}
            >
              {loginLoading ? "Connecting..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
