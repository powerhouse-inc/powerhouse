import { describe, it, expect } from "vitest";
import { buildListenerFilter } from "../../src/sync/utils";
import { ListenerFilter } from "../../src/sync/types";
describe("buildListenerFilter", () => {
  it("should return default values when no filter is provided", () => {
    const result = buildListenerFilter();

    expect(result).toEqual<ListenerFilter>({
      branch: ["*"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["*"],
    });
  });

  it("should override default values when a full filter is provided", () => {
    const filter: ListenerFilter = {
      branch: ["main"],
      documentId: ["doc1", "doc2"],
      documentType: ["type1"],
      scope: ["global", "local"],
    };

    const result = buildListenerFilter(filter);

    expect(result).toEqual(filter);
  });

  it("should merge provided values with defaults", () => {
    const filter: Partial<ListenerFilter> = {
      branch: ["feature"],
      documentType: ["customType"],
    };

    const result = buildListenerFilter(filter);

    expect(result).toEqual<ListenerFilter>({
      branch: ["feature"],
      documentId: ["*"],
      documentType: ["customType"],
      scope: ["*"],
    });
  });

  it("should handle empty arrays in the provided filter", () => {
    const filter: Partial<ListenerFilter> = {
      branch: [],
      scope: [],
    };

    const result = buildListenerFilter(filter);

    expect(result).toEqual<ListenerFilter>({
      branch: [],
      documentId: ["*"],
      documentType: ["*"],
      scope: [],
    });
  });

  it("should not mutate the input filter object", () => {
    const filter: Partial<ListenerFilter> = {
      branch: ["dev"],
    };

    const originalFilter = { ...filter };

    buildListenerFilter(filter);

    expect(filter).toEqual(originalFilter);
  });
});
