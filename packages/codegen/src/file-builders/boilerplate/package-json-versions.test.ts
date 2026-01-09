import { describe, expect, test } from "vitest";
import { fetchNpmVersionFromRegistryForTag } from "../utils.js";
import {
  VERSIONED_DEPENDENCIES,
  VERSIONED_DEV_DEPENDENCIES,
} from "./constants.js";

const powerhousePackages = [
  ...VERSIONED_DEPENDENCIES,
  ...VERSIONED_DEV_DEPENDENCIES,
];

describe("Fetch npm version for package at tag from npm registry", () => {
  test("Fetch versions without specified tag", { timeout: 15000 }, async () => {
    const powerhousePackageVersionsWithoutSpecifiedTag = await Promise.all(
      powerhousePackages.map((packageName) =>
        fetchNpmVersionFromRegistryForTag(packageName, ""),
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
        fetchNpmVersionFromRegistryForTag(packageName, "latest"),
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
        fetchNpmVersionFromRegistryForTag(packageName, "dev"),
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
        fetchNpmVersionFromRegistryForTag(packageName, "staging"),
      ),
    );
    console.log({ powerhousePackageVersionsAtStaging });
    expect(powerhousePackageVersionsAtStaging.length).toEqual(
      powerhousePackages.length,
    );
    expect(new Set(powerhousePackageVersionsAtStaging).size).toBe(1);
  });
});
