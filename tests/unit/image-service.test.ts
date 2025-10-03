import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  ProcessedImage,
  validateAndProcessImage,
  validateImageType,
} from "../../backend/services/image-service.ts";

Deno.test("Image Service - validateImageType", async (t) => {
  await t.step("should validate JPEG magic numbers", () => {
    const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const result = validateImageType(jpegData);
    assertEquals(result.valid, true);
    assertEquals(result.type, "image/jpeg");
  });

  await t.step("should validate PNG magic numbers", () => {
    const pngData = new Uint8Array([
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
    ]);
    const result = validateImageType(pngData);
    assertEquals(result.valid, true);
    assertEquals(result.type, "image/png");
  });

  await t.step("should validate WebP magic numbers", () => {
    const webpData = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46,
      0x00,
      0x00,
      0x00,
      0x00,
      0x57,
      0x45,
      0x42,
      0x50,
    ]);
    const result = validateImageType(webpData);
    assertEquals(result.valid, true);
    assertEquals(result.type, "image/webp");
  });

  await t.step("should validate GIF magic numbers (GIF87a)", () => {
    const gifData = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    const result = validateImageType(gifData);
    assertEquals(result.valid, true);
    assertEquals(result.type, "image/gif");
  });

  await t.step("should validate GIF magic numbers (GIF89a)", () => {
    const gifData = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const result = validateImageType(gifData);
    assertEquals(result.valid, true);
    assertEquals(result.type, "image/gif");
  });

  await t.step("should reject invalid image data", () => {
    const invalidData = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const result = validateImageType(invalidData);
    assertEquals(result.valid, false);
    assertEquals(result.type, null);
  });

  await t.step("should reject empty data", () => {
    const emptyData = new Uint8Array([]);
    const result = validateImageType(emptyData);
    assertEquals(result.valid, false);
    assertEquals(result.type, null);
  });
});

Deno.test("Image Service - validateAndProcessImage", async (t) => {
  // Helper to create minimal valid JPEG
  const createMinimalJpeg = (): Uint8Array => {
    // Minimal JPEG: SOI marker (FFD8) + SOF0 marker + EOI marker (FFD9)
    return new Uint8Array([
      0xFF,
      0xD8, // SOI
      0xFF,
      0xC0, // SOF0
      0x00,
      0x0B, // Length
      0x08, // Precision
      0x00,
      0x10, // Height
      0x00,
      0x10, // Width
      0x01, // Components
      0x01, // Component ID
      0x11, // Sampling
      0x00, // Quantization
      0xFF,
      0xD9, // EOI
    ]);
  };

  await t.step("should reject image exceeding max size", async () => {
    // Create data > 10MB (hard limit)
    const largeData = new Uint8Array(11 * 1024 * 1024);
    largeData[0] = 0xFF;
    largeData[1] = 0xD8;
    largeData[2] = 0xFF;

    try {
      await validateAndProcessImage(largeData);
      throw new Error("Should have thrown");
    } catch (error) {
      assertEquals(
        (error as Error).message,
        "Image too large (max 10MB)",
      );
    }
  });

  await t.step("should reject non-image data", async () => {
    const invalidData = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

    try {
      await validateAndProcessImage(invalidData);
      throw new Error("Should have thrown");
    } catch (error) {
      assertEquals(
        (error as Error).message,
        "Invalid image file. Only JPEG, PNG, WebP, and GIF are supported.",
      );
    }
  });

  await t.step("should accept valid JPEG within size limit", async () => {
    const validJpeg = createMinimalJpeg();

    // This will fail in test environment due to lack of Canvas API
    // but we can verify it gets past validation
    try {
      await validateAndProcessImage(validJpeg);
    } catch (error) {
      // Expected to fail due to Canvas API not available in Deno test environment
      // But should fail at processing stage, not validation
      const msg = (error as Error).message;
      assertEquals(
        msg.includes("Image too large") || msg.includes("Invalid image file"),
        false,
      );
    }
  });
});

Deno.test("Image Service - processImage output structure", async (t) => {
  await t.step(
    "should produce correct ProcessedImage structure (type test)",
    () => {
      // This is a compile-time type check more than runtime
      // Verify the interface shape is correct
      const mockResult: ProcessedImage = {
        thumb: new Uint8Array([1, 2, 3]),
        thumbMimeType: "image/jpeg",
        fullsize: new Uint8Array([4, 5, 6]),
        fullsizeMimeType: "image/jpeg",
      };

      assertEquals(mockResult.thumb.length, 3);
      assertEquals(mockResult.thumbMimeType, "image/jpeg");
      assertEquals(mockResult.fullsize.length, 3);
      assertEquals(mockResult.fullsizeMimeType, "image/jpeg");
    },
  );
});
