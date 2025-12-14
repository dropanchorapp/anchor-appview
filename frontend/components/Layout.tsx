/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import { AuthState } from "../types/index.ts";
import { Sidebar } from "./Sidebar.tsx";
import { RightSidebar } from "./RightSidebar.tsx";
import {
  breakpoints,
  colors,
  spacing,
  transitions,
  zIndex,
} from "../styles/theme.ts";

interface LayoutProps {
  auth: AuthState;
  onLogin: () => void;
  onLogout: () => void;
  onCreateCheckin: () => void;
  children: React.ReactNode;
  currentPath?: string;
}

const layoutContainerStyle = css`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const mainWrapperStyle = css`
  display: flex;
  flex: 1;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  padding: 0 ${spacing.lg};

  @media (max-width: ${breakpoints.md}) {
    padding: 0;
  }
`;

const leftSidebarStyle = css`
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  padding: ${spacing.xl} 0;
  overflow-y: auto;

  @media (max-width: ${breakpoints.md}) {
    display: none;
  }
`;

const centerColumnStyle = css`
  flex: 1;
  min-width: 0;
  padding: ${spacing.xl} ${spacing.xxl};
  max-width: 680px;

  @media (max-width: ${breakpoints.lg}) {
    max-width: none;
  }

  @media (max-width: ${breakpoints.md}) {
    padding: ${spacing.lg};
  }
`;

const rightSidebarStyle = css`
  width: 280px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  padding: ${spacing.xl} 0;
  overflow-y: auto;

  @media (max-width: ${breakpoints.lg}) {
    display: none;
  }
`;

// Mobile header with hamburger menu (only visible on mobile)
const mobileHeaderStyle = css`
  display: none;
  position: sticky;
  top: 0;
  z-index: ${zIndex.header};
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
  padding: ${spacing.md} ${spacing.lg};

  @media (max-width: ${breakpoints.md}) {
    display: flex;
    align-items: center;
    gap: ${spacing.md};
  }
`;

const hamburgerButtonStyle = css`
  background: none;
  border: none;
  padding: ${spacing.sm};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: background ${transitions.fast};

  &:hover {
    background: ${colors.surfaceHover};
  }

  svg {
    width: 24px;
    height: 24px;
    color: ${colors.text};
  }
`;

const mobileLogoStyle = css`
  height: 32px;
  width: auto;
`;

// Logo for desktop (scrolls with content)
const desktopLogoContainerStyle = css`
  display: flex;
  justify-content: center;
  margin-bottom: ${spacing.xxl};

  @media (max-width: ${breakpoints.md}) {
    display: none;
  }
`;

const desktopLogoStyle = css`
  height: 80px;
  width: auto;
`;

const mobileMenuOverlayStyle = css`
  display: none;
  position: fixed;
  inset: 0;
  background: ${colors.overlay};
  z-index: ${zIndex.modal - 1};
  animation: fadeIn 0.2s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: ${breakpoints.md}) {
    display: block;
  }
`;

const mobileSidebarStyle = css`
  display: none;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: ${colors.sidebarBg};
  z-index: ${zIndex.modal};
  padding: ${spacing.xl};
  overflow-y: auto;
  animation: slideIn 0.2s ease;

  @keyframes slideIn {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @media (max-width: ${breakpoints.md}) {
    display: block;
  }
`;

export function Layout({
  auth,
  onLogin,
  onLogout,
  onCreateCheckin,
  children,
  currentPath = "/",
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  // Hamburger menu icon
  const HamburgerIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );

  return (
    <div className={layoutContainerStyle}>
      {/* Mobile header with hamburger menu */}
      <div className={mobileHeaderStyle}>
        <button
          type="button"
          onClick={handleMobileMenuToggle}
          className={hamburgerButtonStyle}
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>
        <img
          src="https://cdn.dropanchor.app/images/anchor-logo.png"
          alt="Anchor"
          className={mobileLogoStyle}
        />
      </div>

      <div className={mainWrapperStyle}>
        {/* Desktop left sidebar */}
        <aside className={leftSidebarStyle}>
          <Sidebar
            auth={auth}
            onLogin={onLogin}
            onLogout={onLogout}
            onCreateCheckin={onCreateCheckin}
            currentPath={currentPath}
          />
        </aside>

        {/* Center content */}
        <main className={centerColumnStyle}>
          {/* Desktop logo that scrolls with content */}
          <div className={desktopLogoContainerStyle}>
            <img
              src="https://cdn.dropanchor.app/images/anchor-logo.png"
              alt="Anchor"
              className={desktopLogoStyle}
            />
          </div>
          {children}
        </main>

        {/* Desktop right sidebar */}
        <aside className={rightSidebarStyle}>
          <RightSidebar />
        </aside>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className={mobileMenuOverlayStyle}
            onClick={handleCloseMobileMenu}
          />
          <div className={mobileSidebarStyle}>
            <Sidebar
              auth={auth}
              onLogin={onLogin}
              onLogout={onLogout}
              onCreateCheckin={onCreateCheckin}
              currentPath={currentPath}
              onNavigate={handleCloseMobileMenu}
            />
          </div>
        </>
      )}
    </div>
  );
}
