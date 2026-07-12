# exiftool-vendored

**Fast, cross-platform [Node.js](https://nodejs.org/) access to [ExifTool](https://exiftool.org/). Built and supported by [PhotoStructure](https://photostructure.com).**

[![npm version](https://img.shields.io/npm/v/exiftool-vendored.svg)](https://www.npmjs.com/package/exiftool-vendored)
[![Node.js CI](https://github.com/photostructure/exiftool-vendored.js/actions/workflows/build.yml/badge.svg)](https://github.com/photostructure/exiftool-vendored.js/actions/workflows/build.yml)
[![GitHub issues](https://img.shields.io/github/issues/photostructure/exiftool-vendored.js.svg)](https://github.com/photostructure/exiftool-vendored.js/issues)

## Installation & Quick Start

**Requirements**: Node.js Active LTS or Maintenance LTS versions only

```bash
npm install exiftool-vendored
```

```javascript
import { exiftool } from "exiftool-vendored";

// Read metadata
const tags = await exiftool.read("photo.jpg");
console.log(`Camera: ${tags.Make} ${tags.Model}`);
console.log(`Taken: ${tags.DateTimeOriginal}`);
console.log(`Size: ${tags.ImageWidth}x${tags.ImageHeight}`);

// Write metadata
await exiftool.write("photo.jpg", {
  XPComment: "Amazing sunset!",
  Copyright: "© 2024 Your Name",
});

// Extract thumbnail
await exiftool.extractThumbnail("photo.jpg", "thumb.jpg");

await exiftool.end();
```

## Why exiftool-vendored?

### ⚡ **Performance**

Order of magnitude faster than other Node.js ExifTool modules. Powers [PhotoStructure](https://photostructure.com) and [1,000+ other projects](https://github.com/photostructure/exiftool-vendored.js/network/dependents).

### 🔧 **Battle-tested**

- **Cross-platform**: macOS, Linux, Windows
- **Full-featured**: Read, write, extract embedded images
- **Reliable**: Extensive test coverage across most camera manufacturers

### 📚 **Developer-Friendly**

- **TypeScript**: Full type definitions for thousands of metadata fields
- **Smart dates**: Timezone-aware `ExifDateTime` classes
- **Auto-generated tags**: Based on 10,000+ real camera samples

## Core Features

### Reading Metadata

```javascript
const tags = await exiftool.read("photo.jpg");

// Camera info
console.log(tags.Make, tags.Model, tags.LensModel);

// Capture settings
console.log(tags.ISO, tags.FNumber, tags.ExposureTime);

// Location (if available)
console.log(tags.GPSLatitude, tags.GPSLongitude);

// Always check for parsing errors
if (tags.errors?.length > 0) {
  console.warn("Metadata warnings:", tags.errors);
}
```

### Writing Metadata

```javascript
// Add keywords and copyright
await exiftool.write("photo.jpg", {
  Keywords: ["sunset", "landscape"],
  Copyright: "© 2024 Photographer Name",
  "IPTC:CopyrightNotice": "© 2024 Photographer Name",
});

// Update all date fields at once
await exiftool.write("photo.jpg", {
  AllDates: "2024:03:15 14:30:00",
});

// Delete tags
await exiftool.write("photo.jpg", {
  UserComment: null,
});
```

For targeted list-value and supported structured edits, use `editTags()`. See
[Editing Individual Tag Values](docs/USAGE-EXAMPLES.md#editing-individual-tag-values)
for examples, supported tags, and safety constraints.

### Extracting Images

```javascript
// Extract thumbnail
await exiftool.extractThumbnail("photo.jpg", "thumbnail.jpg");

// Extract preview (larger than thumbnail)
await exiftool.extractPreview("photo.jpg", "preview.jpg");

// Extract JPEG from RAW files
await exiftool.extractJpgFromRaw("photo.cr2", "processed.jpg");
```

## Understanding Tags

The `Tags` interface contains **thousands of metadata fields** from an auto-generated TypeScript file. Each tag has JSDoc annotations:

```typescript
/**
 * @frequency 🔥 ★★★★ (85%)
 * @groups EXIF, MakerNotes
 * @example 100
 */
ISO?: number;

/**
 * @frequency 🧊 ★★★☆ (23%)
 * @groups MakerNotes
 * @example "Custom lens data"
 */
LensSpec?: string;
```

- **🔥** = Found on mainstream devices (iPhone, Canon, Nikon, Sony)
- **🧊** = Only found on more obscure camera makes and models
- **★★★★** = Found in >50% of files, **☆☆☆☆** = rare (<1%)
- **@groups** = Metadata categories (EXIF, GPS, IPTC, XMP, etc.)
- **@example** = Representative values

### Code defensively!

- No fields are guaranteed to be present.
- Value types are not guaranteed -- assume strings may get in your numeric fields, and handle it gracefully.
- There may very well be keys returned that are **not** in the `Tags` interface.

📖 **[Complete Tags Documentation →](docs/TAGS.md)**

## Important Notes

### ⚙️ Configuration

exiftool-vendored provides two levels of configuration:

**Library-wide Settings** - Global configuration affecting all instances:

```javascript
import { Settings } from "exiftool-vendored";

// Enable parsing of archaic timezone offsets for historical photos
Settings.allowArchaicTimezoneOffsets.value = true;
```

**Per-instance Options** - Configuration for individual ExifTool instances:

```javascript
import { ExifTool } from "exiftool-vendored";

const exiftool = new ExifTool({
  maxProcs: 8, // More concurrent processes
  useMWG: true, // Use Metadata Working Group tags
  backfillTimezones: true, // Infer missing timezones
});
```

📖 **[Complete Configuration Guide →](docs/CONFIGURATION.md)**

### ⏰ Dates & Timezones

Images rarely specify timezones. This library infers them using several heuristics:

1. **Explicit metadata** (TimeZoneOffset, OffsetTime)
2. **GPS location** → timezone lookup
3. **UTC timestamps** → calculate offset

```javascript
const dt = tags.DateTimeOriginal;
if (dt instanceof ExifDateTime) {
  console.log("Timezone offset:", dt.tzoffset, "minutes");
  console.log("Timezone:", dt.zone);
}
```

📖 **[Date & Timezone Guide →](docs/DATES.md)**

### 🧹 Resource Cleanup

As of v35, **Node.js will exit naturally** without calling `.end()` — child processes are cleaned up automatically when the parent exits.

For **long-running applications** (servers, daemons), calling `.end()` is still recommended for graceful shutdown:

```javascript
import { exiftool } from "exiftool-vendored";

// For servers/daemons: graceful shutdown on termination signals
process.on("SIGINT", () => exiftool.end());
process.on("SIGTERM", () => exiftool.end());
```

#### Automatic Cleanup with Disposable Interfaces

For **TypeScript 5.2+** projects, consider using automatic resource management:

```javascript
import { ExifTool } from "exiftool-vendored";

// Automatic synchronous cleanup
{
  using et = new ExifTool();
  const tags = await et.read("photo.jpg");
  // ExifTool automatically cleaned up when block exits
}

// Automatic asynchronous cleanup (recommended)
{
  await using et = new ExifTool();
  const tags = await et.read("photo.jpg");
  // ExifTool gracefully cleaned up when block exits
}
```

**Benefits:**

- **Guaranteed cleanup**: No leaked processes, even with exceptions
- **Timeout protection**: Automatic forceful cleanup if graceful shutdown hangs
- **Zero boilerplate**: No manual `.end()` calls needed

**Caution:**

- **Operating-system startup lag**: Linux costs ~50-500ms to launch a new ExifTool process, but macOS can take several seconds (presumably due to Gatekeeper), and **Windows can take tens of seconds** due to antivirus shenanigans. Don't dispose your instance unless you're **really** done with it!

### 🏷️ Tag Completeness

The `Tags` interface shows the most common fields, but ExifTool can extract many more. Cast to access unlisted fields:

```javascript
const tags = await exiftool.read("photo.jpg");
const customField = (tags as any).UncommonTag;
```

## Documentation

### 📚 **Guides**

- **[Installation Guide](docs/INSTALLATION.md)** - Electron, Docker, platform setup
- **[Usage Examples](docs/USAGE-EXAMPLES.md)** - Comprehensive API examples
- **[Date Handling](docs/DATES.md)** - Timezone complexities explained
- **[Tags Reference](docs/TAGS.md)** - Understanding the 2,500+ metadata fields
- **[Electron Integration](docs/ELECTRON.md)** - Electron-specific setup

### 🔧 **Troubleshooting**

- **[Debugging Guide](docs/DEBUGGING.md)** - Debug logging and common issues
- **[Temporal Migration](docs/TEMPORAL-MIGRATION.md)** - Future JavaScript Temporal API

### 📖 **API Reference**

- **[TypeDoc Documentation](https://photostructure.github.io/exiftool-vendored.js/)** - Complete API reference

## Performance

The default singleton is throttled for stability. For high-throughput processing:

```javascript
import { ExifTool } from "exiftool-vendored";

const exiftool = new ExifTool({
  maxProcs: 8, // More concurrent processes
  minDelayBetweenSpawnMillis: 0, // Faster spawning
  streamFlushMillis: 10, // Faster streaming
});

// Process many files efficiently
const results = await Promise.all(filePaths.map((file) => exiftool.read(file)));

await exiftool.end();
```

**Benchmarks**: 20+ files/second/thread, 500+ files/second using all CPU cores.

## Support & Community

- **📋 Issues**: [GitHub Issues](https://github.com/photostructure/exiftool-vendored.js/issues)
- **📖 Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **🔒 Security**: [SECURITY.md](SECURITY.md)
- **📄 License**: [MIT](LICENSE)

### Contributors 🎉

[Matthew McEachen](https://github.com/mceachen), [Joshua Harris](https://github.com/Circuit8), [Anton Mokrushin](https://github.com/amokrushin), [Luca Ban](https://github.com/mesqueeb), [Demiurga](https://github.com/apolkingg8), [David Randler](https://github.com/draity)
