import { defineDocumentModel, defineScalar, ph } from "document-model";
import { z } from "zod";

/** A second scalar under the name `./phone-number.ts` already uses. */
const PhoneNumber = defineScalar({
  name: "PhoneNumber",
  description: "A phone number in any format.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
});

export const directory = defineDocumentModel({
  id: "fixture/directory",
  name: "Directory",
  description: "A model whose PhoneNumber is not the contacts one.",
  extension: "directory",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    global: {
      schema: ph.object("DirectoryState", { fields: { phone: PhoneNumber() } }),
      initialValue: { phone: null },
    },
    local: { schema: null, initialValue: {} },
  },
}).finalize({ modules: [] });
