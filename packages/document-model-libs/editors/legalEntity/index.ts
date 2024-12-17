/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import Editor from "./editor";

export const module = {
  Component: Editor,
  documentTypes: ["Legal-entity"],
  config: {
    id: "legal-entity-editor",
    disableExternalControls: false,
  },
};

export default module;
