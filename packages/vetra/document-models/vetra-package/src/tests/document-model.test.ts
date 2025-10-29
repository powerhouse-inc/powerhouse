/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import { utils } from "@powerhousedao/vetra/document-models/vetra-package";

describe("Vetra Package Document Model", () => {
  it("should have correct initial values", () => {
    const document = utils.createDocument();

    expect(document.state.global.name).toBeNull();
    expect(document.state.global.description).toBeNull();
    expect(document.state.global.category).toBeNull();
    expect(document.state.global.author).toEqual({
      name: null,
      website: null,
    });
    expect(document.state.global.keywords).toEqual([]);
    expect(document.state.global.githubUrl).toBeNull();
    expect(document.state.global.npmUrl).toBeNull();
  });

  it("should handle multiple operations and maintain consistency", () => {
    const document = utils.createDocument();

    let updatedDoc = reducer(
      document,
      creators.setPackageName({ name: "test-package" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageDescription({ description: "A test package" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageCategory({ category: "utility" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.addPackageKeyword({ id: "kw-1", label: "react" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageGithubUrl({
        url: "https://github.com/user/test-package",
      }),
    );

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("test-package");
    expect(updatedDoc.state.global.description).toBe("A test package");
    expect(updatedDoc.state.global.category).toBe("utility");
    expect(updatedDoc.state.global.keywords).toHaveLength(1);
    expect(updatedDoc.state.global.githubUrl).toBe(
      "https://github.com/user/test-package",
    );
  });

  it("should handle complete workflow: set metadata, author, and keywords", () => {
    const document = utils.createDocument();

    // Step 1: Set package metadata
    let updatedDoc = reducer(
      document,
      creators.setPackageName({ name: "awesome-lib" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageDescription({
        description: "An awesome library for everything",
      }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageCategory({ category: "library" }),
    );

    // Step 2: Set author information
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageAuthor({
        name: "Jane Developer",
        website: "https://janedeveloper.com",
      }),
    );

    // Step 3: Add keywords
    updatedDoc = reducer(
      updatedDoc,
      creators.addPackageKeyword({ id: "kw-1", label: "javascript" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.addPackageKeyword({ id: "kw-2", label: "typescript" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.addPackageKeyword({ id: "kw-3", label: "react" }),
    );

    // Step 4: Set repository URLs
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageGithubUrl({
        url: "https://github.com/jane/awesome-lib",
      }),
    );
    updatedDoc = reducer(
      updatedDoc,
      creators.setPackageNpmUrl({
        url: "https://npmjs.com/package/awesome-lib",
      }),
    );

    // Verify final state
    expect(updatedDoc.operations.global).toHaveLength(9);
    expect(updatedDoc.state.global.name).toBe("awesome-lib");
    expect(updatedDoc.state.global.author.name).toBe("Jane Developer");
    expect(updatedDoc.state.global.keywords).toHaveLength(3);
    expect(updatedDoc.state.global.githubUrl).toBe(
      "https://github.com/jane/awesome-lib",
    );
    expect(updatedDoc.state.global.npmUrl).toBe(
      "https://npmjs.com/package/awesome-lib",
    );
  });

  describe("Complex Scenarios", () => {
    it("should handle author updates: full then partial", () => {
      const document = utils.createDocument();

      // Set full author
      let updatedDoc = reducer(
        document,
        creators.setPackageAuthor({
          name: "John Doe",
          website: "https://johndoe.com",
        }),
      );
      expect(updatedDoc.state.global.author.name).toBe("John Doe");
      expect(updatedDoc.state.global.author.website).toBe(
        "https://johndoe.com",
      );

      // Update only name
      updatedDoc = reducer(
        updatedDoc,
        creators.setPackageAuthorName({ name: "Jane Doe" }),
      );
      expect(updatedDoc.state.global.author.name).toBe("Jane Doe");
      expect(updatedDoc.state.global.author.website).toBe(
        "https://johndoe.com",
      );

      // Update only website
      updatedDoc = reducer(
        updatedDoc,
        creators.setPackageAuthorWebsite({
          website: "https://janedoe.com",
        }),
      );
      expect(updatedDoc.state.global.author.name).toBe("Jane Doe");
      expect(updatedDoc.state.global.author.website).toBe(
        "https://janedoe.com",
      );
    });

    it("should maintain state integrity with keyword add/remove sequences", () => {
      const document = utils.createDocument();

      // Add multiple keywords
      let updatedDoc = reducer(
        document,
        creators.addPackageKeyword({ id: "kw-a", label: "react" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({ id: "kw-b", label: "vue" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({ id: "kw-c", label: "angular" }),
      );
      expect(updatedDoc.state.global.keywords).toHaveLength(3);

      // Remove middle one
      updatedDoc = reducer(
        updatedDoc,
        creators.removePackageKeyword({ id: "kw-b" }),
      );
      expect(updatedDoc.state.global.keywords).toHaveLength(2);

      // Add it back with new label value
      updatedDoc = reducer(
        updatedDoc,
        creators.addPackageKeyword({ id: "kw-b", label: "svelte" }),
      );
      expect(updatedDoc.state.global.keywords).toHaveLength(3);

      // Verify order and content
      const keywordB = updatedDoc.state.global.keywords.find(
        (kw) => kw.id === "kw-b",
      );
      expect(keywordB?.label).toBe("svelte");

      // Verify operation history
    });
  });
});
