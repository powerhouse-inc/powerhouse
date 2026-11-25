import { defineDocumentModel, materialize, ph } from "document-model";

// A model whose operation references an attachment. A switchboard serves an
// attachment only through a document whose operations reference it, and
// only a field typed AttachmentRef is such a reference. The cli-runner test
// switchboard loads this directory as a package (`packages.list`).

const note = defineDocumentModel({
  id: "clint-test/attachment-note",
  name: "Attachment note",
  description: "Holds one attachment ref.",
  extension: "note",
  version: 1,
  author: { name: "Powerhouse" },
  scopes: {
    global: {
      schema: ph.object("AttachmentNoteState", {
        fields: { attachment: ph.AttachmentRef() },
      }),
      initialValue: { attachment: null },
    },
  },
});

const files = note.module("files", {
  operations: ({ global }) => ({
    setAttachment: global({
      input: ph.input({
        fields: { attachment: ph.AttachmentRef({ required: true }) },
      }),
      reduce(state, input) {
        state.attachment = input.attachment;
      },
    }),
  }),
});

export const attachmentNote = materialize(note.version({ modules: [files] }));
