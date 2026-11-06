import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { describe, expect, it } from "vitest";
import { AttachmentSchemaCompiler } from "../../index.js";

const REF = `attachment://v1:${"a".repeat(64)}` as const;

function attachmentModel(): DocumentModelModule {
  const model = defineDocumentModel({
    id: "test/attachments",
    name: "Attachments",
    description: "",
    extension: "att",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("AttachmentsState", {
          fields: {
            refs: ph.list(ph.AttachmentRef({ required: true }), {
              required: true,
            }),
          },
        }),
        initialValue: { refs: [] },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const files = model.module("files", {
    operations: ({ global }) => ({
      attachFile: global({
        input: ph.input({
          fields: { ref: ph.AttachmentRef({ required: true }) },
        }),
        reduce(state, input) {
          state.refs.push(input.ref);
        },
      }),
    }),
  });
  return materialize(
    model.version({ modules: [files] }),
  ) as unknown as DocumentModelModule;
}

describe("AttachmentSchemaCompiler on code-first models", () => {
  it("finds the operation of a code-first stored name by its action type", () => {
    const module = attachmentModel();
    const [operation] =
      module.documentModel.global.specifications[0].modules[0].operations;
    const action = (
      module.actions as unknown as {
        attachFile: (input: { ref: string }) => {
          type: string;
          input: unknown;
        };
      }
    ).attachFile({ ref: REF });
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      action.type,
    );
    expect([operation.name, action.type]).toStrictEqual([
      "AttachFile",
      "ATTACH_FILE",
    ]);
    expect(extractor.extract(action as never)).toEqual([REF]);
  });
});
