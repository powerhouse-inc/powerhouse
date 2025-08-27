import { type PowerhouseConfig } from "@powerhousedao/config";
import { describe, expect, it } from "vitest";
import { buildInstallCommand } from "../src/commands/install.js";
import { updatePackagesArray } from "../src/utils.js";

describe("updatePackagesArray", () => {
  it("should add new packages when installing", () => {
    const currentPackages = [{ packageName: "existing-package" }];
    const dependencies = [
      { name: "new-package", version: undefined, full: "new-package" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "existing-package" },
      { packageName: "new-package", version: undefined, provider: "npm" },
    ]);
  });

  it("should not duplicate packages when installing package that is already installed", () => {
    const currentPackages = [{ packageName: "package-a" }];
    const dependencies = [
      { name: "package-a", version: undefined, full: "package-a" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "package-a", version: undefined, provider: "npm" },
    ]);
  });

  it("should remove packages when uninstalling", () => {
    const currentPackages: PowerhouseConfig["packages"] = [
      { packageName: "package-a", version: undefined, provider: "npm" },
      { packageName: "package-b", version: undefined, provider: "npm" },
    ];
    const dependencies = [
      { name: "package-a", version: undefined, full: "package-a" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "uninstall",
    );

    expect(result).toEqual([
      { packageName: "package-b", version: undefined, provider: "npm" },
    ]);
  });

  it("should handle empty current packages array", () => {
    const dependencies = [
      { name: "new-package", version: undefined, full: "new-package" },
    ];

    const result = updatePackagesArray(undefined, dependencies, "install");

    expect(result).toEqual([
      { packageName: "new-package", version: undefined, provider: "npm" },
    ]);
  });

  it("should handle empty dependencies array", () => {
    const currentPackages = [{ packageName: "existing-package" }];

    const result = updatePackagesArray(currentPackages, [], "install");

    expect(result).toEqual(currentPackages);
  });

  it("should add new packages with version and provider when installing", () => {
    const currentPackages: PowerhouseConfig["packages"] = [
      { packageName: "existing-package" },
    ];
    const dependencies = [
      { name: "new-package", version: "1.2.3", full: "new-package@1.2.3" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "existing-package" },
      { packageName: "new-package", version: "1.2.3", provider: "npm" },
    ]);
  });

  it("should not duplicate packages when installing package that is already installed with version", () => {
    const currentPackages: PowerhouseConfig["packages"] = [
      { packageName: "package-a", version: "1.0.0", provider: "npm" },
    ];
    const dependencies = [
      { name: "package-a", version: "1.0.0", full: "package-a@1.0.0" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "package-a", version: "1.0.0", provider: "npm" },
    ]);
  });

  it("should overwrite existing package if version is different", () => {
    const currentPackages: PowerhouseConfig["packages"] = [
      { packageName: "package-a", version: "1.0.0", provider: "npm" },
    ];
    const dependencies = [
      { name: "package-a", version: "2.0.0", full: "package-a@2.0.0" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "package-a", version: "2.0.0", provider: "npm" },
    ]);
  });

  it("should overwrite existing package if version is lower", () => {
    const currentPackages: PowerhouseConfig["packages"] = [
      { packageName: "package-a", version: "1.0.0", provider: "npm" },
    ];
    const dependencies = [
      { name: "package-a", version: "0.5.0", full: "package-a@0.5.0" },
    ];

    const result = updatePackagesArray(
      currentPackages,
      dependencies,
      "install",
    );

    expect(result).toEqual([
      { packageName: "package-a", version: "0.5.0", provider: "npm" },
    ]);
  });
});

describe("buildInstallCommand", () => {
  it("should return the correct install command", () => {
    const packageManager = "npm";
    const dependencies = ["test-package@1.2.3"];
    const workspace = false;

    const result = buildInstallCommand(packageManager, dependencies, workspace);

    expect(result).toBe("npm install test-package@1.2.3");
  });

  it("should return the correct install command with workspace", () => {
    const packageManager = "yarn";
    const dependencies = ["test-package@1.2.3"];
    const workspace = true;

    const result = buildInstallCommand(packageManager, dependencies, workspace);

    expect(result).toBe("yarn add test-package@1.2.3 -W");
  });

  it("should return the correct install command when no version is specified", () => {
    const packageManager = "npm";
    const dependencies = ["test-package"];
    const workspace = false;

    const result = buildInstallCommand(packageManager, dependencies, workspace);

    expect(result).toBe("npm install test-package");
  });

  it("should return the correct install command when package name includes @ character", () => {
    const packageManager = "yarn";
    const dependencies = ["@sky-ph/atlas@1.2.3"];
    const workspace = true;

    const result = buildInstallCommand(packageManager, dependencies, workspace);

    expect(result).toBe("yarn add @sky-ph/atlas@1.2.3 -W");
  });
});
