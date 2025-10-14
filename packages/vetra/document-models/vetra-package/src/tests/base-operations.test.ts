/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import type {
  AddPackageKeywordInput,
  RemovePackageKeywordInput,
  SetPackageAuthorInput,
  SetPackageAuthorNameInput,
  SetPackageAuthorWebsiteInput,
  SetPackageCategoryInput,
  SetPackageDescriptionInput,
  SetPackageGithubUrlInput,
  SetPackageNameInput,
  SetPackageNpmUrlInput,
} from "../../gen/schema/index.js";
import { z } from "../../gen/schema/index.js";
import type { VetraPackageDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("BaseOperations Operations", () => {
  let document: VetraPackageDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setPackageName", () => {
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

    it("should mutate state with new name", () => {
      const input: SetPackageNameInput = { name: "my-package" };

      const updatedDocument = reducer(document, creators.setPackageName(input));

      expect(updatedDocument.state.global.name).toBe("my-package");
    });
  });

  describe("setPackageDescription", () => {
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

    it("should mutate state with new description", () => {
      const input: SetPackageDescriptionInput = {
        description: "A test package",
      };

      const updatedDocument = reducer(
        document,
        creators.setPackageDescription(input),
      );

      expect(updatedDocument.state.global.description).toBe("A test package");
    });
  });

  describe("setPackageCategory", () => {
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

    it("should mutate state with new category", () => {
      const input: SetPackageCategoryInput = { category: "utility" };

      const updatedDocument = reducer(
        document,
        creators.setPackageCategory(input),
      );

      expect(updatedDocument.state.global.category).toBe("utility");
    });
  });

  describe("setPackageAuthor", () => {
    it("should handle setPackageAuthor operation", () => {
      const input: SetPackageAuthorInput = generateMock(
        z.SetPackageAuthorInputSchema(),
      );

      const updatedDocument = reducer(
        document,
        creators.setPackageAuthor(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "SET_PACKAGE_AUTHOR",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it("should mutate state with both name and website", () => {
      const input: SetPackageAuthorInput = {
        name: "John Doe",
        website: "https://johndoe.com",
      };

      const updatedDocument = reducer(
        document,
        creators.setPackageAuthor(input),
      );

      expect(updatedDocument.state.global.author.name).toBe("John Doe");
      expect(updatedDocument.state.global.author.website).toBe(
        "https://johndoe.com",
      );
    });

    it("should handle partial author data (name only or website only)", () => {
      // Name only
      let updatedDoc = reducer(
        document,
        creators.setPackageAuthor({ name: "Jane Doe" }),
      );
      expect(updatedDoc.state.global.author.name).toBe("Jane Doe");
      expect(updatedDoc.state.global.author.website).toBeNull();

      // Website only
      updatedDoc = reducer(
        updatedDoc,
        creators.setPackageAuthor({ website: "https://janedoe.com" }),
      );
      expect(updatedDoc.state.global.author.name).toBeNull();
      expect(updatedDoc.state.global.author.website).toBe(
        "https://janedoe.com",
      );
    });
  });

  describe("setPackageAuthorName", () => {
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

    it("should mutate state with new author name", () => {
      const input: SetPackageAuthorNameInput = { name: "Alice" };

      const updatedDocument = reducer(
        document,
        creators.setPackageAuthorName(input),
      );

      expect(updatedDocument.state.global.author.name).toBe("Alice");
    });
  });

  describe("setPackageAuthorWebsite", () => {
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

    it("should mutate state with new author website", () => {
      const input: SetPackageAuthorWebsiteInput = {
        website: "https://example.com",
      };

      const updatedDocument = reducer(
        document,
        creators.setPackageAuthorWebsite(input),
      );

      expect(updatedDocument.state.global.author.website).toBe(
        "https://example.com",
      );
    });
  });

  describe("addPackageKeyword", () => {
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

    it("should mutate state by adding keyword to array", () => {
      const input: AddPackageKeywordInput = {
        id: "kw-1",
        label: "react",
      };

      const updatedDocument = reducer(
        document,
        creators.addPackageKeyword(input),
      );

      expect(updatedDocument.state.global.keywords).toContainEqual({
        id: "kw-1",
        label: "react",
      });
    });

    it("should add to empty array from initial state", () => {
      expect(document.state.global.keywords).toEqual([]);

      const input: AddPackageKeywordInput = {
        id: "first-kw",
        label: "typescript",
      };

      const updatedDocument = reducer(
        document,
        creators.addPackageKeyword(input),
      );

      expect(updatedDocument.state.global.keywords).toEqual([
        { id: "first-kw", label: "typescript" },
      ]);
    });

    it("should add multiple keywords sequentially", () => {
      let updatedDoc = reducer(
        document,
        creators.addPackageKeyword({ id: "kw-1", label: "react" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({ id: "kw-2", label: "vue" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({ id: "kw-3", label: "angular" }),
      );

      expect(updatedDoc.state.global.keywords).toHaveLength(3);
      expect(updatedDoc.state.global.keywords[0]).toEqual({
        id: "kw-1",
        label: "react",
      });
      expect(updatedDoc.state.global.keywords[1]).toEqual({
        id: "kw-2",
        label: "vue",
      });
      expect(updatedDoc.state.global.keywords[2]).toEqual({
        id: "kw-3",
        label: "angular",
      });
    });

    it("should reject duplicate IDs and store error in operation", () => {
      const input: AddPackageKeywordInput = {
        id: "duplicate",
        label: "first",
      };

      let updatedDoc = reducer(document, creators.addPackageKeyword(input));
      expect(updatedDoc.state.global.keywords).toHaveLength(1);
      expect(updatedDoc.operations.global[0].error).toBeUndefined();

      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({
          id: "duplicate",
          label: "second",
        }),
      );

      expect(updatedDoc.operations.global).toHaveLength(2);
      expect(updatedDoc.operations.global[1].error).toBe(
        'Keyword with id "duplicate" already exists',
      );
      expect(updatedDoc.state.global.keywords).toHaveLength(1);
    });

    it("should increase array length correctly", () => {
      const initialLength = document.state.global.keywords.length;

      const updatedDocument = reducer(
        document,
        creators.addPackageKeyword({ id: "new", label: "test" }),
      );

      expect(updatedDocument.state.global.keywords.length).toBe(
        initialLength + 1,
      );
    });
  });

  describe("removePackageKeyword", () => {
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

    it("should mutate state by removing keyword from array", () => {
      let updatedDoc = reducer(
        document,
        creators.addPackageKeyword({
          id: "to-remove",
          label: "test",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removePackageKeyword({ id: "to-remove" }),
      );

      expect(updatedDoc.state.global.keywords).not.toContainEqual({
        id: "to-remove",
        label: "test",
      });
    });

    it("should remove existing ID", () => {
      let updatedDoc = reducer(
        document,
        creators.addPackageKeyword({
          id: "existing",
          label: "test",
        }),
      );

      const lengthBefore = updatedDoc.state.global.keywords.length;

      updatedDoc = reducer(
        updatedDoc,
        creators.removePackageKeyword({ id: "existing" }),
      );

      expect(updatedDoc.state.global.keywords.length).toBe(lengthBefore - 1);
      expect(
        updatedDoc.state.global.keywords.find((kw) => kw.id === "existing"),
      ).toBeUndefined();
    });

    it("should gracefully handle non-existent ID", () => {
      const initialState = document.state.global.keywords;

      const updatedDocument = reducer(
        document,
        creators.removePackageKeyword({ id: "non-existent-id" }),
      );

      expect(updatedDocument.state.global.keywords).toEqual(initialState);
    });

    it("should handle empty array gracefully", () => {
      expect(document.state.global.keywords).toEqual([]);

      const updatedDocument = reducer(
        document,
        creators.removePackageKeyword({ id: "any-id" }),
      );

      expect(updatedDocument.state.global.keywords).toEqual([]);
    });

    it("should add then immediately remove item", () => {
      let updatedDoc = reducer(
        document,
        creators.addPackageKeyword({
          id: "temp-kw",
          label: "temp",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removePackageKeyword({ id: "temp-kw" }),
      );

      expect(
        updatedDoc.state.global.keywords.find((kw) => kw.id === "temp-kw"),
      ).toBeUndefined();
      expect(updatedDoc.operations.global).toHaveLength(2);
    });
  });

  describe("setPackageGithubUrl", () => {
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

    it("should mutate state with new GitHub URL", () => {
      const input: SetPackageGithubUrlInput = {
        url: "https://github.com/user/repo",
      };

      const updatedDocument = reducer(
        document,
        creators.setPackageGithubUrl(input),
      );

      expect(updatedDocument.state.global.githubUrl).toBe(
        "https://github.com/user/repo",
      );
    });
  });

  describe("setPackageNpmUrl", () => {
    it("should handle setPackageNpmUrl operation", () => {
      const input: SetPackageNpmUrlInput = generateMock(
        z.SetPackageNpmUrlInputSchema(),
      );

      const updatedDocument = reducer(
        document,
        creators.setPackageNpmUrl(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "SET_PACKAGE_NPM_URL",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it("should mutate state with new npm URL", () => {
      const input: SetPackageNpmUrlInput = {
        url: "https://npmjs.com/package/my-package",
      };

      const updatedDocument = reducer(
        document,
        creators.setPackageNpmUrl(input),
      );

      expect(updatedDocument.state.global.npmUrl).toBe(
        "https://npmjs.com/package/my-package",
      );
    });
  });
});
