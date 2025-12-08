/**
 * Checkin record validation against app.dropanchor.checkin lexicon
 *
 * Validates embedded format: address (object), geo (object)
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

  // Validate geo object (required)
  if (!validateGeo(record.uri, value)) {
    return false;
  }

  // Validate address object (required)
  if (!validateAddress(record.uri, value)) {
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

  // Validate optional fsq field if present
  if (value.fsq) {
    if (typeof value.fsq !== "object") {
      console.warn(`⚠️ Invalid checkin ${record.uri}: fsq must be an object`);
      return false;
    }
    if (!value.fsq.fsqPlaceId || typeof value.fsq.fsqPlaceId !== "string") {
      console.warn(
        `⚠️ Invalid checkin ${record.uri}: fsq.fsqPlaceId is required`,
      );
      return false;
    }
  }

  return true;
}

/**
 * Validate geo object (required)
 */
function validateGeo(uri: string, value: any): boolean {
  if (!value.geo || typeof value.geo !== "object") {
    console.warn(`⚠️ Invalid checkin ${uri}: missing geo object`);
    return false;
  }

  const { latitude, longitude } = value.geo;

  if (!latitude || !longitude) {
    console.warn(
      `⚠️ Invalid checkin ${uri}: geo missing latitude or longitude`,
    );
    return false;
  }

  const lat = typeof latitude === "string" ? parseFloat(latitude) : latitude;
  const lng = typeof longitude === "string" ? parseFloat(longitude) : longitude;

  if (isNaN(lat) || isNaN(lng)) {
    console.warn(
      `⚠️ Invalid checkin ${uri}: geo coordinates are not valid numbers`,
    );
    return false;
  }

  if (lat < -90 || lat > 90) {
    console.warn(`⚠️ Invalid checkin ${uri}: latitude out of range: ${lat}`);
    return false;
  }

  if (lng < -180 || lng > 180) {
    console.warn(`⚠️ Invalid checkin ${uri}: longitude out of range: ${lng}`);
    return false;
  }

  return true;
}

/**
 * Validate address object (required with country field)
 */
function validateAddress(uri: string, value: any): boolean {
  if (!value.address || typeof value.address !== "object") {
    console.warn(`⚠️ Invalid checkin ${uri}: missing address object`);
    return false;
  }

  if (!value.address.country || typeof value.address.country !== "string") {
    console.warn(`⚠️ Invalid checkin ${uri}: address.country is required`);
    return false;
  }

  return true;
}
