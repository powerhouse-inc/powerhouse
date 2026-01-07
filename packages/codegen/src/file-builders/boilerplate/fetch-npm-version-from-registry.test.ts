import { describe, expect, test } from "vitest";
import { SPECIAL_PACKAGES } from "./constants.js";
import { fetchNpmVersionFromRegistry } from "./utils.js";

const powerhousePackages = [
  ...SPECIAL_PACKAGES,
  "@powerhousedao/common",
  "@powerhousedao/design-system",
  "@powerhousedao/vetra",
  "@powerhousedao/builder-tools",
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/connect",
];

describe("Fetch npm version for package at tag from npm registry", () => {
  test("Fetch versions without specified tag", { timeout: 15000 }, async () => {
    const powerhousePackageVersionsWithoutSpecifiedTag = await Promise.all(
      powerhousePackages.map((packageName) =>
        fetchNpmVersionFromRegistry(packageName, ""),
      ),
    );
    console.log({ powerhousePackageVersionsWithoutSpecifiedTag });
    expect(powerhousePackageVersionsWithoutSpecifiedTag.length).toEqual(
      powerhousePackages.length,
    );
    expect(new Set(powerhousePackageVersionsWithoutSpecifiedTag).size).toBe(1);
  });
  test("Fetch versions @latest", { timeout: 15000 }, async () => {
    const powerhousePackageVersionsAtLatest = await Promise.all(
      powerhousePackages.map((packageName) =>
        fetchNpmVersionFromRegistry(packageName, "latest"),
      ),
    );
    console.log({ powerhousePackageVersionsAtLatest });
    expect(powerhousePackageVersionsAtLatest.length).toEqual(
      powerhousePackages.length,
    );
    expect(new Set(powerhousePackageVersionsAtLatest).size).toBe(1);
  });
  test("Fetch versions @dev", { timeout: 15000 }, async () => {
    const powerhousePackageVersionsAtDev = await Promise.all(
      powerhousePackages.map((packageName) =>
        fetchNpmVersionFromRegistry(packageName, "dev"),
      ),
    );
    console.log({ powerhousePackageVersionsAtDev });
    expect(powerhousePackageVersionsAtDev.length).toEqual(
      powerhousePackages.length,
    );
    expect(new Set(powerhousePackageVersionsAtDev).size).toBe(1);
  });
  test("Fetch versions @staging", { timeout: 15000 }, async () => {
    const powerhousePackageVersionsAtStaging = await Promise.all(
      powerhousePackages.map((packageName) =>
        fetchNpmVersionFromRegistry(packageName, "staging"),
      ),
    );
    console.log({ powerhousePackageVersionsAtStaging });
    expect(powerhousePackageVersionsAtStaging.length).toEqual(
      powerhousePackages.length,
    );
    expect(new Set(powerhousePackageVersionsAtStaging).size).toBe(1);
  });
});
