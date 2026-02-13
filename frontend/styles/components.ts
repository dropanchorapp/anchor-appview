import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
  zIndex,
} from "./theme.ts";

// ============ BUTTONS ============

const buttonBase = css`
  border: none;
  cursor: pointer;
  font-family: ${typography.fontFamily};
  font-weight: ${typography.weights.semibold};
  transition: all ${transitions.normal};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const buttonPrimary = css`
  ${buttonBase} background: ${colors.primary};
  color: white;
  border-radius: ${radii.md};
  padding: ${spacing.md} ${spacing.xl};
  font-size: ${typography.sizes.lg};

  &:hover:not(:disabled) {
    background: ${colors.primaryHover};
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
`;

export const buttonPrimaryPill = css`
  ${buttonPrimary} border-radius: ${radii.pill};
  padding: ${spacing.md} ${spacing.xxl};
`;

export const buttonPrimaryLarge = css`
  ${buttonPrimary} border-radius: ${radii.xl};
  padding: 14px 32px;
  font-size: ${typography.sizes.lg};

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }
`;

export const buttonSecondary = css`
  ${buttonBase} background: ${colors.surfaceHover};
  color: ${colors.text};
  border-radius: ${radii.md};
  padding: ${spacing.md} ${spacing.lg};
  font-size: ${typography.sizes.lg};

  &:hover:not(:disabled) {
    background: ${colors.surfaceActive};
  }
`;

export const buttonText = css`
  ${buttonBase} background: none;
  color: ${colors.primary};
  padding: ${spacing.md} ${spacing.lg};
  font-size: ${typography.sizes.lg};
  border-radius: ${radii.md};

  &:hover:not(:disabled) {
    background: ${colors.primaryLight};
  }
`;

export const buttonIcon = css`
  ${buttonBase} background: none;
  border: none;
  padding: ${spacing.xs};
  color: ${colors.textSecondary};
  border-radius: ${radii.md};

  &:hover:not(:disabled) {
    background: ${colors.surfaceHover};
  }
`;

export const buttonClose = css`
  ${buttonIcon} font-size: ${typography.sizes.xl};
  padding: ${spacing.xs};
  border-radius: ${radii.xl};

  &:hover:not(:disabled) {
    background: ${colors.background};
  }
`;

export const buttonDanger = css`
  ${buttonBase} background: rgba(255, 255, 255, 0.95);
  color: ${colors.error};
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: ${radii.sm};
  padding: ${spacing.sm};
  font-size: ${typography.sizes.sm};

  &:hover:not(:disabled) {
    background: ${colors.errorLight};
    transform: scale(1.05);
  }
`;

// ============ FAB ============

export const fab = css`
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: ${colors.primary};
  border: none;
  box-shadow: ${shadows.primary};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${transitions.normal};
  z-index: ${zIndex.header};

  &:hover {
    transform: scale(1.1);
    box-shadow: ${shadows.primaryHover};
  }

  @media (max-width: 768px) {
    bottom: 16px;
    right: 16px;
    width: 60px;
    height: 60px;
    border-radius: 30px;
  }
`;

// ============ AVATARS ============

export const avatar = (size: number) =>
  css`
    width: ${size}px;
    height: ${size}px;
    border-radius: ${size / 2}px;
    object-fit: cover;
    flex-shrink: 0;
  `;

export const avatarFallback = (size: number, fontSize: number) =>
  css`
    width: ${size}px;
    height: ${size}px;
    border-radius: ${size / 2}px;
    background: ${colors.avatarGradient};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${fontSize}px;
    font-weight: ${typography.weights.semibold};
    color: white;
    flex-shrink: 0;
  `;

// ============ CARDS ============

export const card = css`
  background: ${colors.surface};
  border-radius: ${radii.xl};
  box-shadow: ${shadows.sm};
  padding: ${spacing.lg};
`;

export const cardHover = css`
  ${card} cursor: pointer;
  transition: transform ${transitions.fast}, box-shadow ${transitions.fast};

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${shadows.lg};
  }
`;

export const cardLarge = css`
  ${card} border-radius: ${radii.xxl};
  padding: ${spacing.xxl};
`;

// ============ MODALS ============

export const modalOverlay = css`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${colors.overlay};
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${zIndex.modal};
  padding: ${spacing.xl};

  @media (max-width: 768px) {
    padding: 0;
  }
`;

export const modalOverlayDark = css`
  ${modalOverlay} background: ${colors.overlayDark};
`;

export const modalContent = css`
  background: ${colors.surface};
  border-radius: ${radii.xxl};
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: ${shadows.modal};

  @media (max-width: 768px) {
    border-radius: 0;
    height: 100vh;
    max-height: 100vh;
  }
`;

export const modalContentSmall = css`
  ${modalContent} max-width: 400px;
  border-radius: ${radii.xxl};
  padding: ${spacing.xxxl};
  overflow: visible;

  @media (max-width: 768px) {
    border-radius: ${radii.xxl};
    height: auto;
    max-height: 90vh;
    margin: ${spacing.xl};
  }
