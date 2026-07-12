import { existsSync } from "node:fs";
import { end, expect, sha1, testFile, testImg } from "./_chai.spec";
import { DefaultWriteTaskOptions, ExifTool } from "./ExifTool";
import { CollectionInfo } from "./MWGTags";
import { RawTags } from "./RawTags";
import {
  CollectionPredicate,
  TagEdit,
  TagEditAddTagNames,
  TagEditRemoveOnlyTagNames,
  TagEditTagNames,
  TagEditValueTagNames,
} from "./TagEdit";
import { Tags } from "./Tags";
import { WriteTask } from "./WriteTask";

interface Region {
  Area: Record<string, number | string>;
  Name?: string;
  Type?: string;
}

function regionList(tags: Tags): Region[] {
  return (tags.RegionInfo as unknown as { RegionList: Region[] }).RegionList;
}

async function readQualifiedTag<T>(
  exiftool: ExifTool,
  file: string,
  tag: string,
): Promise<T | undefined> {
  const raw = (await exiftool.readRaw(file, {
    readArgs: ["-G1", "-struct", `-${tag}`],
  })) as unknown as Record<string, unknown>;
  return raw[tag] as T | undefined;
}

describe("ExifTool.editTags()", () => {
  const exiftool = new ExifTool();
  after(() => end(exiftool));

  async function seedCollections(file: string): Promise<void> {
    await exiftool.write(file, {
      Collections: [
        {
          CollectionName: "Vacation",
          CollectionURI: "urn:vacation",
        },
        {
          CollectionName: "Portfolio",
          CollectionURI: "urn:portfolio",
        },
      ],
      Subject: ["before"],
    });
  }

  async function expectNoModification(
    file: string,
    edits: readonly TagEdit[],
    message: RegExp,
  ): Promise<void> {
    const before = await sha1(file);
    await expect(exiftool.editTags(file, edits)).to.be.rejectedWith(message);
    expect(await sha1(file)).to.eql(before);
  }

  it("preserves operation order in generated ExifTool arguments", () => {
    const edits = [
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
      {
        tag: "XMP-dc:Subject",
        operation: "add",
        value: "forest",
      },
    ] as const satisfies readonly TagEdit[];

    const task = WriteTask.forTagEdits(
      "image.jpg",
      edits,
      DefaultWriteTaskOptions,
    );
    expect(task.args.filter((arg) => arg.startsWith("-XMP-dc:Subject"))).to.eql(
      [
        "-XMP-dc:Subject-=beach",
        "-XMP-dc:Subject+=forest",
        "-XMP-dc:Subject+=forest",
      ],
    );
  });

  it("accepts every audited add-capable string-list tag", () => {
    const edits = TagEditAddTagNames.values.map((tag): TagEdit => ({
      tag,
      operation: "add",
      value: "value",
    }));
    const task = WriteTask.forTagEdits(
      "image.jpg",
      edits,
      DefaultWriteTaskOptions,
    );

    for (const tag of TagEditAddTagNames) {
      expect(task.args).to.include(`-${tag}+=value`);
    }
    expect(TagEditTagNames.includes("XMP-mwg-coll:Collections")).to.eql(true);
  });

  it("accepts every audited remove-capable primitive tag", () => {
    const edits = TagEditValueTagNames.values.map((tag): TagEdit => ({
      tag,
      operation: "remove",
      value: "value",
    }));
    const task = WriteTask.forTagEdits(
      "image.jpg",
      edits,
      DefaultWriteTaskOptions,
    );

    for (const tag of TagEditValueTagNames) {
      expect(task.args).to.include(`-${tag}-=value`);
    }
  });

  it("removes every exact match and preserves duplicate additions", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.write(file, {
      Subject: ["remove", "keep", "remove"],
    });

    await exiftool.editTags(file, [
      {
        tag: "XMP-dc:Subject",
        operation: "remove",
        value: "remove",
      },
      {
        tag: "XMP-dc:Subject",
        operation: "add",
        value: "forest",
      },
      {
        tag: "XMP-dc:Subject",
        operation: "add",
        value: "forest",
      },
    ]);

    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject"],
    })) as unknown as RawTags;
    const subject = raw["XMP-dc:Subject"];
    expect(subject).to.be.an("array");
    expect([...(subject as string[])].sort()).to.eql(
      ["forest", "forest", "keep"].sort(),
    );
  });

  it("targets only the qualified metadata group", async () => {
    const file = await testImg();
    const before = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject", "-IPTC:Keywords"],
    })) as unknown as RawTags;

    await exiftool.editTags(file, [
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

    const after = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject", "-IPTC:Keywords"],
    })) as unknown as RawTags;
    expect(after["XMP-dc:Subject"]).to.include("forest");
    expect(after["XMP-dc:Subject"]).to.not.include("beach");
    expect(after["IPTC:Keywords"]).to.eql(before["IPTC:Keywords"]);
  });

  it("edits exact hierarchical keyword values", async () => {
    const file = await testFile("hierarchical-keywords.xmp");
    await exiftool.write(file, {
      "XMP-lr:HierarchicalSubject": ["Places|Beach", "Places|Forest"],
    } as any);

    await exiftool.editTags(file, [
      {
        tag: "XMP-lr:HierarchicalSubject",
        operation: "remove",
        value: "Places|Beach",
      },
      {
        tag: "XMP-lr:HierarchicalSubject",
        operation: "add",
        value: "Places|Mountain",
      },
    ]);

    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-lr:HierarchicalSubject"],
    })) as unknown as RawTags;
    expect([...(raw["XMP-lr:HierarchicalSubject"] as string[])].sort()).to.eql(
      ["Places|Forest", "Places|Mountain"].sort(),
    );
  });

  it("removes a Collection matching a strict non-empty predicate", async () => {
    const file = await testFile("collections.xmp");
    await seedCollections(file);

    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "remove",
        predicate: { CollectionName: "Vacation" },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "Portfolio",
        CollectionURI: "urn:portfolio",
      },
    ]);
  });

  it("encodes only the validated snapshot of a Collection predicate", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.write(file, {
      Collections: [
        {
          CollectionName: "Vacation",
          CollectionURI: "urn:vacation",
        },
        {
          CollectionName: "Vacation",
          CollectionURI: "urn:other-vacation",
        },
      ],
    });

    let predicateReads = 0;
    const edit = {
      tag: "XMP-mwg-coll:Collections",
      operation: "remove",
      get predicate() {
        predicateReads++;
        return predicateReads === 1
          ? {
              CollectionName: "Vacation",
              CollectionURI: "urn:vacation",
            }
          : { CollectionName: "Vacation", Typo: "x" };
      },
    } as any;

    await exiftool.editTags(file, [edit]);

    expect(predicateReads).to.eql(1);
    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "Vacation",
        CollectionURI: "urn:other-vacation",
      },
    ]);
  });

  it("includes non-enumerable own fields in a Collection predicate", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.write(file, {
      Collections: [
        {
          CollectionName: "Vacation",
          CollectionURI: "urn:vacation",
        },
        {
          CollectionName: "Vacation",
          CollectionURI: "urn:other-vacation",
        },
      ],
    });
    const predicate = { CollectionName: "Vacation" } as CollectionPredicate;
    Object.defineProperty(predicate, "CollectionURI", {
      value: "urn:vacation",
    });

    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "remove",
        predicate,
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "Vacation",
        CollectionURI: "urn:other-vacation",
      },
    ]);
  });

  it("rejects accessor fields in Collection values without modifying metadata", async () => {
    const file = await testFile("collections.xmp");
    await seedCollections(file);
    const value = { CollectionURI: "urn:new" } as CollectionInfo;
    Object.defineProperty(value, "CollectionName", {
      enumerable: true,
      get() {
        return "Dynamic";
      },
    });

    await expectNoModification(
      file,
      [
        {
          tag: "XMP-mwg-coll:Collections",
          operation: "add",
          value,
        },
      ],
      /data properties/i,
    );
  });

  it("matches leading whitespace in Collection predicates exactly", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: " Vacation",
          CollectionURI: "urn:leading",
        },
      },
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: "Vacation",
          CollectionURI: "urn:plain",
        },
      },
    ]);

    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "remove",
        predicate: { CollectionName: " Vacation" },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "Vacation",
        CollectionURI: "urn:plain",
      },
    ]);
  });

  it("round-trips structural delimiters inside Collection fields", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: "{Vacation}",
          CollectionURI: "urn:[vacation]",
        },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "{Vacation}",
        CollectionURI: "urn:[vacation]",
      },
    ]);
  });

  it("distinguishes HTML entities from decoded text in Collection fields", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: "A &amp; B",
          CollectionURI: "urn:entity",
        },
      },
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: "A & B",
          CollectionURI: "urn:ampersand",
        },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "A &amp; B",
        CollectionURI: "urn:entity",
      },
      {
        CollectionName: "A & B",
        CollectionURI: "urn:ampersand",
      },
    ]);

    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "remove",
        predicate: { CollectionName: "A &amp; B" },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "A & B",
        CollectionURI: "urn:ampersand",
      },
    ]);
  });

  it("adds one validated Collection structure", async () => {
    const file = await testFile("collections.xmp");
    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-coll:Collections",
        operation: "add",
        value: {
          CollectionName: "Vacation",
          CollectionURI: "urn:vacation",
        },
      },
    ]);

    expect((await exiftool.read(file)).Collections).to.eql([
      {
        CollectionName: "Vacation",
        CollectionURI: "urn:vacation",
      },
    ]);
  });

  it("removes a flattened face name without deleting its geometry", async () => {
    const file = await testImg({ srcBasename: "with_faces.jpg" });
    const before = regionList(await exiftool.read(file));
    const bobBefore = before.find((region) => region.Name === "Bob Jones")!;

    await exiftool.editTags(file, [
      {
        tag: "XMP-mwg-rs:RegionName",
        operation: "remove",
        value: "Bob Jones",
      },
    ]);

    const after = regionList(await exiftool.read(file));
    expect(after).to.have.length(before.length);
    expect(after.find((region) => region.Name === "Alice Smith")).to.eql(
      before.find((region) => region.Name === "Alice Smith"),
    );
    const unnamedBob = after.find(
      (region) => region.Type === "Face" && region.Name == null,
    );
    expect(unnamedBob?.Area).to.eql(bobBefore.Area);
  });

  it("removes an exact XMP album scalar", async () => {
    const file = await testFile("album.xmp");
    await exiftool.write(file, { "XMP-xmpDM:Album": "Vacation" } as any);

    await exiftool.editTags(file, [
      { tag: "XMP-xmpDM:Album", operation: "remove", value: "Other" },
    ]);
    expect(
      await readQualifiedTag<string>(exiftool, file, "XMP-xmpDM:Album"),
    ).to.eql("Vacation");

    await exiftool.editTags(file, [
      { tag: "XMP-xmpDM:Album", operation: "remove", value: "Vacation" },
    ]);
    expect(
      await readQualifiedTag<string>(exiftool, file, "XMP-xmpDM:Album"),
    ).to.eql(undefined);
  });

  it("removes audited flattened region names without deleting sibling fields", async () => {
    const file = await testFile("person-structures.xmp");
    await exiftool.write(file, {
      "XMP-acdsee-rs:RegionInfoACDSee": {
        AppliedToDimensions: { H: 800, Unit: "pixel", W: 1200 },
        RegionList: [
          {
            ALGArea: { H: 0.2, W: 0.2, X: 0.3, Y: 0.4 },
            Name: "Jane",
            NameAssignType: "manual",
            Type: "Face",
          },
          {
            DLYArea: { H: 0.4, W: 0.3, X: 0.2, Y: 0.1 },
            Name: "Keep",
            NameAssignType: "manual",
            Type: "Object",
          },
        ],
      },
      "XMP-MP:RegionInfoMP": {
        Regions: [
          {
            PersonDisplayName: "Jane",
            PersonSourceID: "id-jane",
            Rectangle: "0.1, 0.2, 0.3, 0.4",
          },
          {
            PersonDisplayName: "Keep",
            PersonSourceID: "id-keep",
            Rectangle: "0.5, 0.6, 0.2, 0.2",
          },
        ],
      },
    } as any);

    const beforeNonmatch = await sha1(file);
    await exiftool.editTags(file, [
      {
        tag: "XMP-acdsee-rs:ACDSeeRegionName",
        operation: "remove",
        value: "Other",
      },
      {
        tag: "XMP-MP:RegionPersonDisplayName",
        operation: "remove",
        value: "Other",
      },
    ]);
    expect(await sha1(file)).to.eql(beforeNonmatch);

    await exiftool.editTags(file, [
      {
        tag: "XMP-acdsee-rs:ACDSeeRegionName",
        operation: "remove",
        value: "Jane",
      },
      {
        tag: "XMP-MP:RegionPersonDisplayName",
        operation: "remove",
        value: "Jane",
      },
    ]);

    expect(
      await readQualifiedTag<Record<string, unknown>>(
        exiftool,
        file,
        "XMP-acdsee-rs:RegionInfoACDSee",
      ),
    ).to.eql({
      AppliedToDimensions: { H: 800, Unit: "pixel", W: 1200 },
      RegionList: [
        {
          ALGArea: { H: 0.2, W: 0.2, X: 0.3, Y: 0.4 },
          NameAssignType: "manual",
          Type: "Face",
        },
        {
          DLYArea: { H: 0.4, W: 0.3, X: 0.2, Y: 0.1 },
          Name: "Keep",
          NameAssignType: "manual",
          Type: "Object",
        },
      ],
    });
    expect(
      await readQualifiedTag<Record<string, unknown>>(
        exiftool,
        file,
        "XMP-MP:RegionInfoMP",
      ),
    ).to.eql({
      Regions: [
        {
          PersonSourceID: "id-jane",
          Rectangle: "0.1, 0.2, 0.3, 0.4",
        },
        {
          PersonDisplayName: "Keep",
          PersonSourceID: "id-keep",
          Rectangle: "0.5, 0.6, 0.2, 0.2",
        },
      ],
    });
  });

  it("prunes flattened region structures left empty after removal", async () => {
    const file = await testFile("empty-person-structures.xmp");
    await exiftool.write(file, {
      "XMP-acdsee-rs:RegionInfoACDSee": {
        RegionList: [{ Name: "Jane" }],
      },
      "XMP-MP:RegionInfoMP": {
        Regions: [{ PersonDisplayName: "Jane" }],
      },
    } as any);

    await exiftool.editTags(file, [
      {
        tag: "XMP-acdsee-rs:ACDSeeRegionName",
        operation: "remove",
        value: "Jane",
      },
      {
        tag: "XMP-MP:RegionPersonDisplayName",
        operation: "remove",
        value: "Jane",
      },
    ]);

    expect(
      await readQualifiedTag(exiftool, file, "XMP-acdsee-rs:RegionInfoACDSee"),
    ).to.eql(undefined);
    expect(
      await readQualifiedTag(exiftool, file, "XMP-MP:RegionInfoMP"),
    ).to.eql(undefined);
  });

  it("rejects adding a flattened RegionName without modifying metadata", async () => {
    const file = await testImg({ srcBasename: "with_faces.jpg" });
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-mwg-rs:RegionName",
          operation: "add",
          value: "Ghost",
        } as any,
      ],
      /RegionName.*remove-only/i,
    );
  });

  it("rejects adding every remove-only primitive tag", async () => {
    const file = await testImg({ srcBasename: "with_faces.jpg" });
    for (const tag of TagEditRemoveOnlyTagNames) {
      await expectNoModification(
        file,
        [{ tag, operation: "add", value: "Ghost" } as any],
        new RegExp(
          `${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*remove-only`,
          "i",
        ),
      );
    }
  });

  it("rejects an empty edit list before invoking ExifTool", async () => {
    await expect(
      exiftool.editTags(await testFile("missing.jpg"), []),
    ).to.be.rejectedWith(/at least one tag edit/i);
  });

  for (const edit of [
    { tag: "Subject", operation: "remove", value: "beach" },
    { tag: "XMP-dc:Subject", operation: "remove", value: null },
    { tag: "XMP-dc:Subject", operation: "add", value: undefined },
    { tag: "XMP-dc:Subject", operation: "add", value: ["a", "b"] },
    { tag: "XMP-dc:Subject", operation: "add", value: 42 },
    { tag: "XMP-dc:Subject", operation: "add", value: true },
    { tag: "XMP-dc:Subject", operation: "add", value: "" },
    { tag: "XMP-dc:Subject", operation: "set", value: "forest" },
  ]) {
    it(`rejects invalid edit ${JSON.stringify(edit)}`, async () => {
      await expect(
        exiftool.editTags(await testFile("missing.jpg"), [edit] as any),
      ).to.be.rejectedWith(
        /edit|group-qualified|operation|value|string|supported/i,
      );
    });
  }

  for (const tag of [
    "XMP-xmp:CreateDate",
    "XMP-iptcExt:PersonInImageName",
    "XMP:All",
    "XMP:Subject",
    "XMP-custom:People",
  ]) {
    it(`rejects unsupported or alias tag ${tag} before writing`, async () => {
      const file = await testImg();
      await expectNoModification(
        file,
        [
          {
            tag,
            operation: "remove",
            value: tag === "XMP-xmp:CreateDate" ? "0:0:0 0:0:1" : "Prior Title",
          } as any,
        ],
        /not supported|canonical/i,
      );
    });
  }

  it("rejects an empty Collection predicate without modifying metadata", async () => {
    const file = await testFile("collections.xmp");
    await seedCollections(file);
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-mwg-coll:Collections",
          operation: "remove",
          predicate: {},
        } as any,
      ],
      /non-empty predicate/i,
    );
  });

  for (const { predicate, message } of [
    {
      predicate: { CollectionName: "Vacation", Typo: "x" },
      message: /unknown Collection predicate field.*Typo/i,
    },
    {
      predicate: { CollectionName: { Value: "Vacation" } },
      message: /CollectionName.*string/i,
    },
    {
      predicate: { CollectionURI: 42 },
      message: /CollectionURI.*string/i,
    },
  ]) {
    it(`rejects invalid Collection predicate ${JSON.stringify(predicate)} without modifying metadata`, async () => {
      const file = await testFile("collections.xmp");
      await seedCollections(file);
      await expectNoModification(
        file,
        [
          {
            tag: "XMP-mwg-coll:Collections",
            operation: "remove",
            predicate,
          } as any,
        ],
        message,
      );
    });
  }

  it("validates every predicate before writing any edit", async () => {
    const file = await testFile("collections.xmp");
    await seedCollections(file);
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-dc:Subject",
          operation: "add",
          value: "should-not-be-written",
        },
        {
          tag: "XMP-mwg-coll:Collections",
          operation: "remove",
          predicate: { CollectionName: "Vacation", Typo: "x" },
        } as any,
      ],
      /unknown Collection predicate field.*Typo/i,
    );
  });

  it("rejects predicates for unsupported structured tags", async () => {
    const file = await testImg({ srcBasename: "with_faces.jpg" });
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-mwg-rs:RegionList",
          operation: "remove",
          predicate: { Name: "Bob Jones", Type: "Face" },
        } as any,
      ],
      /not supported/i,
    );
  });

  for (const value of [
    "{Name=Bob Jones,Type=Face}",
    " &#123;Name=Bob Jones,Type=Face&#125;",
  ]) {
    it(`rejects unsupported structured tag with value ${JSON.stringify(value)} without modifying metadata`, async () => {
      const file = await testImg({ srcBasename: "with_faces.jpg" });
      await expectNoModification(
        file,
        [
          {
            tag: "XMP-mwg-rs:RegionList",
            operation: "remove",
            value,
          } as any,
        ],
        /not supported/i,
      );
    });
  }

  it("rejects operations ExifTool cannot order without modifying metadata", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.write(file, { Subject: ["seed"] });
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-dc:Subject",
          operation: "add",
          value: "conflict",
        },
        {
          tag: "XMP-dc:Subject",
          operation: "remove",
          value: "conflict",
        },
      ],
      /cannot preserve add-then-remove/i,
    );
  });

  it("allows remove-then-add to normalize duplicate values", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.write(file, { Subject: ["forest", "keep", "forest"] });

    await exiftool.editTags(file, [
      {
        tag: "XMP-dc:Subject",
        operation: "remove",
        value: "forest",
      },
      {
        tag: "XMP-dc:Subject",
        operation: "add",
        value: "forest",
      },
    ]);

    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject"],
    })) as unknown as RawTags;
    expect(raw["XMP-dc:Subject"]).to.be.an("array");
    expect([...(raw["XMP-dc:Subject"] as string[])].sort()).to.eql([
      "forest",
      "keep",
    ]);
  });

  it("normalizes duplicate IPTC values in one write", async () => {
    const file = await testImg({ srcBasename: "iptc.jpg" });
    await exiftool.editTags(file, [
      {
        tag: "IPTC:Keywords",
        operation: "remove",
        value: "IPTC CORE : KEYWORDS",
      },
      { tag: "IPTC:Keywords", operation: "add", value: "forest" },
      { tag: "IPTC:Keywords", operation: "add", value: "keep" },
      { tag: "IPTC:Keywords", operation: "add", value: "forest" },
    ]);

    await exiftool.editTags(file, [
      {
        tag: "IPTC:Keywords",
        operation: "remove",
        value: "forest",
      },
      {
        tag: "IPTC:Keywords",
        operation: "add",
        value: "forest",
      },
    ]);

    // Bundled ExifTool 13.59 ground truth:
    // exiftool -IPTC:Keywords-=forest -IPTC:Keywords+=forest file.jpg
    // transforms [forest, keep, forest] to [forest, keep], not [keep, forest].
    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-IPTC:Keywords"],
    })) as unknown as RawTags;
    expect(raw["IPTC:Keywords"]).to.eql(["forest", "keep"]);
  });

  it("rejects ExifTool's list separator without modifying metadata", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.write(file, { Subject: ["a", "b", "keep"] });
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-dc:Subject",
          operation: "remove",
          value: "a\u001fb",
        },
      ],
      /list separator/i,
    );
  });

  it("rejects XML-invalid control characters without modifying metadata", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.write(file, { Subject: ["a.b", "keep"] });
    await expectNoModification(
      file,
      [
        {
          tag: "XMP-dc:Subject",
          operation: "add",
          value: "a\u0001b",
        },
        {
          tag: "XMP-dc:Subject",
          operation: "remove",
          value: "a.b",
        },
      ],
      /control character/i,
    );
  });

  for (const value of ["a\ud800b", "a\ufffeb", "a\u{1ffff}b"]) {
    it(`rejects non-round-tripping Unicode ${JSON.stringify(value)} without modifying metadata`, async () => {
      const file = await testFile("keywords.xmp");
      await exiftool.write(file, { Subject: ["a???b", "keep"] });
      await expectNoModification(
        file,
        [
          {
            tag: "XMP-dc:Subject",
            operation: "remove",
            value,
          },
        ],
        /Unicode|character/i,
      );
    });
  }

  // ExifTool writes a literal CR byte, and its own reader hands it back
  // unchanged, so only a conformant XML parser reveals the corruption.
  for (const value of ["a\rb", "a\r\nb"]) {
    it(`rejects the carriage return in ${JSON.stringify(value)} without modifying metadata`, async () => {
      const file = await testFile("keywords.xmp");
      await exiftool.write(file, { Subject: ["keep"] });
      await expectNoModification(
        file,
        [
          {
            tag: "XMP-dc:Subject",
            operation: "add",
            value,
          },
        ],
        /carriage return/i,
      );
    });
  }

  it("preserves a leading ASCII space in primitive values", async () => {
    const file = await testFile("keywords.xmp");
    await exiftool.editTags(file, [
      {
        tag: "XMP-dc:Subject",
        operation: "add",
        value: " leading",
      },
    ]);

    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject"],
    })) as unknown as RawTags;
    expect(raw["XMP-dc:Subject"]).to.include(" leading");
  });

  for (const writeArgs of [
    ["-sep", ","],
    ["-separator", ","],
    ["-api", "ListSplit=,"],
    ["-api", "NoDups=1"],
  ]) {
    it(`rejects edit-incompatible writeArgs ${JSON.stringify(writeArgs)} without modifying metadata`, async () => {
      const file = await testFile("keywords.xmp");
      await exiftool.write(file, { Subject: ["a", "b", "keep", "a,b"] });
      const before = await sha1(file);

      await expect(
        exiftool.editTags(
          file,
          [
            {
              tag: "XMP-dc:Subject",
              operation: "remove",
              value: "a,b",
            },
          ],
          { writeArgs },
        ),
      ).to.be.rejectedWith(/writeArgs.*not compatible/i);
      expect(await sha1(file)).to.eql(before);
    });
  }

  it("preserves literal HTML entities in primitive values", async () => {
    const file = await testFile("keywords.xmp");
    const values = ["A &amp; B", "a&#31;b"];
    await exiftool.editTags(
      file,
      values.map((value) => ({
        tag: "XMP-dc:Subject" as const,
        operation: "add" as const,
        value,
      })),
    );

    const raw = (await exiftool.readRaw(file, {
      readArgs: ["-G1", "-XMP-dc:Subject"],
    })) as unknown as RawTags;
    for (const value of values) {
      expect(raw["XMP-dc:Subject"]).to.include(value);
    }
  });

  it("requires canonical casing for a registered structured tag", async () => {
    await expect(
      exiftool.editTags(await testFile("missing.jpg"), [
        {
          tag: "XMP-mwg-coll:collections",
          operation: "remove",
          value: "Vacation",
        },
      ] as any),
    ).to.be.rejectedWith(/canonical tag casing/i);
  });

  it("rejects an injected tag before accessing the target file", async () => {
    await expect(
      exiftool.editTags(await testFile("missing.jpg"), [
        {
          tag: "XMP-dc:Subject\n-o\n../exploit",
          operation: "remove",
          value: "beach",
        },
      ] as any),
    ).to.be.rejectedWith(/invalid tag edit.*tag name|control character/i);
  });

  it("preserves WriteTaskOptions", async () => {
    const file = await testImg();
    await exiftool.editTags(
      file,
      [
        {
          tag: "XMP-dc:Subject",
          operation: "add",
          value: "forest",
        },
      ],
      { writeArgs: ["-overwrite_original"] },
    );
    expect(existsSync(file + "_original")).to.eql(false);
  });
});
