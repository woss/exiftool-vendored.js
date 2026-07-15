import { expect } from "./_chai.spec";
import { InvalidUtf8Marker, unwrapInvalidUtf8Tags } from "./InvalidUtf8Bytes";
import { parseJSON } from "./JSON";

function wrapped(replacement: string, bytes: number[]) {
  return {
    [InvalidUtf8Marker]: {
      replacement: "s:" + replacement,
      rawBase64: "b64:" + Buffer.from(bytes).toString("base64"),
    },
  };
}

describe("unwrapInvalidUtf8Tags", () => {
  it("unwraps nested object and list leaves into a sparse byte sidecar", () => {
    const collision = {
      [InvalidUtf8Marker]: {
        replacement: "missing the required prefix",
        rawBase64: "b64:3Es=",
      },
    };
    const decoded = unwrapInvalidUtf8Tags({
      Description: wrapped("G�teborg", [0x47, 0x9a, 0x74]),
      Nested: {
        Subjects: ["valid", wrapped("�K", [0xdc, 0x4b])],
      },
      Collision: collision,
    });

    expect(decoded.tags).to.deep.equal({
      Description: "G�teborg",
      Nested: { Subjects: ["valid", "�K"] },
      Collision: collision,
    });
    expect(decoded.invalidUtf8Bytes).to.deep.equal({
      Description: new Uint8Array([0x47, 0x9a, 0x74]),
      Nested: {
        Subjects: { 1: new Uint8Array([0xdc, 0x4b]) },
      },
    });
  });

  it("does not add a sidecar when no private wrapper is present", () => {
    const tags = { Title: "Authored? 世界" };
    const decoded = unwrapInvalidUtf8Tags(tags);

    expect(decoded.tags).to.equal(tags);
    expect(decoded).to.deep.equal({
      tags: { Title: "Authored? 世界" },
    });
  });

  it("preserves wrapped bytes under an own __proto__ key", () => {
    const input = JSON.parse(
      `{"__proto__":${JSON.stringify(wrapped("�K", [0xdc, 0x4b]))}}`,
    );
    const decoded = unwrapInvalidUtf8Tags(input);

    expect(Object.hasOwn(decoded.tags, "__proto__")).to.equal(true);
    expect(decoded.tags.__proto__).to.equal("�K");
    expect(Object.hasOwn(decoded.invalidUtf8Bytes!, "__proto__")).to.equal(
      true,
    );
    expect(decoded.invalidUtf8Bytes?.__proto__).to.deep.equal(
      new Uint8Array([0xdc, 0x4b]),
    );
  });

  it("preserves __proto__ as an ordinary metadata key", () => {
    const input = JSON.parse('{"__proto__":"metadata"}');
    const decoded = unwrapInvalidUtf8Tags(input);

    expect(Object.hasOwn(decoded.tags, "__proto__")).to.equal(true);
    expect(decoded.tags.__proto__).to.equal("metadata");
    expect(Object.getPrototypeOf(decoded.tags)).to.equal(Object.prototype);
  });

  it("round-trips byte arrays through the public parseJSON helper", () => {
    const value = {
      City: "�K",
      invalidUtf8Bytes: {
        City: new Uint8Array([0xdc, 0x4b]),
        Subject: { 1: new Uint8Array([0xdd, 0x4c]) },
      },
    };

    expect(parseJSON(JSON.stringify(value))).to.deep.equal(value);
  });
});
