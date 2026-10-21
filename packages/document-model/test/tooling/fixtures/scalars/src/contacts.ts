import { defineDocumentModel, ph } from "document-model";
import { PhoneNumber } from "./phone-number.js";

export const contacts = defineDocumentModel({
  id: "fixture/contacts",
  name: "Contacts",
  description: "A model referencing a package scalar.",
  extension: "contacts",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    global: {
      schema: ph.object("ContactsState", { fields: { phone: PhoneNumber() } }),
      initialValue: { phone: null },
    },
    local: { schema: null, initialValue: {} },
  },
}).finalize({ modules: [] });
