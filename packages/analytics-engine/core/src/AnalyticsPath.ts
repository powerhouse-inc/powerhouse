import { AnalyticsSerializerTypes } from "./AnalyticsPeriod.js";

export class AnalyticsPath {
  get segments(): AnalyticsPathSegment[] {
    return this._segments;
  }

  private _segments: AnalyticsPathSegment[];

  public static fromString(path: string): AnalyticsPath {
    const segments = parseSeparatedList(path, "/").map((segment) =>
      AnalyticsPathSegment.fromString(segment),
    );

    return new AnalyticsPath(segments);
  }

  public static fromStringArray(segments: string[]): AnalyticsPath {
    return new AnalyticsPath(
      segments.map((segment) => AnalyticsPathSegment.fromString(segment)),
    );
  }

  public static fromArray(segments: AnalyticsPathSegment[]): AnalyticsPath {
    return new AnalyticsPath(segments);
  }

  public static fromJSON(json: any): AnalyticsPath {
    const segments = json._v
      .split("/")
      .map((segment: string) => AnalyticsPathSegment.fromString(segment));
    return new AnalyticsPath(segments);
  }

  constructor(segments: AnalyticsPathSegment[]) {
    this._segments = segments;
  }

  public toJSON() {
    return {
      _t: AnalyticsSerializerTypes.AnalyticsPath,
      _v: this.toString(),
    };
  }

  public toString(tail: string = ""): string {
    return this._segments.map((s) => s.toString()).join("/") + tail;
  }

  public firstSegment(): AnalyticsPathSegment {
    return this._segments.length > 0
      ? this._segments[0]
      : new AnalyticsPathSegment();
  }

  public reduce(): AnalyticsPath {
    const result = this._segments.slice(1);

    if (result.length < 1) {
      result.push(new AnalyticsPathSegment());
    }

    return new AnalyticsPath(result);
  }

  public applyLod(levelOfDetail: number): AnalyticsPath {
    const segments = [...this._segments];

    while (segments.length < levelOfDetail) {
      segments.push(new AnalyticsPathSegment());
    }

    return new AnalyticsPath(segments.slice(0, levelOfDetail));
  }
}

export class AnalyticsPathSegment {
  get filters(): NullableStrings {
    return this._filters;
  }
  get groups(): NullableStrings {
    return this._groups;
  }

  private _filters: NullableStrings = null;
  private _groups: NullableStrings = null;

  public static fromString(segment: string): AnalyticsPathSegment {
    const elements = parseSeparatedList(segment, ":");

    let filtersArg: NullableStrings;
    if (elements[0] === "*") {
      filtersArg = null;
    } else {
      filtersArg = parseSeparatedList(elements[0], ",").map((f) =>
        AnalyticsPathSegment.unescape(f),
      );
    }

    let groupsArg: NullableStrings;
    if (elements[1] === undefined || elements[1].length < 1) {
      groupsArg = [];
    } else if (elements[1] === "*") {
      groupsArg = null;
    } else {
      groupsArg = parseSeparatedList(elements[1], ",").map((g) =>
        AnalyticsPathSegment.unescape(g),
      );
    }

    return new AnalyticsPathSegment(filtersArg, groupsArg);
  }

  public static escape(segment: string): string {
    // Put a backslash in front of the control characters \ : / and ,
    return segment.replace(/(\\|:|\/|,)/gi, "\\$1");
  }

  public static unescape(segment: string): string {
    // Remove backslashes in front of any character
    return segment.replace(/\\(.)/gi, "$1");
  }

  constructor(filters: NullableStrings = null, groups: NullableStrings = []) {
    this._filters = filters;
    this._groups = groups;
  }

  public toJSON() {
    return {
      _t: AnalyticsSerializerTypes.AnalyticsPathSegment,
      _v: this.toString(),
    };
  }

  public toString(): string {
    let result = "";

    if (this._filters === null) {
      result += "*";
    } else {
      result += this._filters
        .map((f) => AnalyticsPathSegment.escape(f))
        .join(",");
    }

    if (this._groups === null) {
      result += ":*";
    } else if (this._groups.length > 0) {
      result +=
        ":" + this._groups.map((g) => AnalyticsPathSegment.escape(g)).join(",");
    }

    return result;
  }
}

type NullableStrings = string[] | null;
type PathSeparator = "/" | ":" | ",";

// Defining constant regexes instead of dynamic patterns for compiler optimization
const unescapedSeparatorPattern = {
  ":": /(?<!\\):/,
  ",": /(?<!\\),/,
  "/": /(?<!\\)\//,
};

function parseSeparatedList(list: string, separator: PathSeparator): string[] {
  /*
        The basic mechanism is that we split the string by commas that 
        aren't escaped with a backslash, using the unescapedSeparatorPattern:

        - abc,def   becomes ['abc', 'def']
        - abc\,def  becomes ['abc,def']

        However, we need to deal with an edge case where the backslash 
        itself is escaped with a backslash:
        
        - abc\\,def must result in ['abc\\', 'def']
        - whereas unescapedCommaPattern would result in ['abc\\,def']

        For this edge case, we are first replacing all double backslashes with @@

        - abc\\,def is first transformed to abc@@,def
        - unescapedCommaPattern would now result in ['abc@@', 'def']
        - substituting @@ with \\ again now gives the intended result ['abc\\', 'def']

        However, we still want to support the literal string @@ in the input too.
        So, instead of always using @@ as a replacement, we're going to determine a unique 
        string first by adding as many @ as needed. 
        
        - If the original string has @@ in it, we'll use @@@
        - If the original string has @@ and @@@ in it, we'll use @@@@
        - Etc.
    */

  let substituteString = "@@";
  while (list.indexOf(substituteString) > -1) {
    substituteString += "@";
  }

  return list
    .replaceAll("\\\\", substituteString)
    .split(unescapedSeparatorPattern[separator])
    .map((e) => e.replaceAll(substituteString, "\\\\"));
}
