import { injectGlobal } from "https://esm.sh/@emotion/css@11.13.5";
import { colors, typography } from "./theme.ts";

let injected = false;

/**
 * Inject global CSS styles. Safe to call multiple times - only injects once.
 * Consolidates duplicate global CSS from App.tsx, CheckinDetail.tsx, MobileAuth.tsx
 */
export function injectGlobalStyles(): void {
  if (injected) return;
  injected = true;

  injectGlobal`
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: ${typography.fontFamily};
      line-height: ${typography.lineHeights.relaxed};
      color: ${colors.text};
      background: ${colors.background};
      min-height: 100vh;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Prevent iOS zoom on input focus */
    @media (max-width: 768px) {
      body {
        font-size: 16px;
      }
    }

    /* Scrollbar styling for webkit browsers */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: ${colors.border};
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: ${colors.textMuted};
    }
  `;
}
