/** @jsxImportSource https://esm.sh/react@19.1.0 */
import { useState } from "https://esm.sh/react@19.1.0";
import type { Place } from "../types/index.ts";

interface CheckinComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (checkinUrl: string) => void;
}

type Step = "location" | "venue" | "compose";
type VenueTab = "nearby" | "search";

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

  if (!isOpen) return null;

  // Get user's browser location
  const requestLocation = async () => {
    setLoadingLocation(true);
    setLocationError(null);

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

      // Automatically load nearby venues
      await loadNearbyVenues(location.lat, location.lng);
    } catch (error: any) {
      if (error.code === 1) {
        setLocationError(
          "Location permission denied. Please enable location access.",
        );
      } else if (error.code === 2) {
        setLocationError("Location unavailable. Please try again.");
      } else if (error.code === 3) {
        setLocationError("Location request timed out. Please try again.");
      } else {
        setLocationError("Failed to get location. Please try again.");
      }
    } finally {
      setLoadingLocation(false);
    }
  };

  // Load nearby venues using Overpass API
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
      setVenueTab("search"); // Auto-switch to search on timeout
    } finally {
      setLoadingVenues(false);
    }
  };

  // Search venues by name using Nominatim
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

  // Submit check-in
  const submitCheckin = async () => {
    if (!selectedVenue) return;

    setSubmitting(true);

    try {
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          place: selectedVenue,
          message: checkinMessage.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create check-in");
      }

      const result = await response.json();

      // Redirect to checkin detail page
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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: globalThis.innerWidth <= 768 ? "0" : "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && globalThis.innerWidth > 768) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: globalThis.innerWidth <= 768 ? "0" : "16px",
          maxWidth: "600px",
          width: "100%",
          height: globalThis.innerWidth <= 768 ? "100vh" : "auto",
          maxHeight: globalThis.innerWidth <= 768 ? "100vh" : "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #e5e5ea",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: "600",
              color: "#1c1c1e",
              margin: 0,
            }}
          >
            {step === "location" && "Get Location"}
            {step === "venue" && "Choose Venue"}
            {step === "compose" && "Create Check-in"}
          </h2>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#8e8e93",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
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
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
          }}
        >
          {/* Step 1: Location */}
          {step === "location" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "24px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  background: "#f0f8ff",
                  borderRadius: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#007aff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>

              <div>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#1c1c1e",
                    marginBottom: "8px",
                  }}
                >
                  We need your location
                </h3>
                <p
                  style={{
                    fontSize: "15px",
                    color: "#8e8e93",
                    lineHeight: "1.4",
                    maxWidth: "400px",
                    margin: "0 auto",
                  }}
                >
                  Allow location access to find nearby venues and create
                  check-ins.
                </p>
              </div>

              {locationError && (
                <div
                  style={{
                    background: "#fff3cd",
                    border: "1px solid #ffc107",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "14px",
                    color: "#856404",
                  }}
                >
                  {locationError}
                </div>
              )}

              <button
                type="button"
                onClick={requestLocation}
                disabled={loadingLocation}
                style={{
                  background: loadingLocation ? "#c7c7cc" : "#007aff",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  padding: "14px 32px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: loadingLocation ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {loadingLocation
                  ? (
                    <>
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          border: "2px solid white",
                          borderTop: "2px solid transparent",
                          borderRadius: "50%",
                          animation: "spin 1s linear infinite",
                        }}
                      />
                      Getting location...
                    </>
                  )
                  : "Allow Location Access"}
              </button>
            </div>
          )}

          {/* Step 2: Venue Selection */}
          {step === "venue" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {/* Segmented Control */}
              <div
                style={{
                  display: "flex",
                  background: "#f2f2f7",
                  padding: "4px",
                  borderRadius: "10px",
                  gap: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setVenueTab("nearby");
                    if (userLocation && venues.length === 0) {
                      loadNearbyVenues(userLocation.lat, userLocation.lng);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "8px",
                    background: venueTab === "nearby" ? "white" : "transparent",
                    color: venueTab === "nearby" ? "#007aff" : "#8e8e93",
                    fontSize: "15px",
                    fontWeight: venueTab === "nearby" ? "600" : "500",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Nearby
                </button>
                <button
                  type="button"
                  onClick={() => setVenueTab("search")}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "8px",
                    background: venueTab === "search" ? "white" : "transparent",
                    color: venueTab === "search" ? "#007aff" : "#8e8e93",
                    fontSize: "15px",
                    fontWeight: venueTab === "search" ? "600" : "500",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Search
                </button>
              </div>

              {/* Search Input (only for search tab) */}
              {venueTab === "search" && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#f2f2f7",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#8e8e93"
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
                      onChange={(e) =>
                        setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          searchVenuesByName();
                        }
                      }}
                      style={{
                        flex: 1,
                        border: "none",
                        background: "transparent",
                        outline: "none",
                        fontSize: "15px",
                        color: "#1c1c1e",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={searchVenuesByName}
                    disabled={loadingVenues || !searchQuery.trim()}
                    style={{
                      background: "#007aff",
                      color: "white",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 20px",
                      fontSize: "15px",
                      fontWeight: "600",
                      cursor: loadingVenues || !searchQuery.trim()
                        ? "not-allowed"
                        : "pointer",
                      opacity: loadingVenues || !searchQuery.trim() ? 0.5 : 1,
                    }}
                  >
                    Search
                  </button>
                </div>
              )}

              {/* Loading State */}
              {loadingVenues && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      border: "2px solid #e5e5ea",
                      borderTop: "2px solid #007aff",
                      borderRadius: "50%",
                      animation: "spin 1s ease-in-out infinite",
                    }}
                  />
                  <span style={{ fontSize: "15px", color: "#8e8e93" }}>
                    {venueTab === "nearby"
                      ? "Finding nearby venues..."
                      : "Searching..."}
                  </span>
                </div>
              )}

              {/* Error State */}
              {venuesError && !loadingVenues && (
                <div
                  style={{
                    background: "#fff3cd",
                    border: "1px solid #ffc107",
                    borderRadius: "8px",
                    padding: "12px",
                    fontSize: "14px",
                    color: "#856404",
                    textAlign: "center",
                  }}
                >
                  {venuesError}
                </div>
              )}

              {/* Venues List */}
              {!loadingVenues && venues.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "400px",
                    overflowY: "auto",
                  }}
                >
                  {venues.map((venue) => (
                    <button
                      key={venue.id}
                      type="button"
                      onClick={() => {
                        setSelectedVenue(venue);
                        setStep("compose");
                      }}
                      style={{
                        background: "white",
                        border: "1px solid #e5e5ea",
                        borderRadius: "12px",
                        padding: "12px",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f8f9fa";
                        e.currentTarget.style.borderColor = "#007aff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                        e.currentTarget.style.borderColor = "#e5e5ea";
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            background: "#f0f8ff",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "20px",
                          }}
                        >
                          {venue.icon || "📍"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: "15px",
                              fontWeight: "600",
                              color: "#1c1c1e",
                              marginBottom: "2px",
                            }}
                          >
                            {venue.name}
                          </div>
                          {venue.address?.locality && (
                            <div
                              style={{
                                fontSize: "13px",
                                color: "#8e8e93",
                              }}
                            >
                              {venue.address.locality}
                            </div>
                          )}
                        </div>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#c7c7cc"
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
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {/* Selected Venue Preview */}
              <div
                style={{
                  background: "#f8f9fa",
                  border: "1px solid #e5e5ea",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "#f0f8ff",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                    }}
                  >
                    {selectedVenue.icon || "📍"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "600",
                        color: "#1c1c1e",
                        marginBottom: "2px",
                      }}
                    >
                      {selectedVenue.name}
                    </div>
                    {selectedVenue.address && (
                      <div
                        style={{
                          fontSize: "14px",
                          color: "#8e8e93",
                        }}
                      >
                        {[
                          selectedVenue.address.street,
                          selectedVenue.address.locality,
                        ].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVenue(null);
                      setStep("venue");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#007aff",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: "pointer",
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#1c1c1e",
                    marginBottom: "8px",
                  }}
                >
                  What's happening? (optional)
                </label>
                <textarea
                  value={checkinMessage}
                  onChange={(e) => setCheckinMessage(e.target.value)}
                  placeholder="Share your thoughts..."
                  maxLength={280}
                  style={{
                    width: "100%",
                    minHeight: "120px",
                    padding: "12px",
                    border: "1px solid #e5e5ea",
                    borderRadius: "10px",
                    fontSize: "15px",
                    color: "#1c1c1e",
                    fontFamily: "inherit",
                    resize: "vertical",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#007aff";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e5e5ea";
                  }}
                />
                <div
                  style={{
                    fontSize: "13px",
                    color: "#8e8e93",
                    textAlign: "right",
                    marginTop: "4px",
                  }}
                >
                  {checkinMessage.length}/280
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "compose" && (
          <div
            style={{
              padding: "16px 20px",
              borderTop: "1px solid #e5e5ea",
              display: "flex",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedVenue(null);
                setStep("venue");
              }}
              style={{
                flex: 1,
                background: "#f2f2f7",
                color: "#1c1c1e",
                border: "none",
                borderRadius: "10px",
                padding: "12px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={submitCheckin}
              disabled={submitting || !selectedVenue}
              style={{
                flex: 2,
                background: submitting || !selectedVenue
                  ? "#c7c7cc"
                  : "#007aff",
                color: "white",
                border: "none",
                borderRadius: "10px",
                padding: "12px",
                fontSize: "16px",
                fontWeight: "600",
                cursor: submitting || !selectedVenue
                  ? "not-allowed"
                  : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {submitting
                ? (
                  <>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid white",
                        borderTop: "2px solid transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Posting...
                  </>
                )
                : "Post Check-in"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
