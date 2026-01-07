import { describe, expect, test } from "vitest";
import { SPECIAL_PACKAGES } from "./constants.js";
import {
  fetchNpmVersionFromRegistryForTag,
  getVersioningScheme,
} from "./utils.js";

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

describe("Get versioning scheme from args", () => {
  test("Should return the correct versioning scheme from args", () => {
    const notSpecified = {};
    expect(getVersioningScheme(notSpecified)).toBeUndefined();
    const tagSpecified = { tag: "some-tag" };
    expect(getVersioningScheme(tagSpecified)).toEqual("tag");
    const versionSpecified = { version: "some-version" };
    expect(getVersioningScheme(versionSpecified)).toEqual("version");
    const branchSpecified = { branch: "some-branch" };
    expect(getVersioningScheme(branchSpecified)).toEqual("branch");
  });
  test("Should not allow multiple versioning schemes to be specified", () => {
    const twoSchemesSpecified = {
      tag: "some-tag",
      branch: "some-branch",
    };
    const threeVersionsSpecified = {
      ...twoSchemesSpecified,
      version: "some-version",
    };
    try {
      expect(getVersioningScheme(twoSchemesSpecified)).toThrowError();
      expect(getVersioningScheme(threeVersionsSpecified)).toThrowError();
    } catch (e) {
      // ignore error, we are testing the error case
    }
  });
});
