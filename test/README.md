# Test fixtures

## `malformed-utf8.jpg`

This 8×8 neutral-gray JPEG is derived from a Panasonic DMC-ZS7 file that
reproduces malformed UTF-8 in maker notes. Its raw `City` bytes are `dc 4b`.
The XMP subject list also contains a deliberately malformed item whose raw
bytes contain `64 3a dc 74 61 69 6c` (`damaged:` followed by `dc` and `tail`).
Valid comparison values include authored question marks and `世界`. A synthetic
EXIF `UserComment` reaches the filter as `53 4b 45 59 00 00 00 00 d5 00 bd`
(`SKEY\0\0\0\0` plus `d5 00 bd`). ExifTool's JSON encoder removes the NULs,
leaving `SKEY` plus valid UTF-8 for U+057D (`ս`). This pins JSON cleanup
ordering while asserting the byte sidecar retains the untouched filter value.

Before adding the fixture, its complete metadata, raw printable strings,
visible pixels, and possible embedded previews and thumbnails were audited.
It contains no GPS data, serial number, embedded image, personal name, or other
identifying free text.

SHA-256: `3b3b813f8080a6fc1aee1eefb5e18314567982f3415e1aff2e17e583babcdc76`.

## `malformed-utf8.lfp`

This 240-byte synthetic Lytro file contains two JSON metadata segments. Each
segment is 13 bytes long and contains one malformed byte; ExifTool exposes the
segments through its real `Binary => 1, List => 1` `JSONMetadata` tag while
also parsing the final malformed text value `dd 4c` as `Foo`. It pins text repair,
raw-byte capture, and preservation of nested binary-list descriptor lengths.

The file was generated locally from fixed header and segment bytes and contains
no real media or identifying metadata. SHA-256:
`f10d83b7dec514cb703966a2f9ffb16089f4fdd4140c2dd9cfddb2c98c4d257e`.

## `malformed-utf8-collision.mie`

This 78-byte synthetic MIE file contains a text `City` and binary
`RelatedAudioFile` whose raw bytes are both `dc 4b`. It proves that text repair
is tag-local and does not depend on whether an unrelated binary tag happens to
contain the same bytes. It contains no real media or identifying metadata.

SHA-256: `95e0f58834db72ec478057513de1d2fbfea95dd72062cd0ee68db49a10da74ca`.

## Runtime XML fixtures

`InvalidUtf8Xml.spec.ts` creates temporary privacy-safe XML inputs because Git
cannot conveniently review malformed UTF-8 in a text fixture. It covers
generic XML element text, attribute values, CDATA containing an opaque XML
document, Nikon's Base64 `XMLPackets` binary subdirectory, and malformed XML
names. It also corrupts the existing synthetic `with_faces.jpg` XMP region name
in a same-length temporary copy to test flattened and nested `struct` modes.

ExifTool preserves malformed extracted _values_ through its XML parser, so the
filter can capture them without rereading. Value filters never receive XML
element or attribute names, and JSON output may repair or canonicalize malformed
names (`?` for the generic XML fixture); those exact name bytes are a documented
boundary of the sidecar.
