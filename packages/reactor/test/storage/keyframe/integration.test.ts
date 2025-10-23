import type { PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import { createTestOperationStore } from "../../factories.js";

describe("KyselyKeyframeStore", () => {
  let keyframeStore: KyselyKeyframeStore;
  let db: any;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    keyframeStore = setup.keyframeStore;
    db = setup.db;
  });

  afterEach(async () => {
    if (db) {
      await db.destroy();
    }
  });

  function createMockDocument(): PHDocument {
    return documentModelDocumentModelModule.utils.createDocument();
  }

  describe("putKeyframe", () => {
    it("should store a keyframe", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );

      expect(result).toBeDefined();
      expect(result?.revision).toBe(10);
      expect(result?.document).toBeDefined();
    });

    it("should update existing keyframe on conflict", async () => {
      const doc1 = createMockDocument();
      const doc2 = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc1);

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc2);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );

      expect(result).toBeDefined();
      expect(result?.revision).toBe(10);
    });

    it("should store multiple keyframes for same document", async () => {
      const doc10 = createMockDocument();
      const doc20 = createMockDocument();
      const doc30 = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc10);
      await keyframeStore.putKeyframe("doc1", "global", "main", 20, doc20);
      await keyframeStore.putKeyframe("doc1", "global", "main", 30, doc30);

      const result10 = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      const result20 = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        20,
      );
      const result30 = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        30,
      );

      expect(result10?.revision).toBe(10);
      expect(result20?.revision).toBe(20);
      expect(result30?.revision).toBe(30);
    });

    it("should store keyframes for different scopes separately", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "local", "main", 10, doc);

      const globalResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      const localResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "local",
        "main",
        10,
      );

      expect(globalResult).toBeDefined();
      expect(localResult).toBeDefined();
    });

    it("should store keyframes for different branches separately", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "global", "feature", 10, doc);

      const mainResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      const featureResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "feature",
        10,
      );

      expect(mainResult).toBeDefined();
      expect(featureResult).toBeDefined();
    });

    it("should handle abort signal", async () => {
      const doc = createMockDocument();
      const controller = new AbortController();
      controller.abort();

      await expect(
        keyframeStore.putKeyframe(
          "doc1",
          "global",
          "main",
          10,
          doc,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("findNearestKeyframe", () => {
    it("should find exact revision match", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );

      expect(result).toBeDefined();
      expect(result?.revision).toBe(10);
    });

    it("should find nearest keyframe when exact match does not exist", async () => {
      const doc10 = createMockDocument();
      const doc20 = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc10);
      await keyframeStore.putKeyframe("doc1", "global", "main", 20, doc20);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        25,
      );

      expect(result).toBeDefined();
      expect(result?.revision).toBe(20);
    });

    it("should find nearest keyframe less than or equal to target", async () => {
      const doc10 = createMockDocument();
      const doc20 = createMockDocument();
      const doc30 = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc10);
      await keyframeStore.putKeyframe("doc1", "global", "main", 20, doc20);
      await keyframeStore.putKeyframe("doc1", "global", "main", 30, doc30);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        22,
      );

      expect(result).toBeDefined();
      expect(result?.revision).toBe(20);
    });

    it("should return undefined when no keyframe exists", async () => {
      const result = await keyframeStore.findNearestKeyframe(
        "non-existent",
        "global",
        "main",
        10,
      );

      expect(result).toBeUndefined();
    });

    it("should return undefined when target revision is before all keyframes", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        5,
      );

      expect(result).toBeUndefined();
    });

    it("should return correct keyframe for different scopes", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "local", "main", 20, doc);

      const globalResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        15,
      );
      const localResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "local",
        "main",
        25,
      );

      expect(globalResult?.revision).toBe(10);
      expect(localResult?.revision).toBe(20);
    });

    it("should return correct keyframe for different branches", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "global", "feature", 20, doc);

      const mainResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        15,
      );
      const featureResult = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "feature",
        25,
      );

      expect(mainResult?.revision).toBe(10);
      expect(featureResult?.revision).toBe(20);
    });

    it("should properly deserialize document from JSON", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );

      expect(result?.document).toBeDefined();
      expect(result?.document.state).toBeDefined();
      expect(result?.document.header).toBeDefined();
      expect(result?.document.operations).toBeDefined();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        keyframeStore.findNearestKeyframe(
          "doc1",
          "global",
          "main",
          10,
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("deleteKeyframes", () => {
    it("should delete keyframes for specific stream", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "global", "main", 20, doc);

      const deleted = await keyframeStore.deleteKeyframes(
        "doc1",
        "global",
        "main",
      );

      expect(deleted).toBeGreaterThanOrEqual(0);

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      expect(result).toBeUndefined();
    });

    it("should delete keyframes for all branches in a scope", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "global", "feature", 10, doc);

      const deleted = await keyframeStore.deleteKeyframes("doc1", "global");

      expect(deleted).toBeGreaterThanOrEqual(0);

      const resultMain = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      const resultFeature = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "feature",
        10,
      );

      expect(resultMain).toBeUndefined();
      expect(resultFeature).toBeUndefined();
    });

    it("should delete all keyframes for a document", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "local", "main", 10, doc);
      await keyframeStore.putKeyframe("doc1", "global", "feature", 10, doc);

      const deleted = await keyframeStore.deleteKeyframes("doc1");

      expect(deleted).toBeGreaterThanOrEqual(0);

      const resultGlobalMain = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      const resultLocalMain = await keyframeStore.findNearestKeyframe(
        "doc1",
        "local",
        "main",
        10,
      );
      const resultGlobalFeature = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "feature",
        10,
      );

      expect(resultGlobalMain).toBeUndefined();
      expect(resultLocalMain).toBeUndefined();
      expect(resultGlobalFeature).toBeUndefined();
    });

    it("should not affect keyframes for other documents", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);
      await keyframeStore.putKeyframe("doc2", "global", "main", 10, doc);

      await keyframeStore.deleteKeyframes("doc1");

      const result = await keyframeStore.findNearestKeyframe(
        "doc2",
        "global",
        "main",
        10,
      );

      expect(result).toBeDefined();
    });

    it("should return 0 when no keyframes to delete", async () => {
      const deleted = await keyframeStore.deleteKeyframes("non-existent");

      expect(deleted).toBe(0);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        keyframeStore.deleteKeyframes(
          "doc1",
          "global",
          "main",
          controller.signal,
        ),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("integration scenarios", () => {
    it("should handle full lifecycle: put, find, delete", async () => {
      const doc = createMockDocument();

      await keyframeStore.putKeyframe("doc1", "global", "main", 10, doc);

      let result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      expect(result).toBeDefined();

      await keyframeStore.deleteKeyframes("doc1", "global", "main");

      result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        10,
      );
      expect(result).toBeUndefined();
    });

    it("should efficiently find keyframe among many revisions", async () => {
      const doc = createMockDocument();

      for (let i = 10; i <= 100; i += 10) {
        await keyframeStore.putKeyframe("doc1", "global", "main", i, doc);
      }

      const result = await keyframeStore.findNearestKeyframe(
        "doc1",
        "global",
        "main",
        55,
      );

      expect(result?.revision).toBe(50);
    });
  });
});
