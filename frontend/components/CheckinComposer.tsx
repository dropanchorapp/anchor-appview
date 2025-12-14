/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useState } from "https://esm.sh/react@19.1.0";
import { css } from "https://esm.sh/@emotion/css@11.13.5";
import imageCompression from "https://esm.sh/browser-image-compression@2.0.2";
import type { Place } from "../types/index.ts";
import { apiFetch } from "../utils/api.ts";
import {
  buttonPrimary,
  buttonSecondary,
  input,
  modalBody,
  modalContent,
  modalFooter,
  modalHeader,
  modalOverlay,
  spinner,
  spinnerWhite,
  textarea,
} from "../styles/components.ts";
import {
  colors,
  radii,
  shadows,
  spacing,
  transitions,
  typography,
} from "../styles/theme.ts";

interface CheckinComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (checkinUrl: string) => void;
}

type Step = "location" | "venue" | "compose";
type VenueTab = "nearby" | "search";

// ============ LOCAL STYLES ============

const overlayStyle = css`
  ${modalOverlay} @media (max-width: 768px) {
    padding: 0;
  }
`;

const dialogStyle = css`
  ${modalContent} box-shadow: ${shadows.modal};
`;

const headerStyle = css`
  ${modalHeader};
`;

const headerTitleStyle = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin: 0;
`;

const closeButtonStyle = css`
  background: none;
  border: none;
  cursor: pointer;
  padding: ${spacing.xs};
  color: ${colors.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${radii.md};
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceHover};
    color: ${colors.text};
  }
`;

const bodyStyle = css`
  ${modalBody};
`;

const footerStyle = css`
  ${modalFooter};
`;

// Location Step Styles
const locationStepStyle = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${spacing.xxl};
  text-align: center;
`;

const locationIconContainerStyle = css`
  width: 80px;
  height: 80px;
  background: ${colors.primaryLight};
  border-radius: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const locationTitleStyle = css`
  font-size: ${typography.sizes.xl};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.sm};
`;

const locationDescStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textSecondary};
  line-height: ${typography.lineHeights.relaxed};
  max-width: 400px;
  margin: 0 auto;
`;

const warningBoxStyle = css`
  background: ${colors.warningBg};
  border: 1px solid ${colors.warning};
  border-radius: ${radii.md};
  padding: ${spacing.md};
  font-size: ${typography.sizes.md};
  color: ${colors.warningText};
`;

const locationButtonStyle = css`
  ${buttonPrimary} border-radius: ${radii.xl};
  padding: 14px 32px;
  font-size: ${typography.sizes.lg};
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
`;

// Venue Step Styles
const venueStepStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.lg};
`;

const segmentedControlStyle = css`
  display: flex;
  background: ${colors.background};
  padding: ${spacing.xs};
  border-radius: ${radii.lg};
  gap: ${spacing.xs};
`;

const segmentButtonStyle = (isActive: boolean) =>
  css`
    flex: 1;
    padding: ${spacing.sm} ${spacing.lg};
    border: none;
    border-radius: ${radii.md};
    background: ${isActive ? colors.surface : "transparent"};
    color: ${isActive ? colors.primary : colors.textSecondary};
    font-size: ${typography.sizes.base};
    font-weight: ${isActive
      ? typography.weights.semibold
      : typography.weights.medium};
    cursor: pointer;
    transition: all ${transitions.normal};
  `;

const searchRowStyle = css`
  display: flex;
  gap: ${spacing.sm};
`;

const searchInputContainerStyle = css`
  flex: 1;
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  background: ${colors.background};
  border-radius: ${radii.lg};
  padding: ${spacing.md} ${spacing.md};
`;

const searchInputStyle = css`
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: ${typography.sizes.base};
  color: ${colors.text};

  &::placeholder {
    color: ${colors.textMuted};
  }
`;

const searchButtonStyle = css`
  ${buttonPrimary} border-radius: ${radii.lg};
  padding: ${spacing.md} ${spacing.xl};
  font-size: ${typography.sizes.base};
