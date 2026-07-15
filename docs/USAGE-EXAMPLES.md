# Usage Examples

Complete examples for common exiftool-vendored use cases.

For detailed configuration options, see the [Configuration Guide](CONFIGURATION.md).

## Basic Setup

```javascript
import { exiftool } from "exiftool-vendored";
// or: const { exiftool } = require("exiftool-vendored");

// Verify installation
console.log(`ExifTool v${await exiftool.version()}`);

// Optional here; await this when cleanup must finish before continuing or exiting
await exiftool.end();
```

## Reading Metadata

### Basic Tag Reading

```javascript
const tags = await exiftool.read("photo.jpg");

console.log("Camera:", tags.Make, tags.Model);
console.log("Size:", tags.ImageWidth, "x", tags.ImageHeight);
console.log("Taken:", tags.DateTimeOriginal);
console.log("Location:", tags.GPSLatitude, tags.GPSLongitude);
```

### Safe Property Access

```javascript
const tags = await exiftool.read("photo.jpg");

// Handle optional values safely
const camera = tags.Make ? `${tags.Make} ${tags.Model}` : "Unknown camera";
const dimensions =
  tags.ImageWidth && tags.ImageHeight
    ? `${tags.ImageWidth}x${tags.ImageHeight}`
    : "Unknown size";

// Use nullish coalescing for fallbacks
const timestamp = tags.DateTimeOriginal ?? tags.DateTime ?? tags.FileModifyDate;
const title = tags.Title ?? tags.DocumentName ?? tags.FileName;
```

### Error Handling

```javascript
try {
  const tags = await exiftool.read("photo.jpg");

  // Check for parsing warnings
  if (tags.errors && tags.errors.length > 0) {
    console.warn("Metadata warnings:", tags.errors);
  }

  console.log("Successfully read metadata");
} catch (error) {
  console.error("Failed to read file:", error.message);
}
```

## Writing Metadata

### Basic Tag Writing

```javascript
// Add comment and copyright
await exiftool.write("photo.jpg", {
  XPComment: "Beautiful sunset",
  Copyright: "© 2024 Your Name",
});

// Update capture date
await exiftool.write("photo.jpg", {
  DateTimeOriginal: "2024:03:15 14:30:00",
});
```

### Writing to Specific Groups

```javascript
// Write to specific metadata groups
await exiftool.write("photo.jpg", {
  "IPTC:Keywords": "sunset, landscape, nature",
  "IPTC:CopyrightNotice": "© 2024 Photographer Name",
  "XMP:Title": "Sunset Over Mountains",
  "XMP:Description": "A stunning sunset captured in the mountains",
});
```

### Deleting Tags

```javascript
// Delete specific tags by setting to null
await exiftool.write("photo.jpg", {
  UserComment: null,
  ImageDescription: null,
  "IPTC:Keywords": null,
});
```

### Editing Individual Tag Values

Use `editTags()` to add or remove individual list values without replacing
unrelated metadata. Tag names must be canonical entries in the exported
`TagEditTagNames` allowlist. `TagEditValueTagNames` contains the primitive
remove-capable subset; `TagEditAddTagNames` contains the add-capable list tags;
and `TagEditRemoveOnlyTagNames` contains audited scalar and flattened structure
fields. `XMP-mwg-coll:Collections` is the one supported structured tag. Each
primitive operation accepts one value. Arguments are emitted in the provided
order, but ExifTool applies removals before additions for the same tag:

```javascript
await exiftool.editTags("photo.jpg", [
  {
    tag: "XMP-dc:Subject",
    operation: "remove",
    value: "beach",
  },
  {
    tag: "XMP-dc:Subject",
    operation: "add",
    value: "forest",
  },
]);
```

`remove` deletes every exact matching value. ExifTool Bags are unordered, and
`add` does not deduplicate values. Repeat an operation when duplicate additions
are intentional. Remove-then-add for the same tag and value is supported as a
one-write normalization that removes duplicates and leaves one value.
Add-then-remove is rejected because ExifTool still applies the removal first
and would leave the value present. Primitive values must be non-empty and
contain only Unicode that ExifTool can preserve exactly. Leading spaces and
literal HTML entities are preserved. Edit values are always literal text: for
example, `"A &amp; B"` stores those exact nine characters. `write()` retains
its older behavior and may interpret valid HTML entity sequences, so read the
stored value before moving an entity-containing value between the two APIs.

