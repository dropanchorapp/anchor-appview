// Design tokens extracted from existing inline styles

export const colors = {
  // Primary
  primary: "#007aff",
  primaryHover: "#0056b3",
  primaryLight: "#eff6ff",

  // Text - Slate palette for subtle blue tint
  text: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  textBody: "#334155",

  // Backgrounds - Subtle blue tint (Slate palette)
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceHover: "#f1f5f9",
  surfaceActive: "#e2e8f0",

  // Borders - Slate palette
  border: "#e2e8f0",
  borderLight: "#f1f5f9",

  // Semantic
  error: "#ff3b30",
  errorLight: "#ffebee",
  warning: "#ffc107",
  warningBg: "#fff3cd",
  warningText: "#856404",
  success: "#34c759",

  // Gradients
  avatarGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",

  // Overlay
  overlay: "rgba(0, 0, 0, 0.5)",
  overlayDark: "rgba(0, 0, 0, 0.8)",

  // Sidebar
  sidebarBg: "#ffffff",
  sidebarBorder: "#e2e8f0",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  xxl: "24px",
  xxxl: "32px",
  xxxxl: "40px",
} as const;

export const radii = {
  xs: "4px",
  sm: "6px",
  md: "8px",
  lg: "10px",
  xl: "12px",
  xxl: "16px",
  pill: "22px",
  round: "50%",
} as const;

export const shadows = {
  sm: "0 1px 3px rgba(0,0,0,0.1)",
  md: "0 2px 8px rgba(0,0,0,0.08)",
  lg: "0 4px 12px rgba(0,0,0,0.15)",
  xl: "0 8px 24px rgba(0,0,0,0.2)",
  primary: "0 4px 12px rgba(0, 122, 255, 0.4)",
  primaryHover: "0 6px 16px rgba(0, 122, 255, 0.5)",
  modal: "0 20px 60px rgba(0, 0, 0, 0.3)",
} as const;

export const typography = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontFamilyMono: "monospace",

  sizes: {
    xs: "12px",
    sm: "13px",
    md: "14px",
    base: "15px",
    lg: "16px",
    xl: "18px",
    xxl: "20px",
    xxxl: "24px",
    xxxxl: "32px",
    xxxxxl: "48px",
  },

  weights: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },

  lineHeights: {
    tight: "1.2",
    normal: "1.4",
    relaxed: "1.5",
    loose: "1.6",
  },
} as const;

export const transitions = {
  fast: "0.1s ease-in-out",
  normal: "0.2s ease",
  slow: "0.3s ease",
} as const;

export const zIndex = {
  header: 100,
  dropdown: 1000,
  modal: 2000,
  lightbox: 9999,
} as const;

export const breakpoints = {
  sm: "480px",
  md: "768px",
  lg: "1024px",
  xl: "1200px",
} as const;