`;

const loadingContainerStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: ${spacing.md};
`;

const loadingTextStyle = css`
  font-size: ${typography.sizes.base};
  color: ${colors.textSecondary};
`;

const venueListStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
  max-height: 400px;
  overflow-y: auto;
`;

const venueButtonStyle = css`
  background: ${colors.surface};
  border: 1px solid ${colors.border};
  border-radius: ${radii.lg};
  padding: ${spacing.md};
  cursor: pointer;
  text-align: left;
  transition: all ${transitions.normal};

  &:hover {
    background: ${colors.surfaceHover};
    border-color: ${colors.primary};
  }
`;

const venueRowStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
`;

const venueIconStyle = css`
  width: 40px;
  height: 40px;
  background: ${colors.primaryLight};
  border-radius: ${radii.md};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.sizes.xl};
`;

const venueNameStyle = css`
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: 2px;
`;

const venueLocalityStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
`;

// Compose Step Styles
const composeStepStyle = css`
  display: flex;
  flex-direction: column;
  gap: ${spacing.xl};
`;

const selectedVenueCardStyle = css`
  background: ${colors.surfaceHover};
  border: 1px solid ${colors.border};
  border-radius: ${radii.lg};
  padding: ${spacing.lg};
`;

const selectedVenueRowStyle = css`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
`;

const selectedVenueIconStyle = css`
  width: 48px;
  height: 48px;
  background: ${colors.primaryLight};
  border-radius: ${radii.lg};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${typography.sizes.xxl};
`;

const selectedVenueNameStyle = css`
  font-size: ${typography.sizes.lg};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: 2px;
`;

const selectedVenueAddressStyle = css`
  font-size: ${typography.sizes.md};
  color: ${colors.textSecondary};
`;

const changeVenueButtonStyle = css`
  background: none;
  border: none;
  color: ${colors.primary};
  font-size: ${typography.sizes.md};
  font-weight: ${typography.weights.medium};
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const formLabelStyle = css`
  display: block;
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.semibold};
  color: ${colors.text};
  margin-bottom: ${spacing.sm};
`;

const textareaStyle = css`
  ${textarea} min-height: 120px;
  font-size: ${typography.sizes.base};
`;

const charCountStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  text-align: right;
  margin-top: ${spacing.xs};
`;

const uploadLabelStyle = css`
  display: inline-flex;
  align-items: center;
  gap: ${spacing.sm};
  padding: ${spacing.md} ${spacing.lg};
  background: ${colors.background};
  border: 1px solid ${colors.border};
  border-radius: ${radii.lg};
  font-size: ${typography.sizes.base};
  font-weight: ${typography.weights.medium};
  color: ${colors.primary};
  cursor: pointer;
  transition: all ${transitions.fast};

  &:hover {
    background: ${colors.surfaceHover};
    border-color: ${colors.primary};
  }
`;

const uploadHintStyle = css`
  font-size: ${typography.sizes.sm};
  color: ${colors.textSecondary};
  margin-top: ${spacing.sm};
`;

const imagePreviewContainerStyle = css`
  border: 1px solid ${colors.border};
  border-radius: ${radii.lg};
  overflow: hidden;
`;

const imagePreviewStyle = css`
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: contain;
  display: block;
`;

const removeImageButtonStyle = css`
  position: absolute;
  top: ${spacing.md};
  right: ${spacing.md};
  width: 32px;
  height: 32px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 50%;
  color: white;
  font-size: ${typography.sizes.xl};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${transitions.fast};

  &:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.1);
  }
`;

const imageAltContainerStyle = css`
  padding: ${spacing.md};
`;

const imageAltInputStyle = css`
  ${input} font-size: ${typography.sizes.md};
  padding: ${spacing.sm} ${spacing.md};
`;

// Footer Buttons
const backButtonStyle = css`
  ${buttonSecondary} flex: 1;
  border-radius: ${radii.lg};
  padding: ${spacing.md};
  font-size: ${typography.sizes.lg};