Structured edits are intentionally limited to schemas validated by this
package. Adding an MWG Collection requires both fields, while removal accepts a
non-empty predicate containing either or both fields:

```javascript
await exiftool.editTags("photo.jpg", [
  {
    tag: "XMP-mwg-coll:Collections",
    operation: "add",
    value: {
      CollectionName: "Portfolio",
      CollectionURI: "urn:portfolio",
    },
  },
  {
    tag: "XMP-mwg-coll:Collections",
    operation: "remove",
    predicate: { CollectionName: "Vacation" },
  },
]);
```

The entire edit array is snapshotted and validated before ExifTool is invoked.
If any operation is invalid, no metadata is written.

The allowlist covers audited, qualified Subject, HierarchicalSubject,
Keywords, CatalogSets, People, PersonInImage, TagsList, LastKeywordXMP, and
region/person-name fields, plus the XMP Dynamic Media Album scalar. Album and
the flattened structure fields are remove-only. Other tags and aliases are
rejected before ExifTool runs; this prevents `+=` or `-=` from unexpectedly
incrementing numbers, shifting dates, or editing multiple physical properties.

Most `WriteTaskOptions` remain available. `writeArgs` entries for `-api` and
`-sep`/`-separator` are rejected because they can change exact matching, list
splitting, or duplicate behavior.

For MWG and ACDSee face labels, removing a flattened name preserves the face
and its detection geometry. Because ExifTool removes every matching name,
first verify that the same name is not used by an unrelated non-face region:

```javascript
await exiftool.editTags("photo.jpg", [
  {
    tag: "XMP-mwg-rs:RegionName",
    operation: "remove",
    value: "Jane",
  },
]);
```

The other audited remove-only fields are
`XMP-acdsee-rs:ACDSeeRegionName`, `XMP-MP:RegionPersonDisplayName`, and
`XMP-xmpDM:Album`. Flattened-name removals preserve remaining sibling fields;
ExifTool may prune a region and its container if the removed name was their
only field. Album removal matches the scalar value exactly.
`XMP-iptcExt:PersonInImageName` remains unsupported because removing its
`x-default` value also removes nonmatching alternate-language values.

`editTags()` does not replace `write()`: whole-tag deletion still uses
`null`, and ordered set/clear/forced-empty operations are not supported.

### Batch Updates with AllDates

```javascript
// Update all date fields at once
await exiftool.write("photo.jpg", {
  AllDates: "2024:03:15 14:30:00",
});

// This is equivalent to setting:
// - DateTimeOriginal
// - CreateDate
// - ModifyDate
```

### GPS Coordinates

```javascript
// Set GPS location (decimal degrees)
await exiftool.write("photo.jpg", {
  GPSLatitude: 40.7128,
  GPSLongitude: -74.006,
  GPSAltitude: 10, // meters above sea level
});
```

## Extracting Embedded Images

### Thumbnail Extraction

```javascript
// Extract EXIF thumbnail
try {
  await exiftool.extractThumbnail("photo.jpg", "thumbnail.jpg");
  console.log("Thumbnail extracted successfully");
} catch (error) {
  console.log("No thumbnail found or extraction failed");
}
```

### Preview Image Extraction

```javascript
// Extract preview image (larger than thumbnail)
try {
  await exiftool.extractPreview("photo.jpg", "preview.jpg");
  console.log("Preview extracted successfully");
} catch (error) {
  console.log("No preview found or extraction failed");
}
```

## JSON Serialization

### Serialize and Deserialize Tags

```javascript
import { parseJSON, ExifDateTime } from "exiftool-vendored";
import { readFile, writeFile } from "node:fs/promises";

// Read and serialize
const tags = await exiftool.read("photo.jpg");
const jsonString = JSON.stringify(tags);

// Save to file or send over network
await writeFile("metadata.json", jsonString);

// Later, deserialize
const savedJson = await readFile("metadata.json", "utf8");
const restoredTags = parseJSON(savedJson);

// restoredTags has proper ExifDateTime objects restored
console.log(restoredTags.DateTimeOriginal instanceof ExifDateTime); // true
```

