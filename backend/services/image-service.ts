/**
 * Image validation and processing service for checkin attachments
 * Handles security validation, resizing, and compression
 */

// Magic numbers for image format detection (security)
const IMAGE_SIGNATURES = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  webp: [0x52, 0x49, 0x46, 0x46], // "RIFF" - need to check bytes 8-11 for "WEBP"
  gif: [0x47, 0x49, 0x46, 0x38], // "GIF8"
};

// Configuration
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB hard limit

export interface ProcessedImage {
  thumb: Uint8Array;
  thumbMimeType: string;
  fullsize: Uint8Array;
  fullsizeMimeType: string;
}

/**
 * Validate image type by checking magic numbers (file headers)
 * More secure than trusting MIME type or extension
 */
export function validateImageType(
  data: Uint8Array,
): { valid: boolean; type: string | null } {
  // Check JPEG
  if (
    data.length >= 3 &&
    data[0] === IMAGE_SIGNATURES.jpeg[0] &&
    data[1] === IMAGE_SIGNATURES.jpeg[1] &&
    data[2] === IMAGE_SIGNATURES.jpeg[2]
  ) {
    return { valid: true, type: "image/jpeg" };
  }

  // Check PNG
  if (data.length >= 8) {
    let isPng = true;
    for (let i = 0; i < IMAGE_SIGNATURES.png.length; i++) {
      if (data[i] !== IMAGE_SIGNATURES.png[i]) {
        isPng = false;
        break;
      }
    }
    if (isPng) return { valid: true, type: "image/png" };
  }

  // Check WebP (RIFF at start, WEBP at byte 8)
  if (data.length >= 12) {
    let isRiff = true;
    for (let i = 0; i < 4; i++) {
      if (data[i] !== IMAGE_SIGNATURES.webp[i]) {
        isRiff = false;
        break;
      }
    }
    if (
      isRiff &&
      data[8] === 0x57 && // W
      data[9] === 0x45 && // E
      data[10] === 0x42 && // B
      data[11] === 0x50 // P
    ) {
      return { valid: true, type: "image/webp" };
    }
  }

  // Check GIF
  if (data.length >= 6) {
    let isGif = true;
    for (let i = 0; i < 4; i++) {
      if (data[i] !== IMAGE_SIGNATURES.gif[i]) {
        isGif = false;
        break;
      }
    }
    if (isGif) return { valid: true, type: "image/gif" };
  }

  return { valid: false, type: null };
}

/**
 * Validate image file size
 */
export function validateImageSize(data: Uint8Array): boolean {
  return data.length <= MAX_UPLOAD_SIZE;
}

/**
 * Process image: resize to thumbnail and fullsize versions
 *
 * NOTE: Val Town doesn't support Canvas/ImageBitmap APIs, so we skip
 * server-side processing and rely on client-side compression.
 * Both thumb and fullsize use the original (client-compressed) image.
 */
export function processImage(
  imageData: Uint8Array,
  mimeType: string,
): ProcessedImage {
  // Since Val Town doesn't support Canvas API, we use the same image for both
  // Client-side compression already handles resizing to <5MB
  // This is a temporary solution - for production, consider using a service
  // like Cloudflare Images or AWS Lambda with Sharp library

  return {
    thumb: imageData,
    thumbMimeType: mimeType,
    fullsize: imageData,
    fullsizeMimeType: mimeType,
  };
}

/**
 * Validate and process an image file
 * Returns processed image data or throws error
 */
export function validateAndProcessImage(
  imageData: Uint8Array,
): ProcessedImage {
  // Validate size
  if (!validateImageSize(imageData)) {
    throw new Error("Image too large (max 10MB)");
  }

  // Validate type via magic numbers
  const typeCheck = validateImageType(imageData);
  if (!typeCheck.valid || !typeCheck.type) {
    throw new Error(
      "Invalid image file. Only JPEG, PNG, WebP, and GIF are supported.",
    );
  }

  // Process image (no actual processing in Val Town - just return validated data)
  const processed = processImage(imageData, typeCheck.type);
  return processed;
}
