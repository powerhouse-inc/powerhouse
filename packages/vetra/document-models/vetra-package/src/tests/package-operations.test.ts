/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import utils from "../../gen/utils.js";
import {
  z,
  type SetPackageNameInput,
  type SetPackageDescriptionInput,
  type SetPackageCategoryInput,
  type SetPackagePublisherInput,
  type SetPackagePublisherUrlInput,
  type SetPackageKeywordsInput,
  type SetPackageGithubUrlInput,
  type SetPackageNpmUrlInput,
} from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/package-operations/creators.js";
import type { VetraPackageDocument } from "../../gen/types.js";

describe("PackageOperations Operations", () => {
  let document: VetraPackageDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle setPackageName operation", () => {
    const input: SetPackageNameInput = generateMock(
      z.SetPackageNameInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setPackageName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("SET_PACKAGE_NAME");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageDescription operation", () => {
    const input: SetPackageDescriptionInput = generateMock(
      z.SetPackageDescriptionInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageDescription(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageCategory operation", () => {
    const input: SetPackageCategoryInput = generateMock(
      z.SetPackageCategoryInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageCategory(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_CATEGORY",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackagePublisher operation", () => {
    const input: SetPackagePublisherInput = generateMock(
      z.SetPackagePublisherInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackagePublisher(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_PUBLISHER",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackagePublisherUrl operation", () => {
    const input: SetPackagePublisherUrlInput = generateMock(
      z.SetPackagePublisherUrlInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackagePublisherUrl(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_PUBLISHER_URL",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageKeywords operation", () => {
    const input: SetPackageKeywordsInput = generateMock(
      z.SetPackageKeywordsInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageKeywords(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_KEYWORDS",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageGithubUrl operation", () => {
    const input: SetPackageGithubUrlInput = generateMock(
      z.SetPackageGithubUrlInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageGithubUrl(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_GITHUB_URL",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageNpmUrl operation", () => {
    const input: SetPackageNpmUrlInput = generateMock(
      z.SetPackageNpmUrlInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setPackageNpmUrl(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "SET_PACKAGE_NPM_URL",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
