/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import {
  radii,
  spacing,
  transitions,
  typography,
  zIndex,
} from "../styles/theme.ts";

interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  alt?: string;
  onClose: () => void;
}

const overlayStyle = css`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: ${zIndex.lightbox};
  padding: ${spacing.xl};
`;

const closeButtonStyle = css`
  position: absolute;
  top: ${spacing.xl};
  right: ${spacing.xl};
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  color: white;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${transitions.normal};
  z-index: 10000;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

const imageContainerStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  max-height: 100%;
`;

const imageStyle = (hasAlt: boolean) =>
  css`
    max-width: 100%;
    max-height: ${hasAlt ? "calc(100vh - 180px)" : "calc(100vh - 100px)"};
    object-fit: contain;
    border-radius: ${radii.md};
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  `;

const altTextStyle = css`
  margin-top: ${spacing.lg};
  max-width: 600px;
  padding: ${spacing.md} ${spacing.xl};
  background: rgba(0, 0, 0, 0.6);
  border-radius: ${radii.md};
  color: rgba(255, 255, 255, 0.95);
  font-size: ${typography.sizes.base};
  line-height: ${typography.lineHeights.normal};
  text-align: center;
  backdrop-filter: blur(10px);
`;

const instructionsStyle = css`
  position: absolute;
  bottom: ${spacing.xl};
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.6);
  font-size: ${typography.sizes.sm};
  text-align: center;
  pointer-events: none;
`;

export function ImageLightbox(
  { isOpen, imageUrl, alt, onClose }: ImageLightboxProps,
) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <button
        type="button"
        onClick={onClose}
        className={closeButtonStyle}
        aria-label="Close image viewer"
      >
        ×
      </button>

      <div
        className={imageContainerStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={alt || "Full size image"}
          className={imageStyle(!!alt)}
        />

        {alt && <div className={altTextStyle}>{alt}</div>}
      </div>

      <div className={instructionsStyle}>
        Click anywhere or press ESC to close
      </div>
    </div>
  );
}
