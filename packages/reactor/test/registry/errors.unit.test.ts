import { describe, expect, it } from "vitest";
import {
  DowngradeNotSupportedError,
  DuplicateManifestError,
  DuplicateModuleError,
  InvalidModuleError,
  InvalidUpgradeStepError,
  ManifestNotFoundError,
  MissingUpgradeTransitionError,
  ModuleNotFoundError,
} from "../../src/registry/errors.js";

describe("ModuleNotFoundError", () => {
  it("formats message without version suffix", () => {
    const err = new ModuleNotFoundError("doc-type");
    expect(err.name).toBe("ModuleNotFoundError");
    expect(err.documentType).toBe("doc-type");
    expect(err.requestedVersion).toBeUndefined();
    expect(err.message).toBe(
      "Document model module not found for type: doc-type",
    );
  });

  it("formats message with version suffix", () => {
    const err = new ModuleNotFoundError("doc-type", 3);
    expect(err.requestedVersion).toBe(3);
    expect(err.message).toBe(
      "Document model module not found for type: doc-type version 3",
    );
  });

  it("isError matches own brand and rejects others", () => {
    expect(ModuleNotFoundError.isError(new ModuleNotFoundError("x"))).toBe(
      true,
    );
    expect(ModuleNotFoundError.isError(new Error("x"))).toBe(false);
    expect(ModuleNotFoundError.isError(null)).toBe(false);
  });
});

describe("DuplicateModuleError", () => {
  it("formats message without version", () => {
    const err = new DuplicateModuleError("doc-type");
    expect(err.name).toBe("DuplicateModuleError");
    expect(err.message).toBe(
      "Document model module already registered for type: doc-type",
    );
  });

  it("formats message with version", () => {
    const err = new DuplicateModuleError("doc-type", 2);
    expect(err.message).toBe(
      "Document model module already registered for type: doc-type (version 2)",
    );
  });

  it("isError matches own brand and rejects others", () => {
    expect(DuplicateModuleError.isError(new DuplicateModuleError("x"))).toBe(
      true,
    );
    expect(DuplicateModuleError.isError(new Error("x"))).toBe(false);
  });
});

describe("InvalidModuleError", () => {
  it("prefixes message", () => {
    const err = new InvalidModuleError("missing reducer");
    expect(err.name).toBe("InvalidModuleError");
    expect(err.message).toBe("Invalid document model module: missing reducer");
  });
});

describe("DuplicateManifestError", () => {
  it("formats message", () => {
    const err = new DuplicateManifestError("doc-type");
    expect(err.name).toBe("DuplicateManifestError");
    expect(err.message).toBe(
      "Upgrade manifest already registered for type: doc-type",
    );
  });

  it("isError matches own brand and rejects others", () => {
    expect(
      DuplicateManifestError.isError(new DuplicateManifestError("x")),
    ).toBe(true);
    expect(DuplicateManifestError.isError(new Error("x"))).toBe(false);
  });
});

describe("ManifestNotFoundError", () => {
  it("formats message", () => {
    const err = new ManifestNotFoundError("doc-type");
    expect(err.name).toBe("ManifestNotFoundError");
    expect(err.message).toBe("Upgrade manifest not found for type: doc-type");
  });
});

describe("DowngradeNotSupportedError", () => {
  it("formats message with from/to", () => {
    const err = new DowngradeNotSupportedError("doc-type", 3, 1);
    expect(err.name).toBe("DowngradeNotSupportedError");
    expect(err.message).toBe(
      "Downgrade not supported for doc-type: cannot go from version 3 to 1",
    );
  });
});

describe("MissingUpgradeTransitionError", () => {
  it("formats message", () => {
    const err = new MissingUpgradeTransitionError("doc-type", 1, 2);
    expect(err.name).toBe("MissingUpgradeTransitionError");
    expect(err.message).toBe(
      "Missing upgrade transition for doc-type: v1 to v2",
    );
  });
});

describe("InvalidUpgradeStepError", () => {
  it("formats message", () => {
    const err = new InvalidUpgradeStepError("doc-type", 1, 3);
    expect(err.name).toBe("InvalidUpgradeStepError");
    expect(err.message).toBe(
      "Invalid upgrade step for doc-type: must be single version increment, got v1 to v3",
    );
  });
});
