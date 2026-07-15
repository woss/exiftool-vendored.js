import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ExifTool } from "./ExifTool";
import { end, expect, testDir, tmpname } from "./_chai.spec";

const InvalidMarker = "{{INVALID_UTF8}}";
const InvalidByte = 0xdc;

function withInvalidUtf8(template: string): Buffer {
  const parts = template.split(InvalidMarker);
  const chunks: Buffer[] = [];
  parts.forEach((part, index) => {
    chunks.push(Buffer.from(part));
    if (index < parts.length - 1) chunks.push(Buffer.from([InvalidByte]));
  });
  return Buffer.concat(chunks);
}

function expectedBytes(before: string, after: string): Uint8Array {
  return Uint8Array.from([
    ...Buffer.from(before),
    InvalidByte,
    ...Buffer.from(after),
  ]);
}

async function writeMalformedXml(template: string): Promise<string> {
  const filename = tmpname("malformed-utf8-") + ".xml";
  await writeFile(filename, withInvalidUtf8(template));
  return filename;
}

async function writeMalformedXmpJpeg(): Promise<string> {
  const source = await readFile(join(testDir, "with_faces.jpg"));
  const needle = Buffer.from("<mwg-rs:Name>Alice Smith</mwg-rs:Name>");
  const offset = source.indexOf(needle);
  expect(offset).to.be.greaterThan(-1);

  const result = Buffer.from(source);
  const damagedByte = offset + Buffer.byteLength("<mwg-rs:Name>A");
  expect(result[damagedByte]).to.equal("l".charCodeAt(0));
  result[damagedByte] = InvalidByte;

  const filename = tmpname("malformed-utf8-struct-") + ".jpg";
  await writeFile(filename, result);
  return filename;
}

async function writeXmpWithEmbeddedXmlPacket(): Promise<{
  filename: string;
  packet: Buffer;
}> {
  const packet = withInvalidUtf8(
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:description>packet A${InvalidMarker}ice</dc:description>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`,
  );
  const outer = `<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:ast="http://ns.nikon.com/asteroid/1.0/"
      ast:XMLPackets="${packet.toString("base64")}"/>
  </rdf:RDF>
</x:xmpmeta>`;
  const filename = tmpname("malformed-utf8-packet-") + ".xmp";
  await writeFile(filename, outer);
  return { filename, packet };
}

describe("malformed UTF-8 in XML and nested structures", () => {
  let exiftool: ExifTool;

  before(() => (exiftool = new ExifTool()));
  after(() => end(exiftool));

  const genericXml = `<?xml version="1.0" encoding="UTF-8"?>
<root attribute="attribute A${InvalidMarker}ice">
  <nested>
    <name>text &amp; A${InvalidMarker}ice</name>
    <document><![CDATA[<doc>opaque A${InvalidMarker}ice</doc>]]></document>
  </nested>
</root>`;

  const expectedGenericValue = {
    Attribute: "attribute A�ice",
    Nested: {
      Document: "<doc>opaque A�ice</doc>",
      Name: "text & A�ice",
    },
  };

  const expectedGenericBytes = {
    Attribute: expectedBytes("attribute A", "ice"),
    Nested: {
      Document: expectedBytes("<doc>opaque A", "ice</doc>"),
      Name: expectedBytes("text & A", "ice"),
    },
  };

  it("captures nested generic XML values through read()", async () => {
    const filename = await writeMalformedXml(genericXml);
    const tags = await exiftool.read(filename, { struct: 1 });

    expect((tags as any).Root).to.deep.equal(expectedGenericValue);
    expect(tags.invalidUtf8Bytes?.Root).to.deep.equal(expectedGenericBytes);
  });

  it("captures nested generic XML values through readRaw()", async () => {
    const filename = await writeMalformedXml(genericXml);
    const tags = await exiftool.readRaw(filename, { readArgs: ["-struct"] });

    expect((tags as any).Root).to.deep.equal(expectedGenericValue);
    expect(tags.invalidUtf8Bytes?.Root).to.deep.equal(expectedGenericBytes);
  });

  for (const struct of [0, 1, 2] as const) {
    it(`mirrors embedded XMP paths with struct=${struct}`, async () => {
      const filename = await writeMalformedXmpJpeg();
      const tags = await exiftool.read(filename, { struct });
      const rawName = expectedBytes("A", "ice Smith");

      if (struct !== 1) {
        expect((tags as any).RegionName).to.deep.equal([
          "A�ice Smith",
          "Bob Jones",
        ]);
        expect(tags.invalidUtf8Bytes?.RegionName).to.deep.equal({
          0: rawName,
        });
      }

      if (struct !== 0) {
        expect((tags as any).RegionInfo.RegionList[0].Name).to.equal(
          "A�ice Smith",
        );
        expect(
          (tags.invalidUtf8Bytes?.RegionInfo as any).RegionList[0].Name,
        ).to.deep.equal(rawName);
      }
    });
  }

  it("parses embedded binary XML while preserving its binary value", async () => {
    const { filename, packet } = await writeXmpWithEmbeddedXmlPacket();
    const tags = await exiftool.readRaw(filename, {
      readArgs: ["-G1", "-struct", "-XMLPackets", "-Description"],
    });

    expect((tags as any)["XMP-ast:XMLPackets"]).to.match(
      /^\(Binary data \d+ bytes, use -b option to extract\)$/,
    );
    expect((tags as any)["XMP-dc:Description"]).to.equal("packet A�ice");
    const descriptionBytes = expectedBytes("packet A", "ice");
    expect(tags.invalidUtf8Bytes).to.deep.equal({
      "MWG:Description": descriptionBytes,
      "XMP-dc:Description": descriptionBytes,
    });

    const extracted = await exiftool.readRaw(filename, {
      readArgs: ["-G1", "-b", "-XMLPackets"],
    });
    expect((extracted as any)["XMP-ast:XMLPackets"]).to.equal(
      packet.toString("base64"),
    );
    expect(extracted.invalidUtf8Bytes).to.equal(undefined);
  });

  it("cannot capture malformed XML element or attribute-name bytes", async () => {
    const filename = await writeMalformedXml(`<?xml version="1.0"?>
<root at${InvalidMarker}tribute="attribute value">
  <na${InvalidMarker}me>element value</na${InvalidMarker}me>
  <ok>fine</ok>
</root>`);
    const tags = await exiftool.readRaw(filename, { readArgs: ["-struct"] });

    // Value filters never receive names, and ExifTool's JSON writer renders
    // these malformed generic-XML name bytes as "?". A separate non-JSON
    // extraction path would be needed to preserve the original names.
    expect((tags as any).Root).to.deep.equal({
      "At?tribute": "attribute value",
      "Na?me": "element value",
      Ok: "fine",
    });
    expect(tags.invalidUtf8Bytes).to.equal(undefined);
  });
});
