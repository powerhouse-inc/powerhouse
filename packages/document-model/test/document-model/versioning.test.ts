import type { DocumentModelPHState } from "document-model";
import {
  addModule,
  documentModelCreateDocument,
  documentModelReducer,
  releaseNewVersion,
  setStateSchema,
} from "document-model";

describe("Document Model Versioning", () => {
  let doc: ReturnType<typeof documentModelCreateDocument>;

  beforeEach(() => {
    doc = documentModelCreateDocument({
      id: "test/versioned-doc",
      name: "Test Versioned Doc",
      description: "Test description",
      extension: "tvd",
      authorName: "Test",
      authorWebsite: "https://test.com",
    } as Partial<DocumentModelPHState>);
  });

  describe("releaseNewVersion", () => {
    it("should create v2 specification with incremented version", () => {
      const newDoc = documentModelReducer(doc, releaseNewVersion());
      const specs = newDoc.state.global.specifications;

      expect(specs).toHaveLength(2);
      expect(specs[0].version).toBe(1);
      expect(specs[1].version).toBe(2);
    });

    it("should start new version with empty changelog", () => {
      const newDoc = documentModelReducer(doc, releaseNewVersion());
      const v2Spec = newDoc.state.global.specifications[1];

      expect(v2Spec.changeLog).toEqual([]);
    });

    it("should copy state schema from previous version", () => {
      const schema = "type TestState { id: Int! }";
      let newDoc = documentModelReducer(
        doc,
        setStateSchema({ schema, scope: "global" }),
      );

      newDoc = documentModelReducer(newDoc, releaseNewVersion());

      const v1State = newDoc.state.global.specifications[0].state.global;
      const v2State = newDoc.state.global.specifications[1].state.global;

      expect(v1State.schema).toBe(schema);
      expect(v2State.schema).toBe(schema);
    });

    it("should deep copy modules from previous version", () => {
      let newDoc = documentModelReducer(
        doc,
        addModule({
          id: "module-1",
          name: "TestModule",
        }),
      );

      newDoc = documentModelReducer(newDoc, releaseNewVersion());

      const v1Modules = newDoc.state.global.specifications[0].modules;
      const v2Modules = newDoc.state.global.specifications[1].modules;

      expect(v1Modules).toHaveLength(1);
      expect(v2Modules).toHaveLength(1);
      expect(v1Modules[0].name).toBe("TestModule");
      expect(v2Modules[0].name).toBe("TestModule");

      expect(v1Modules[0]).not.toBe(v2Modules[0]);
    });

    it("should not affect previous version when modifying new version", () => {
      let newDoc = documentModelReducer(
        doc,
        addModule({
          id: "module-1",
          name: "OriginalModule",
        }),
      );

      newDoc = documentModelReducer(newDoc, releaseNewVersion());

      newDoc = documentModelReducer(
        newDoc,
        addModule({
          id: "module-2",
          name: "NewModule",
        }),
      );

      const v1Modules = newDoc.state.global.specifications[0].modules;
      const v2Modules = newDoc.state.global.specifications[1].modules;

      expect(v1Modules).toHaveLength(1);
      expect(v2Modules).toHaveLength(2);
    });

    it("should support multiple version releases (v1 -> v2 -> v3)", () => {
      let newDoc = documentModelReducer(doc, releaseNewVersion());
      newDoc = documentModelReducer(newDoc, releaseNewVersion());

      const specs = newDoc.state.global.specifications;

      expect(specs).toHaveLength(3);
      expect(specs[0].version).toBe(1);
      expect(specs[1].version).toBe(2);
      expect(specs[2].version).toBe(3);
    });

    it("should preserve all specifications when releasing multiple versions", () => {
      let newDoc = documentModelReducer(
        doc,
        addModule({ id: "v1-module", name: "V1Module" }),
      );

      newDoc = documentModelReducer(newDoc, releaseNewVersion());
      newDoc = documentModelReducer(
        newDoc,
        addModule({ id: "v2-module", name: "V2Module" }),
      );

      newDoc = documentModelReducer(newDoc, releaseNewVersion());
      newDoc = documentModelReducer(
        newDoc,
        addModule({ id: "v3-module", name: "V3Module" }),
      );

      const specs = newDoc.state.global.specifications;

      expect(specs[0].modules).toHaveLength(1);
      expect(specs[0].modules[0].name).toBe("V1Module");

      expect(specs[1].modules).toHaveLength(2);
      expect(specs[1].modules[0].name).toBe("V1Module");
      expect(specs[1].modules[1].name).toBe("V2Module");

      expect(specs[2].modules).toHaveLength(3);
      expect(specs[2].modules[0].name).toBe("V1Module");
      expect(specs[2].modules[1].name).toBe("V2Module");
      expect(specs[2].modules[2].name).toBe("V3Module");
    });
  });
});