`;

const submitButtonStyle = css`
  ${buttonPrimary} flex: 2;
  border-radius: ${radii.lg};
  padding: ${spacing.md};
  font-size: ${typography.sizes.lg};
`;

// ============ COMPONENT ============

export function CheckinComposer(
  { isOpen, onClose, onSuccess }: CheckinComposerProps,
) {
  const [step, setStep] = useState<Step>("location");
  const [venueTab, setVenueTab] = useState<VenueTab>("nearby");
  const [userLocation, setUserLocation] = useState<
    { lat: number; lng: number } | null
  >(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const [venues, setVenues] = useState<Place[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedVenue, setSelectedVenue] = useState<Place | null>(null);
  const [checkinMessage, setCheckinMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Image state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [processingImage, setProcessingImage] = useState(false);

  if (!isOpen) return null;

  const requestLocation = async () => {
    setLoadingLocation(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError(
        "Geolocation is not supported by your browser. Please use a modern browser or enter your location manually.",
      );
      setLoadingLocation(false);
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        },
      );

      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      setUserLocation(location);
      setStep("venue");
      await loadNearbyVenues(location.lat, location.lng);
    } catch (error: any) {
      if (error.code === 1) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isSafari = /^((?!chrome|android).)*safari/i.test(
          navigator.userAgent,
        );

        if (isIOS || isSafari) {
          setLocationError(
            "Location access denied. On iOS/Safari, go to Settings > Safari > Location > Allow, then refresh and try again.",
          );
        } else {
          setLocationError(
            "Location access denied. Please allow location access in your browser settings and try again.",
          );
        }
      } else if (error.code === 2) {
        setLocationError(
          "Location unavailable. Make sure location services are enabled on your device.",
        );
      } else if (error.code === 3) {
        setLocationError("Location request timed out. Please try again.");
      } else {
        setLocationError("Failed to get location. Please try again.");
      }
    } finally {
      setLoadingLocation(false);
    }
  };

  const loadNearbyVenues = async (lat: number, lng: number) => {
    setLoadingVenues(true);
    setVenuesError(null);

    try {
      const response = await fetch(
        `/api/places/nearby?lat=${lat}&lng=${lng}&radius=1000&limit=30`,
      );

      if (!response.ok) {
        throw new Error("Failed to load nearby venues");
      }

      const data = await response.json();
      setVenues(data.places || []);

      if (data.places?.length === 0) {
        setVenuesError(
          "No venues found nearby. Try searching by name instead.",
        );
      }
    } catch (error) {
      console.error("Error loading nearby venues:", error);
      setVenuesError(
        "Nearby venues timed out. Please use search by name instead.",
      );
      setVenueTab("search");
    } finally {
      setLoadingVenues(false);
    }
  };

  const searchVenuesByName = async () => {
    if (!searchQuery.trim() || !userLocation) return;

    setLoadingVenues(true);
    setVenuesError(null);

    try {
      const response = await fetch(
        `/api/places/search?q=${
          encodeURIComponent(searchQuery)
        }&lat=${userLocation.lat}&lng=${userLocation.lng}`,
      );

      if (!response.ok) {
        throw new Error("Failed to search venues");
      }

      const data = await response.json();
      setVenues(data.places || []);

      if (data.places?.length === 0) {
        setVenuesError("No venues found. Try a different search term.");
      }
    } catch (error) {
      console.error("Error searching venues:", error);
      setVenuesError("Failed to search venues. Please try again.");
    } finally {
      setLoadingVenues(false);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      alert("Image too large. Please select an image under 30MB");
      return;
    }

    setProcessingImage(true);

    try {
      const processed = await processImageWithOrientation(file);
      setSelectedImage(processed);

      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(processed);
    } catch (error) {
      console.error("Image processing error:", error);
      alert("Failed to process image");
    } finally {
      setProcessingImage(false);
    }
  };

  const processImageWithOrientation = async (file: File): Promise<File> => {
    console.log(
      `📸 Processing image: ${file.name} (${file.size} bytes, ${file.type})`,
    );

    const options = {
      maxSizeMB: 5,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      exifOrientation: undefined,
      fileType: "image/jpeg",
      initialQuality: 0.9,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      console.log(
        `✅ Image processed: ${compressedFile.size} bytes (${
          Math.round((compressedFile.size / file.size) * 100)
        }% of original)`,
      );
      return compressedFile;
    } catch (error) {
      console.error("Image compression error:", error);
      throw new Error("Failed to process image");
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setImageAlt("");
  };

  const submitCheckin = async () => {
    if (!selectedVenue) return;

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("place", JSON.stringify(selectedVenue));
      formData.append("message", checkinMessage.trim());

      if (selectedImage) {
        formData.append("image", selectedImage);
        if (imageAlt) {
          formData.append("imageAlt", imageAlt);
        }
      }

      const response = await apiFetch("/api/checkins", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create check-in");
      }

      const result = await response.json();
      const checkinUrl = `/checkins/${result.checkinUri.split("/")[2]}/${
        result.checkinUri.split("/").pop()
      }`;
      onSuccess(checkinUrl);
    } catch (error: any) {
      alert(error.message || "Failed to create check-in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && globalThis.innerWidth > 768) {
      onClose();
    }
  };

  return (
    <div className={overlayStyle} onClick={handleOverlayClick}>
      <div className={dialogStyle}>
        {/* Header */}
        <div className={headerStyle}>
          <h2 className={headerTitleStyle}>
            {step === "location" && "Get Location"}
            {step === "venue" && "Choose Venue"}
            {step === "compose" && "Create Check-in"}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className={closeButtonStyle}
            title="Close"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className={bodyStyle}>
          {/* Step 1: Location */}
          {step === "location" && (
            <div className={locationStepStyle}>
              <div className={locationIconContainerStyle}>
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>

              <div>
                <h3 className={locationTitleStyle}>We need your location</h3>
                <p className={locationDescStyle}>
                  Allow location access to find nearby venues and create
                  check-ins.
                </p>
              </div>

              {locationError && (
                <div className={warningBoxStyle}>{locationError}</div>
              )}

              <button
                type="button"
                onClick={requestLocation}
                disabled={loadingLocation}
                className={locationButtonStyle}
              >
                {loadingLocation
                  ? (
                    <>
                      <div className={spinnerWhite(16)} />
                      Getting location...
                    </>
                  )
                  : (
                    "Allow Location Access"
                  )}
              </button>
            </div>
          )}

          {/* Step 2: Venue Selection */}
          {step === "venue" && (
            <div className={venueStepStyle}>
              {/* Segmented Control */}
              <div className={segmentedControlStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setVenueTab("nearby");
                    if (userLocation && venues.length === 0) {
                      loadNearbyVenues(userLocation.lat, userLocation.lng);
                    }
                  }}
                  className={segmentButtonStyle(venueTab === "nearby")}
                >
                  Nearby
                </button>
                <button
                  type="button"
                  onClick={() => setVenueTab("search")}
                  className={segmentButtonStyle(venueTab === "search")}
                >
                  Search
                </button>
              </div>

              {/* Search Input */}
              {venueTab === "search" && (
                <div className={searchRowStyle}>
                  <div className={searchInputContainerStyle}>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.textSecondary}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search for a venue..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          searchVenuesByName();
                        }
                      }}
                      className={searchInputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={searchVenuesByName}
                    disabled={loadingVenues || !searchQuery.trim()}
                    className={searchButtonStyle}
                  >
                    Search
                  </button>
                </div>
              )}

              {/* Loading State */}
              {loadingVenues && (
                <div className={loadingContainerStyle}>
                  <div className={spinner(20)} />
                  <span className={loadingTextStyle}>
                    {venueTab === "nearby"
                      ? "Finding nearby venues..."
                      : "Searching..."}
                  </span>
                </div>
              )}

              {/* Error State */}
              {venuesError && !loadingVenues && (
                <div
                  className={warningBoxStyle}
                  style={{ textAlign: "center" }}
                >
                  {venuesError}
                </div>
              )}

              {/* Venues List */}
              {!loadingVenues && venues.length > 0 && (
                <div className={venueListStyle}>
                  {venues.map((venue) => (
                    <button
                      key={venue.id}
                      type="button"
                      onClick={() => {
                        setSelectedVenue(venue);
                        setStep("compose");
                      }}
                      className={venueButtonStyle}
                    >
                      <div className={venueRowStyle}>
                        <div className={venueIconStyle}>
                          {venue.icon || "📍"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className={venueNameStyle}>{venue.name}</div>
                          {venue.address?.locality && (
                            <div className={venueLocalityStyle}>
                              {venue.address.locality}
                            </div>
                          )}
                        </div>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={colors.textMuted}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Compose Check-in */}
          {step === "compose" && selectedVenue && (
            <div className={composeStepStyle}>
              {/* Selected Venue Preview */}
              <div className={selectedVenueCardStyle}>
                <div className={selectedVenueRowStyle}>
                  <div className={selectedVenueIconStyle}>
                    {selectedVenue.icon || "📍"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className={selectedVenueNameStyle}>
                      {selectedVenue.name}
                    </div>
                    {selectedVenue.address && (
                      <div className={selectedVenueAddressStyle}>
                        {[
                          selectedVenue.address.street,
                          selectedVenue.address.locality,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVenue(null);
                      setStep("venue");
                    }}
                    className={changeVenueButtonStyle}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className={formLabelStyle}>
                  What's happening? (optional)
                </label>
                <textarea
                  value={checkinMessage}
                  onChange={(e) =>
                    setCheckinMessage(e.target.value)}
                  placeholder="Share your thoughts..."
                  maxLength={280}
                  className={textareaStyle}
                />
                <div className={charCountStyle}>
                  {checkinMessage.length}/280
                </div>
              </div>

              {/* Image Attachment */}
              <div>
                <label className={formLabelStyle}>Add a photo (optional)</label>

                {!selectedImage && (
                  <div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleImageSelect}
                      disabled={processingImage}
                      style={{ display: "none" }}
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className={uploadLabelStyle}
                      style={{
                        cursor: processingImage ? "not-allowed" : "pointer",
                        opacity: processingImage ? 0.5 : 1,
                      }}
                    >
                      <span style={{ fontSize: typography.sizes.xl }}>📷</span>
                      {processingImage ? "Processing..." : "Choose Photo"}
                    </label>
                    <div className={uploadHintStyle}>
                      Max 30MB • JPEG, PNG, WebP, or GIF
                    </div>
                  </div>
                )}

                {selectedImage && imagePreview && (
                  <div className={imagePreviewContainerStyle}>
                    <div style={{ position: "relative" }}>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className={imagePreviewStyle}
                      />
                      <button
                        type="button"
                        onClick={removeImage}
                        className={removeImageButtonStyle}
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                    <div className={imageAltContainerStyle}>
                      <input
                        type="text"
                        value={imageAlt}
                        onChange={(e) =>
                          setImageAlt(e.target.value)}
                        placeholder="Describe this image (for accessibility)"
                        maxLength={200}
                        className={imageAltInputStyle}
                      />
                      <div className={charCountStyle}>
                        {imageAlt.length}/200
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "compose" && (
          <div className={footerStyle}>
            <button
              type="button"
              onClick={() => {
                setSelectedVenue(null);
                setStep("venue");
              }}
              className={backButtonStyle}
            >
              Back
            </button>
            <button
              type="button"
              onClick={submitCheckin}
              disabled={submitting || !selectedVenue}
              className={submitButtonStyle}
            >
              {submitting
                ? (
                  <>
                    <div className={spinnerWhite(16)} />
                    Posting...
                  </>
                )
                : (
                  "Post Check-in"
                )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
