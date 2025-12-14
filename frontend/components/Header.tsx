/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  breakpoints,
  colors,
  radii,
  spacing,
  transitions,
  zIndex,
} from "../styles/theme.ts";

interface HeaderProps {
  onMenuToggle: () => void;
}

const headerStyle = css`
  position: sticky;
  top: 0;
  z-index: ${zIndex.header};
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
`;

const headerContentStyle = css`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md} ${spacing.xl};
  height: 72px;

  @media (max-width: ${breakpoints.md}) {
    padding: ${spacing.md} ${spacing.lg};
  }
`;

const logoContainerStyle = css`
  display: flex;
  align-items: center;
`;

const logoLinkStyle = css`
  display: flex;
  align-items: center;
  text-decoration: none;
`;

const logoStyle = css`
  height: 44px;
  width: auto;
  max-width: 180px;
`;

const menuButtonStyle = css`
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid ${colors.border};
  border-radius: ${radii.lg};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceHover};
  }

  svg {
    width: 24px;
    height: 24px;
    color: ${colors.text};
  }

  @media (max-width: ${breakpoints.md}) {
    display: flex;
  }
`;

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export function Header({ onMenuToggle }: HeaderProps) {
  return (
    <header className={headerStyle}>
      <div className={headerContentStyle}>
        <div className={logoContainerStyle}>
          <a href="/" className={logoLinkStyle}>
            <img
              src="https://cdn.dropanchor.app/images/anchor-logo.png"
              alt="Anchor"
              className={logoStyle}
            />
          </a>
        </div>

        <button
          type="button"
          onClick={onMenuToggle}
          className={menuButtonStyle}
          aria-label="Toggle menu"
        >
          <MenuIcon />
        </button>
      </div>
    </header>
  );
}
