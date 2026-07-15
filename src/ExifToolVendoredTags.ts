import { Equal } from "./Equal";
import { ErrorsAndWarnings } from "./ErrorsAndWarnings";
import { Expect } from "./Expect";
import { InvalidUtf8Bytes } from "./InvalidUtf8Bytes";
import { StrEnum, strEnum, StrEnumKeys } from "./StrEnum";

/**
 * This tags are added to {@link Tags} from this library.
 */
export interface ExifToolVendoredTags extends ErrorsAndWarnings {
  /**
   * Original bytes for metadata strings that contained malformed UTF-8.
   *
   * This sparse object mirrors the returned tag paths. It is absent when all
   * strings were valid UTF-8 or when a custom ExifTool `Filter` handled them.
   * Each damaged string is a `Uint8Array` leaf; narrow a dynamic lookup with
   * `value instanceof Uint8Array` before decoding it.
   */
  invalidUtf8Bytes?: InvalidUtf8Bytes;

  /**
   * Either an offset, like `UTC-7`, or an actual IANA timezone, like
   * `America/Los_Angeles`.
   *
   * This will be missing if we can't intuit a timezone from the metadata.
   * @deprecated use `zone` instead
   */
  tz?: string;

  /**
   * The IANA timezone, like `America/Los_Angeles`, or a IANA-rendered static offset, like `UTC-7`.
   *
   * This will be missing if we can't intuit a timezone from the metadata.
   */
  zone?: string;

  /**
   * Description of where and how `tz` was extracted
   * @deprecated use `zoneSource` instead
   */
  tzSource?: string;

  /**
   * Description of where and how `zone` was extracted
   */
  zoneSource?: string;
}

export const ExifToolVendoredTagNames = strEnum(
  "invalidUtf8Bytes",
  "tz",
  "zone",
  "tzSource",
  "zoneSource",
  "errors",
  "warnings",
) satisfies StrEnum<keyof ExifToolVendoredTags>;

export type ExifToolVendoredTagName = StrEnumKeys<
  typeof ExifToolVendoredTagNames
>;

// Assert that the tag names enum exactly matches the keys of the interface:
declare const _: Expect<
  Equal<ExifToolVendoredTagName, keyof ExifToolVendoredTags>
>;
