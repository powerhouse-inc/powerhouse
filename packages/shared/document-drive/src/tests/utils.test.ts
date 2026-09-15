import type {
  CopyNodeInput,
  DocumentDriveGlobalState,
  Node,
} from "../../gen/schema/types.js";
import { beforeEach, describe, expect, it } from "vitest";

import {
  assignNodes,
  generateNodesCopy,
  getNextCopyNumber,
  handleTargetNameCollisions,
  insertNodeSorted,
  sortNodesById,
} from "../utils.js";

const baseNodes: DocumentDriveGlobalState["nodes"] = [
  {
    id: "1",
    name: "Folder 1",
    parentFolder: null,
    kind: "folder",
  },
  {
    id: "1.1",
    name: "Folder 1.1",
    parentFolder: "1",
    kind: "folder",
  },
  {
    id: "1.1.1",
    name: "Folder 1.1.1",
    parentFolder: "1.1",
    kind: "folder",
  },
  {
    id: "2",
    name: "Folder 2",
    parentFolder: null,
    kind: "folder",
  },
  {
    id: "3",
    name: "Folder 3",
    parentFolder: null,
    kind: "folder",
  },
];

const generateId = (id: string) => `${id}-copy`;

describe("DocumentDrive Utils", () => {
  let nodes: DocumentDriveGlobalState["nodes"];

  beforeEach(() => {
    nodes = [...baseNodes];
  });

  describe("generateNodesCopy", () => {
    it("should return a copy of the affected nodes (subfolders and files) with new id", () => {
      const expectedResult: CopyNodeInput[] = [
        {
          srcId: "1",
          targetId: "1-copy",
          targetName: "Folder 1",
          targetParentFolder: null,
        },
        {
          srcId: "1.1",
          targetId: "1.1-copy",
          targetName: "Folder 1.1",
          targetParentFolder: "1-copy",
        },
        {
          srcId: "1.1.1",
          targetId: "1.1.1-copy",
          targetName: "Folder 1.1.1",
          targetParentFolder: "1.1-copy",
        },
      ];

      const result = generateNodesCopy(
        { srcId: "1" },
        (node) => generateId(node.id),
        nodes,
      );

      expect(result.length).toBe(3);
      expect(result).toEqual(expectedResult);
    });

    it("should return a copy of the affected nodes (subfolders and files) with new id and new name for the target node", () => {
      const expectedResult: CopyNodeInput[] = [
        {
          srcId: "1",
          targetId: "1-copy",
          targetName: "New Name",
          targetParentFolder: null,
        },
        {
          srcId: "1.1",
          targetId: "1.1-copy",
          targetName: "Folder 1.1",
          targetParentFolder: "1-copy",
        },
        {
          srcId: "1.1.1",
          targetId: "1.1.1-copy",
          targetName: "Folder 1.1.1",
          targetParentFolder: "1.1-copy",
        },
      ];

      const result = generateNodesCopy(
        { srcId: "1", targetName: "New Name" },
        (node) => generateId(node.id),
        nodes,
      );

      expect(result.length).toBe(3);
      expect(result).toEqual(expectedResult);
    });

    it("should copy a single node inside another", () => {
      const expectedResult: CopyNodeInput[] = [
        {
          srcId: "1.1.1",
          targetId: "1.1.1-copy",
          targetName: "Folder 1.1.1",
          targetParentFolder: "1.1",
        },
      ];

      const result = generateNodesCopy(
        { srcId: "1.1.1", targetParentFolder: "1.1" },
        (node) => generateId(node.id),
        nodes,
      );

      expect(result.length).toBe(1);
      expect(result).toEqual(expectedResult);
    });

    it("should copy target and sub-nodes into a different node", () => {
      const expectedResult: CopyNodeInput[] = [
        {
          srcId: "1",
          targetId: "1-copy",
          targetName: "Folder 1",
          targetParentFolder: "2",
        },
        {
          srcId: "1.1",
          targetId: "1.1-copy",
          targetName: "Folder 1.1",
          targetParentFolder: "1-copy",
        },
        {
          srcId: "1.1.1",
          targetId: "1.1.1-copy",
          targetName: "Folder 1.1.1",
          targetParentFolder: "1.1-copy",
        },
      ];

      const result = generateNodesCopy(
        { srcId: "1", targetParentFolder: "2" },
        (node) => generateId(node.id),
        nodes,
      );

      expect(result.length).toBe(3);
      expect(result).toEqual(expectedResult);
    });

    it("should copy target and sub-nodes into a different node with a different name", () => {
      const expectedResult: CopyNodeInput[] = [
        {
          srcId: "1",
          targetId: "1-copy",
          targetName: "New Name",
          targetParentFolder: "2",
        },
        {
          srcId: "1.1",
          targetId: "1.1-copy",
          targetName: "Folder 1.1",
          targetParentFolder: "1-copy",
        },
        {
          srcId: "1.1.1",
          targetId: "1.1.1-copy",
          targetName: "Folder 1.1.1",
          targetParentFolder: "1.1-copy",
        },
      ];

      const result = generateNodesCopy(
        {
          srcId: "1",
          targetParentFolder: "2",
          targetName: "New Name",
        },
        (node) => generateId(node.id),
        nodes,
      );

      expect(result.length).toBe(3);
      expect(result).toEqual(expectedResult);
    });

    it("should throw an error if the src node is not found", () => {
      expect(() =>
        generateNodesCopy(
          { srcId: "invalid" },
          (node) => generateId(node.id),
          nodes,
        ),
      ).toThrowError(`Node with id invalid not found`);
    });
  });
});

