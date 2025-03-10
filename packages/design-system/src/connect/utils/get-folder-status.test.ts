import {
  type FileStatus,
  getFolderStatus,
  removeSuccessFiles,
  sortFilesByStatus,
} from "./get-folder-status.js";
import { it } from "vitest";
const filesStatus: FileStatus[] = [
  {
    path: "fol1/doc1",
    status: "SUCCESS",
  },
  {
    path: "fol1/doc2",
    status: "SUCCESS",
  },
  {
    path: "fol1/doc3",
    status: "ERROR",
  },
  {
    path: "fol1/fol2/doc4",
    status: "SYNCING",
  },
  {
    path: "fol1/fol2/doc5",
    status: "SUCCESS",
  },
  {
    path: "fol1/fol2/fol3/doc6",
    status: "SUCCESS",
  },
];

describe("Utils", () => {
  describe("sortFilesByStatus", () => {
    it("should sort files by status", () => {
      const sortedFiles = sortFilesByStatus(filesStatus);
      expect(sortedFiles).toEqual([
        {
          path: "fol1/doc3",
          status: "ERROR",
        },
        {
          path: "fol1/fol2/doc4",
          status: "SYNCING",
        },
        {
          path: "fol1/doc1",
          status: "SUCCESS",
        },
        {
          path: "fol1/doc2",
          status: "SUCCESS",
        },
        {
          path: "fol1/fol2/doc5",
          status: "SUCCESS",
        },
        {
          path: "fol1/fol2/fol3/doc6",
          status: "SUCCESS",
        },
      ]);
    });
  });

  describe("removeSuccessFiles", () => {
    it("should remove success files", () => {
      const filteredFiles = removeSuccessFiles(filesStatus);
      expect(filteredFiles).toEqual([
        {
          path: "fol1/doc3",
          status: "ERROR",
        },
        {
          path: "fol1/fol2/doc4",
          status: "SYNCING",
        },
      ]);
    });
  });

  describe("getFolderStatus", () => {
    const files = sortFilesByStatus(removeSuccessFiles(filesStatus));

    it("should return error status if one of the contained files is in error", () => {
      const result = getFolderStatus("fol1", files);
      expect(result).toBe("ERROR");
    });

    it("should return syncing status if one of the contained files is syncing", () => {
      const result = getFolderStatus("fol1/fol2", files);
      expect(result).toBe("SYNCING");
    });

    it("should return success status if all contained files are in success", () => {
      const result = getFolderStatus("fol1/fol2/fol3", files);
      expect(result).toBe("SUCCESS");
    });

    it("should return success status if folder is empty", () => {
      const result = getFolderStatus("fol1/fol2/fol4", files);
      expect(result).toBe("SUCCESS");
    });
  });
});
