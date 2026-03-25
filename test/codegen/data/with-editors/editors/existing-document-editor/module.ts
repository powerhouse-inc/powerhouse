
import type { EditorModule } from "document-model";
import { lazy } from "react";

/** Document editor module for the "["powerhouse/test-doc"]" document type */
export const ExistingDocumentEditor: EditorModule = {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ["powerhouse/test-doc"],
    config: {
        id: "existing-document-editor",
        name: "ExistingDocumentEditor",
    },
};
