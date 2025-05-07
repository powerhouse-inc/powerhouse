import { describe, expect, it } from "vitest";
import { updatePackagesArray } from "../src/utils.js";

describe("updatePackagesArray", () => {
  it("should add new packages when installing", () => {
    const currentPackages = [{ packageName: "existing-package" }];
    const dependencies = ["new-package"];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "existing-package" },
      { packageName: "new-package" },
    ]);
  });

  it("should not duplicate packages when installing package that is already installed", () => {
    const currentPackages = [{ packageName: "package-a" }];
    const dependencies = ["package-a"];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([{ packageName: "package-a" }]);
  });

  it("should remove packages when uninstalling", () => {
    const currentPackages = [
      { packageName: "package-a" },
      { packageName: "package-b" },
    ];
    const dependencies = ["package-a"];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "uninstall",
    );

    expect(result).toEqual([{ packageName: "package-b" }]);
  });

  it("should handle empty current packages array", () => {
    const dependencies = ["new-package"];

    const result = updatePackagesArray(undefined, dependencies, "install");

    expect(result).toEqual([{ packageName: "new-package" }]);
  });

  it("should handle empty dependencies array", () => {
    const currentPackages = [{ packageName: "existing-package" }];

    const result = updatePackagesArray(currentPackages, [], "install");

    expect(result).toEqual(currentPackages);
  });
});
