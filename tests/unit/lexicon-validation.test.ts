import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

// Import lexicon files directly as modules (no permissions needed)
import checkinLexicon from "../../lexicons/app/dropanchor/checkin.json" with {
  type: "json",
};
import addressLexicon from "../../lexicons/community/lexicon/location/address.json" with {
  type: "json",
};

Deno.test("Lexicon - app.dropanchor.checkin structure", () => {
  const parsed = checkinLexicon;

  // Verify basic structure
  assertEquals(parsed.lexicon, 1);
  assertEquals(parsed.id, "app.dropanchor.checkin");
  assertExists(parsed.defs);
  assertExists(parsed.defs.main);
  assertEquals(parsed.defs.main.type, "record");

  // Verify required fields
  assertExists(parsed.defs.main.key);
  const record = parsed.defs.main.record;
  assertExists(record.properties);

  // Verify text field
  assertEquals(record.properties.text.type, "string");
  assertEquals(record.properties.text.maxLength, 3000);

  // Verify createdAt field
  assertEquals(record.properties.createdAt.type, "string");
  assertEquals(record.properties.createdAt.format, "datetime");

  // Verify addressRef field
  assertEquals(record.properties.addressRef.type, "ref");
  assertEquals(record.properties.addressRef.ref, "#strongRef");

  // Verify coordinates field
  assertEquals(record.properties.coordinates.type, "ref");
  assertEquals(record.properties.coordinates.ref, "#geoCoordinates");

  // Verify optional image field
  assertEquals(record.properties.image.type, "ref");
  assertEquals(record.properties.image.ref, "#checkinImage");
  assertEquals(record.required.includes("image"), false);

  // Verify required fields list
  assertEquals(record.required.includes("text"), true);
  assertEquals(record.required.includes("createdAt"), true);
  assertEquals(record.required.includes("addressRef"), true);
  assertEquals(record.required.includes("coordinates"), true);
});

Deno.test("Lexicon - app.dropanchor.checkin image definition", () => {
  const parsed = checkinLexicon;

  // Verify checkinImage definition exists
  assertExists(parsed.defs.checkinImage);
  assertEquals(parsed.defs.checkinImage.type, "object");

  const imageProps = parsed.defs.checkinImage.properties;

  // Verify thumb field
  assertExists(imageProps.thumb);
  assertEquals(imageProps.thumb.type, "blob");
  assertEquals(imageProps.thumb.accept?.includes("image/jpeg"), true);
  assertEquals(imageProps.thumb.accept?.includes("image/png"), true);
  assertEquals(imageProps.thumb.accept?.includes("image/webp"), true);
  assertEquals(imageProps.thumb.maxSize, 300000); // 300KB

  // Verify fullsize field
  assertExists(imageProps.fullsize);
  assertEquals(imageProps.fullsize.type, "blob");
  assertEquals(imageProps.fullsize.accept?.includes("image/jpeg"), true);
  assertEquals(imageProps.fullsize.maxSize, 2000000); // 2MB

  // Verify alt field
  assertExists(imageProps.alt);
  assertEquals(imageProps.alt.type, "string");
  assertEquals(imageProps.alt.maxLength, 1000);

  // Verify required fields in image object
  assertEquals(parsed.defs.checkinImage.required.includes("thumb"), true);
  assertEquals(parsed.defs.checkinImage.required.includes("fullsize"), true);
  assertEquals(parsed.defs.checkinImage.required.includes("alt"), false);
});

Deno.test("Lexicon - community.lexicon.location.address structure", () => {
  const parsed = addressLexicon;

  // Verify basic structure
  assertEquals(parsed.lexicon, 1);
  assertEquals(parsed.id, "community.lexicon.location.address");
  assertExists(parsed.defs);
  assertExists(parsed.defs.main);
  assertEquals(parsed.defs.main.type, "record");

  // Verify properties
  const record = parsed.defs.main.record;
  assertExists(record.properties);

  // All fields should be optional strings
  const fields = [
    "name",
    "street",
    "locality",
    "region",
    "country",
    "postalCode",
  ];
  for (const field of fields) {
    assertExists(record.properties[field]);
    assertEquals(record.properties[field].type, "string");
  }

  // Verify no required fields (all optional) - address lexicon has no required fields
  assertEquals((record as any).required, undefined);
});

Deno.test("Lexicon - Backward compatibility", () => {
  const parsed = checkinLexicon;

  // Ensure image is not required (backward compatibility)
  assertEquals(
    parsed.defs.main.record.required.includes("image"),
    false,
    "Image field must be optional for backward compatibility",
  );

  // Verify category fields remain optional
  assertEquals(
    parsed.defs.main.record.required.includes("category"),
    false,
  );
  assertEquals(
    parsed.defs.main.record.required.includes("categoryGroup"),
    false,
  );
  assertEquals(
    parsed.defs.main.record.required.includes("categoryIcon"),
    false,
  );
});