`;

export const modalHeader = css`
  padding: ${spacing.xl};
  border-bottom: 1px solid ${colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const modalBody = css`
  flex: 1;
  overflow-y: auto;
  padding: ${spacing.xl};
`;

export const modalFooter = css`
  padding: ${spacing.lg} ${spacing.xl};
  border-top: 1px solid ${colors.border};
  display: flex;
  gap: ${spacing.md};
  justify-content: flex-end;
`;

// ============ FORMS ============

export const input = css`
  width: 100%;
  font-family: ${typography.fontFamily};
  font-size: ${typography.sizes.lg};
  padding: ${spacing.md} ${spacing.lg};
  border: 1px solid ${colors.border};
  border-radius: ${radii.md};
  background: ${colors.surface};
  color: ${colors.text};
  outline: none;
  transition: border-color ${transitions.normal};

  &:focus {
    border-color: ${colors.primary};
  }

  &::placeholder {
    color: ${colors.textMuted};
  }

  &:disabled {
    background: ${colors.surfaceHover};
    cursor: not-allowed;
  }
`;

export const textarea = css`
  ${input} font-family: inherit;
  resize: vertical;
  min-height: 120px;
  line-height: ${typography.lineHeights.relaxed};
`;

export const label = css`
  display: block;
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.medium};
  color: ${colors.text};
  margin-bottom: ${spacing.sm};
`;

export const helperText = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  margin-top: ${spacing.sm};
`;

export const formGroup = css`
  margin-bottom: ${spacing.xxl};
`;

// ============ SPINNERS ============

export const spinner = (size = 20) =>
  css`
    width: ${size}px;
    height: ${size}px;
    border: 2px solid ${colors.border};
    border-top-color: ${colors.primary};
    border-radius: 50%;
    animation: spin 1s ease-in-out infinite;
  `;

export const spinnerWhite = (size = 16) =>
  css`
    width: ${size}px;
    height: ${size}px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;

export const spinnerContainer = css`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xxxxl} 0;
`;

// ============ TYPOGRAPHY ============

export const heading1 = css`
  font-size: ${typography.sizes.xxxxl};
  font-weight: ${typography.weights.bold};
  color: ${colors.text};
  line-height: ${typography.lineHeights.tight};
  margin: 0;
`;

export const heading2 = css`
  font-size: ${typography.sizes.xxl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  line-height: ${typography.lineHeights.tight};
  margin: 0;
`;

export const heading3 = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  line-height: ${typography.lineHeights.normal};
  margin: 0;
`;

export const textBody = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textBody};
  line-height: ${typography.lineHeights.relaxed};
`;

export const textSecondary = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
  line-height: ${typography.lineHeights.normal};
`;

export const textSmall = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
`;

// ============ ALERTS ============

export const alertError = css`
  position: fixed;
  bottom: ${spacing.xl};
  right: ${spacing.xl};
  background: ${colors.error};
  color: white;
  border-radius: ${radii.xl};
  box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);
  padding: ${spacing.md} ${spacing.lg};
  max-width: 300px;
  font-size: ${typography.sizes.md};
  z-index: ${zIndex.dropdown};
`;

export const alertWarning = css`
  background: ${colors.warningBg};
  border: 1px solid ${colors.warning};
  border-radius: ${radii.md};
  padding: ${spacing.md};
  font-size: ${typography.sizes.md};
  color: ${colors.warningText};
`;

// ============ LAYOUT UTILITIES ============

export const flexRow = css`
  display: flex;
  flex-direction: row;
  align-items: center;
`;

export const flexRowGap = (gap: keyof typeof spacing) =>
  css`
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: ${spacing[gap]};
  `;

export const flexColumn = css`
  display: flex;
  flex-direction: column;
`;

export const flexColumnGap = (gap: keyof typeof spacing) =>
  css`
    display: flex;
    flex-direction: column;
    gap: ${spacing[gap]};
  `;

export const flexCenter = css`
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const flexBetween = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const container = css`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 ${spacing.xl};
`;

export const containerNarrow = css`
  max-width: 600px;
  margin: 0 auto;
  padding: 0 ${spacing.xl};
`;

// ============ DROPDOWN ============

export const dropdown = css`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: ${spacing.sm};
  background: ${colors.surface};
  border-radius: ${radii.xl};
  box-shadow: ${shadows.lg};
  padding: ${spacing.sm};
  min-width: 120px;
  z-index: ${zIndex.dropdown};
`;

export const dropdownItem = css`
  width: 100%;
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.medium};
  background: none;
  border: none;
  border-radius: ${radii.md};
  padding: ${spacing.sm} ${spacing.md};
  cursor: pointer;
  text-align: left;
  transition: background ${transitions.fast};
  color: ${colors.text};

  &:hover {
    background: ${colors.surfaceHover};
  }
`;

export const dropdownItemDanger = css`
  ${dropdownItem} color: ${colors.error};
`;

// ============ HEADER ============

export const header = css`
  background: ${colors.surface};
  border-bottom: 1px solid ${colors.border};
  position: sticky;
  top: 0;
  z-index: ${zIndex.header};
  padding: ${spacing.lg} ${spacing.xl};
`;

export const headerContent = css`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

// ============ LIGHTBOX ============

export const lightboxOverlay = css`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${colors.overlayDark};
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${zIndex.lightbox};
  cursor: zoom-out;
`;

export const lightboxImage = css`
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: ${radii.lg};
`;

export const lightboxClose = css`
  position: absolute;
  top: ${spacing.xl};
  right: ${spacing.xl};
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: ${colors.text};
  transition: all ${transitions.fast};

  &:hover {
    background: white;
    transform: scale(1.1);
  }
`;

// ============ LOCATION BADGE ============

export const locationBadge = css`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  font-size: ${typography.sizes.md};
  color: ${colors.primary};
  background: ${colors.primaryLight};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${radii.md};
  width: fit-content;
`;

// ============ EMPTY STATE ============

export const emptyState = css`
  text-align: center;
  padding: ${spacing.xxxxl} ${spacing.xl};
`;

export const emptyStateIcon = css`
  font-size: 48px;
  margin-bottom: ${spacing.lg};
`;

export const emptyStateTitle = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.sm};
`;

export const emptyStateText = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textSecondary};
`;