## Resource Management

With the default settings, ExifTool workers no longer keep Node.js alive after
awaited work finishes. During normal shutdown, the library attempts to clean up
workers automatically. Abrupt termination, such as `SIGKILL` or an operating-
system crash, cannot run cleanup handlers.

Call and await `.end()` when cleanup must finish before your application
continues or exits. Startup time varies widely with the OS, hardware, and
security software, so avoid repeatedly creating and disposing instances.

### Manual Cleanup

```javascript
import { ExifTool } from "exiftool-vendored";

const exiftool = new ExifTool();

try {
  const tags = await exiftool.read("photo.jpg");
  console.log(tags.Make, tags.Model);
} finally {
  // Optional: graceful shutdown (recommended for long-running apps)
  await exiftool.end();
}
```

### Automatic Cleanup with Disposable Interfaces

**For TypeScript 5.2+ projects** with proper tsconfig.json configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "ESNext.Disposable", "DOM"]
  }
}
```

#### Non-blocking Disposal

```javascript
import { ExifTool } from "exiftool-vendored";

// Block scope with automatic cleanup initiation
{
  using et = new ExifTool();
  const tags = await et.read("photo.jpg");
  console.log(`Camera: ${tags.Make} ${tags.Model}`);
  // Graceful cleanup starts when the block exits, but is not awaited
}
```

#### Asynchronous Disposal (Recommended)

```javascript
import { ExifTool } from "exiftool-vendored";

// Graceful cleanup that is awaited when the scope exits
{
  await using et = new ExifTool();

  const tags = await et.read("photo.jpg");

  await et.write("photo.jpg", {
    XPComment: "Processed with exiftool-vendored, golly gee whiz it's neato",
    Copyright: "© 2024",
  });

  // Graceful cleanup is awaited when the block exits
}

// Function with automatic cleanup
async function batchProcessPhotos(filePaths) {
  await using et = new ExifTool({
    maxProcs: 8,
    taskTimeoutMillis: 30000,
  });

  const results = [];

  for (const file of filePaths) {
    try {
      const tags = await et.read(file);

      // Add copyright
      await et.write(file, {
        Copyright: "© 2025 Your Company",
      });

      results.push({ file, success: true, camera: tags.Make });
    } catch (error) {
      results.push({ file, success: false, error: error.message });
    }
  }

  return results;
  // Cleanup is awaited here, including when an exception leaves the scope
}
```

#### Error Handling with Disposables

```javascript
import { ExifTool } from "exiftool-vendored";

async function robustProcessing(file) {
  try {
    await using et = new ExifTool();

    const tags = await et.read(file);

    if (tags.errors?.length > 0) {
      console.warn(`Metadata warnings for ${file}:`, tags.errors);
    }

    return tags;
  } catch (error) {
    if (error.message.includes("ENOENT")) {
      throw new Error(`File not found: ${file}`);
    }
    throw error;
  }
  // Async disposal is awaited before an exception leaves this scope
}
```

#### Disposal Timeout Settings

These settings control when the library requests fallback cleanup. They are not
a hard guarantee that cleanup will complete within the configured duration.

```javascript
import { ExifTool } from "exiftool-vendored";

// Custom timeout configuration
{
  await using et = new ExifTool({
    disposalTimeoutMs: 2000, // 2 seconds for sync disposal
    asyncDisposalTimeoutMs: 30_000, // 30 seconds for async disposal
  });

  // Your processing here
  const tags = await et.read("large-file.tiff");
}
```

### Benefits of Disposable Interfaces

1. **Scope-Based**: The resource lifetime is tied to a lexical scope
2. **Exception-Aware**: Disposal runs when an exception leaves the scope
3. **Awaitable**: `await using` waits for asynchronous disposal
4. **Less Boilerplate**: No manual cleanup `try`/`finally` block

### When to Use Each Approach

- **`using`**: Initiates cleanup without waiting for completion
- **`await using`**: Waits for graceful cleanup (recommended)
- **Manual `.end()`**: Pre-TypeScript 5.2 environments or fine-grained control
