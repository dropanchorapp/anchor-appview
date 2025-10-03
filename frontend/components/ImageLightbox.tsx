/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useEffect } from "https://esm.sh/react@19.1.0";

interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox(
  { isOpen, imageUrl, alt, onClose }: ImageLightboxProps,
) {
  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    // Prevent body scrolling when lightbox is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.9)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          width: "44px",
          height: "44px",
          background: "rgba(255, 255, 255, 0.1)",
          border: "2px solid rgba(255, 255, 255, 0.3)",
          borderRadius: "50%",
          color: "white",
          fontSize: "24px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease-in-out",
          zIndex: 10000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
          e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
        }}
        aria-label="Close image viewer"
      >
        ×
      </button>

      {/* Image container with space for alt text */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <img
          src={imageUrl}
          alt={alt || "Full size image"}
          style={{
            maxWidth: "100%",
            maxHeight: alt ? "calc(100vh - 180px)" : "calc(100vh - 100px)",
            objectFit: "contain",
            borderRadius: "8px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
          }}
        />

        {/* Alt text (if provided) */}
        {alt && (
          <div
            style={{
              marginTop: "16px",
              maxWidth: "600px",
              padding: "12px 20px",
              background: "rgba(0, 0, 0, 0.6)",
              borderRadius: "8px",
              color: "rgba(255, 255, 255, 0.95)",
              fontSize: "15px",
              lineHeight: "1.4",
              textAlign: "center",
              backdropFilter: "blur(10px)",
            }}
          >
            {alt}
          </div>
        )}
      </div>

      {/* Instructions text */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255, 255, 255, 0.6)",
          fontSize: "13px",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        Click anywhere or press ESC to close
      </div>
    </div>
  );
}
