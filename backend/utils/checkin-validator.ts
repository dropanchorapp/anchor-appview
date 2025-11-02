/**
 * Checkin record validation against app.dropanchor.checkin lexicon
 */

/**
 * Validates a checkin record against the current lexicon schema
 * Returns true if valid, false otherwise with console warning
 */
export function validateCheckinRecord(record: any): boolean {
  if (!record.value) {
    console.warn(`⚠️ Invalid checkin ${record.uri}: missing value`);
    return false;
  }

  const value = record.value;

  // Check required fields according to app.dropanchor.checkin lexicon
  if (!value.text || typeof value.text !== "string") {
    console.warn(`⚠️ Invalid checkin ${record.uri}: missing or invalid text`);
    return false;
  }

  if (!value.createdAt || typeof value.createdAt !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid createdAt`,
    );
    return false;
  }

  // Validate coordinates structure
  if (!value.coordinates || typeof value.coordinates !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid coordinates object`,
    );
    return false;
  }

  // Coordinates must have both latitude and longitude
  // They should be strings (for DAG-CBOR compliance) that can be parsed as numbers
  const { latitude, longitude } = value.coordinates;

  if (!latitude || !longitude) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing latitude or longitude`,
    );
    return false;
  }

  // Check if coordinates are valid numbers (whether string or number type)
  const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
  const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;

  if (isNaN(lat) || isNaN(lng)) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: coordinates are not valid numbers (lat: ${latitude}, lng: ${longitude})`,
    );
    return false;
  }

  // Validate coordinate ranges
  if (lat < -90 || lat > 90) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: latitude out of range: ${lat}`,
    );
    return false;
  }

  if (lng < -180 || lng > 180) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: longitude out of range: ${lng}`,
    );
    return false;
  }

  // Validate addressRef if present (required field)
  if (!value.addressRef || typeof value.addressRef !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: missing or invalid addressRef`,
    );
    return false;
  }

  if (!value.addressRef.uri || !value.addressRef.cid) {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: addressRef missing uri or cid`,
    );
    return false;
  }

  // Optional fields validation (if present, must be correct type)
  if (value.category && typeof value.category !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: category must be a string`,
    );
    return false;
  }

  if (value.categoryGroup && typeof value.categoryGroup !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: categoryGroup must be a string`,
    );
    return false;
  }

  if (value.categoryIcon && typeof value.categoryIcon !== "string") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: categoryIcon must be a string`,
    );
    return false;
  }

  if (value.image && typeof value.image !== "object") {
    console.warn(
      `⚠️ Invalid checkin ${record.uri}: image must be an object`,
    );
    return false;
  }

  return true;
}
