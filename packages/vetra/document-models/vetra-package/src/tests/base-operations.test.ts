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
  type SetPackageAuthorInput,
  type SetPackageAuthorNameInput,
  type SetPackageAuthorWebsiteInput,
  type AddPackageKeywordInput,
  type RemovePackageKeywordInput,
  type SetPackageGithubUrlInput,
  type SetPackageNpmUrlInput,
} from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/base-operations/creators.js";
import type { VetraPackageDocument } from "../../gen/types.js";

describe("BaseOperations Operations", () => {
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
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
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
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
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
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_CATEGORY",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageAuthor operation", () => {
    const input: SetPackageAuthorInput = generateMock(
      z.SetPackageAuthorInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setPackageAuthor(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_AUTHOR",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageAuthorName operation", () => {
    const input: SetPackageAuthorNameInput = generateMock(
      z.SetPackageAuthorNameInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageAuthorName(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_AUTHOR_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageAuthorWebsite operation", () => {
    const input: SetPackageAuthorWebsiteInput = generateMock(
      z.SetPackageAuthorWebsiteInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.setPackageAuthorWebsite(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_AUTHOR_WEBSITE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle addPackageKeyword operation", () => {
    const input: AddPackageKeywordInput = generateMock(
      z.AddPackageKeywordInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.addPackageKeyword(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_PACKAGE_KEYWORD",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle removePackageKeyword operation", () => {
    const input: RemovePackageKeywordInput = generateMock(
      z.RemovePackageKeywordInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.removePackageKeyword(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_PACKAGE_KEYWORD",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
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
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_GITHUB_URL",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setPackageNpmUrl operation", () => {
    const input: SetPackageNpmUrlInput = generateMock(
      z.SetPackageNpmUrlInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setPackageNpmUrl(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_PACKAGE_NPM_URL",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