describe("getNextCopyNumber", () => {
  it("should return 1 if no files match", () => {
    const files = ["unrelated file.txt", "another file.pdf"];
    const baseFilename = "testfile";
    expect(getNextCopyNumber(files, baseFilename)).toBe(1);
  });

  it('should correctly handle the base case with " (copy)" suffix', () => {
    const files = ["testfile (copy)"];
    const baseFilename = "testfile";
    expect(getNextCopyNumber(files, baseFilename)).toBe(2);
  });

  it("should extract and increment the highest copy number", () => {
    const files = ["testfile (copy)", "testfile (copy) 3", "testfile (copy) 2"];
    const baseFilename = "testfile";
    expect(getNextCopyNumber(files, baseFilename)).toBe(4);
  });

  it("should handle cases with padded zeroes in numbers", () => {
    const files = [
      "testfile (copy) 001",
      "testfile (copy) 002",
      "testfile (copy)",
    ];
    const baseFilename = "testfile";
    expect(getNextCopyNumber(files, baseFilename)).toBe(3);
  });

  it("should return 1 for unrelated files", () => {
    const files = ["someotherfile (copy) 1", "someotherfile (copy) 2"];
    const baseFilename = "testfile";
    expect(getNextCopyNumber(files, baseFilename)).toBe(1);
  });

  it("handles files with special characters needing escape in regex", () => {
    const files = ["test.file (copy)", "test.file (copy) 1"];
    const baseFilename = "test.file";
    expect(getNextCopyNumber(files, baseFilename)).toBe(2);
  });
});

describe("handleTargetNameCollisions", () => {
  it("returns original name if no collision", () => {
    const nodes = [{ name: "file1.txt", parentFolder: "folder", kind: "file" }];
    const params = {
      nodes: nodes,
      targetParentFolder: "folder",
      srcName: "newfile.txt",
      srcKind: "file" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("newfile.txt");
  });

  it("appends copy number if collision occurs", () => {
    const nodes = [
      { name: "newfile.txt", parentFolder: "folder", kind: "file" },
    ];
    const params = {
      nodes: nodes,
      targetParentFolder: "folder",
      srcName: "newfile.txt",
      srcKind: "file" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("newfile.txt (copy) 1");
  });

  it("handles null targetParentFolder correctly", () => {
    const nodes = [{ name: "newfile.txt", parentFolder: null, kind: "file" }];
    const params = {
      nodes: nodes,
      targetParentFolder: "",
      srcName: "newfile.txt",
      srcKind: "file" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("newfile.txt (copy) 1");
  });

  it("does not collide when sibling has different kind (file vs folder)", () => {
    const nodes = [{ name: "Reports", parentFolder: "folder", kind: "folder" }];
    const params = {
      nodes: nodes,
      targetParentFolder: "folder",
      srcName: "Reports",
      srcKind: "file" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("Reports");
  });

  it("does not collide when sibling has different kind (folder vs file)", () => {
    const nodes = [{ name: "Reports", parentFolder: "folder", kind: "file" }];
    const params = {
      nodes: nodes,
      targetParentFolder: "folder",
      srcName: "Reports",
      srcKind: "folder" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("Reports");
  });

  it("only counts same-kind siblings when computing copy number", () => {
    const nodes = [
      { name: "Reports", parentFolder: "folder", kind: "file" },
      { name: "Reports", parentFolder: "folder", kind: "folder" },
      { name: "Reports (copy) 1", parentFolder: "folder", kind: "folder" },
    ];
    const params = {
      nodes: nodes,
      targetParentFolder: "folder",
      srcName: "Reports",
      srcKind: "folder" as const,
    };
    // @ts-expect-error mock
    expect(handleTargetNameCollisions(params)).toBe("Reports (copy) 2");
  });
});

describe("node list helpers", () => {
  const unsorted: Node[] = [
    { id: "z", name: "Z", parentFolder: null, kind: "folder" },
    { id: "a", name: "A", parentFolder: null, kind: "folder" },
  ];

  it("sortNodesById returns a frozen copy and leaves the caller's array alone", () => {
    const own = [...unsorted];

    const sorted = sortNodesById(own);

    expect(sorted.map((node) => node.id)).toEqual(["a", "z"]);
    expect(Object.isFrozen(sorted)).toBe(true);
    expect(own.map((node) => node.id)).toEqual(["z", "a"]);
    expect(Object.isFrozen(own)).toBe(false);
  });

  it("insertNodeSorted returns a frozen list and leaves the caller's array alone", () => {
    const own = [...unsorted];

    const inserted = insertNodeSorted(own, {
      id: "m",
      name: "M",
      parentFolder: null,
      kind: "folder",
    });

    expect(inserted.map((node) => node.id)).toEqual(["a", "m", "z"]);
    expect(Object.isFrozen(inserted)).toBe(true);
    expect(own).toHaveLength(2);
    expect(Object.isFrozen(own)).toBe(false);
  });

  it("assignNodes installs the list it is handed", () => {
    const state = { nodes: [] as Node[] };
    const sorted = sortNodesById(unsorted);

    assignNodes(state, sorted);

    expect(state.nodes).toBe(sorted);
  });
});
