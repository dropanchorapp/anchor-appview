/** @jsxImportSource https://esm.sh/react */
import React from "https://esm.sh/react";
import { AuthState } from "../types/index.ts";

interface HeaderProps {
  auth: AuthState;
  onLogin: () => void;
  onLogout: () => void;
  showUserDropdown: boolean;
  setShowUserDropdown: (show: boolean) => void;
}

export function Header({
  auth,
  onLogin,
  onLogout,
  showUserDropdown,
  setShowUserDropdown,
}: HeaderProps) {
  return (
    <div
      style={{
        background: "white",
        borderBottom: "1px solid #e5e5ea",
        position: "sticky",
        top: "0",
        zIndex: "100",
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <img
            src="https://res.cloudinary.com/dru3aznlk/image/upload/v1754747200/anchor-logo-transparent_nrw70y.png"
            alt="Anchor"
            style={{
              height: "32px",
              width: "auto",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {!auth.isAuthenticated
            ? (
              <button
                type="button"
                onClick={onLogin}
                style={{
                  background: "#007aff",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "18px",
                  fontSize: "14px",
                  fontWeight: "500",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#0056cc";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#007aff";
                }}
              >
                Login
              </button>
            )
            : (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "white",
                    border: "none",
                    borderRadius: "20px",
                    padding: "4px 12px 4px 4px",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    fontSize: "14px",
                    color: "#1c1c1e",
                  }}
                >
                  {auth.userAvatar
                    ? (
                      <img
                        src={auth.userAvatar}
                        alt={auth.userDisplayName || auth.userHandle}
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "16px",
                          objectFit: "cover",
                        }}
                      />
                    )
                    : (
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          background:
                            "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          borderRadius: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "white",
                        }}
                      >
                        {(auth.userDisplayName || auth.userHandle)?.[0]
                          ?.toUpperCase() || "?"}
                      </div>
                    )}
                  <span style={{ fontWeight: "500" }}>
                    {auth.userDisplayName || auth.userHandle}
                  </span>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#8e8e93",
                      transform: showUserDropdown
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    ▼
                  </div>
                </button>

                {showUserDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: "0",
                      marginTop: "8px",
                      background: "white",
                      borderRadius: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      padding: "8px",
                      minWidth: "120px",
                      zIndex: "1000",
                    }}
                  >
                    <button
                      type="button"
                      onClick={onLogout}
                      style={{
                        width: "100%",
                        fontSize: "14px",
                        fontWeight: "500",
                        background: "none",
                        color: "#ff3b30",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "#f2f2f7";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "none";
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
