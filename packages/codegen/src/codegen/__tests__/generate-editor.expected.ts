export const EXPECTED_INDEX_CONTENT = `import type { EditorModule } from 'document-model';
import { Editor } from './editor.js';

export const module: EditorModule = {
    Component: Editor,
    documentTypes: ["powerhouse/billing-statement", ],
    config: {
        id: 'billing-statement-editor',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};`;

const EXPECTED_EDITOR_METHOD = `function handleSetName(values: { name: string }) {
    if (values.name) {
      dispatch(setName(values.name));
    }
  }

  return (
    <div className="ph-default-styles py-10 text-center">
      <div className="inline-flex flex-col gap-10 text-start">
        
        {/* Edit document name form */}
        <section className="flex justify-between">
          <h1 className="text-start">{document.header.name}</h1>
          <div className="flex flex-col space-y-2">
            <Form
              onSubmit={handleSetName}
              defaultValues={{ name: document.header.name }}
              className="flex flex-col gap-3 pt-2"
            >
              <div className="flex items-end gap-3">
                <div>
                  <FormLabel htmlFor="name">
                    <b className="mb-1">Change document name</b>
                  </FormLabel>
                  <StringField
                    name="name"
                    placeholder="Enter document name"
                    className="mt-1"
                  />
                </div>
                <Button type="submit">Edit</Button>
              </div>
            </Form>
          </div>
        </section>

        {/* Document metadata */}
        <section>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
            <li>
              <b className="mr-1">Id:</b>
              {document.header.id}
            </li>
            <li>
              <b className="mr-1">Created:</b>
              {new Date(document.header.createdAtUtcIso).toLocaleString()}
            </li>
            <li>
              <b className="mr-1">Type:</b>
              {document.header.documentType}
            </li>
            <li>
              <b className="mr-1">Last Modified:</b>
              {new Date(document.header.lastModifiedAtUtcIso).toLocaleString()}
            </li>
          </ul>
        </section>

        {/* Document state */}
        <section className="inline-block">
          <h2 className="mb-4">Document state</h2>
          <textarea
            rows={10}
            readOnly
            value={JSON.stringify(document.state, null, 2)}
            className="font-mono"
          ></textarea>
        </section>
      </div>
    </div>
  );
}`;

export const EXPECTED_EDITOR_CONTENT = (documentsDir: string) => `import {
  Button,
  Form,
  FormLabel,
  StringField,
} from "@powerhousedao/document-engineering";
import { useSelectedBillingStatementDocument } from "../hooks/useBillingStatementDocument.js";
import { setName } from "document-model";
import {
  // general
  editBillingStatement,
  editContributor,
  editStatus,
  // line_items
  addLineItem,
  editLineItem,
  // tags
  editLineItemTag,
} from "${documentsDir}/document-models/billing-statement/gen/creators.js";

export function Editor() {
  const [document, dispatch] = useSelectedBillingStatementDocument();

  ${EXPECTED_EDITOR_METHOD}`;

export const EXPECTED_MAIN_INDEX_CONTENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as BillingStatementEditor } from './billing-statement-editor/index.js';`;

export const EXPECTED_HOOK_CONTENT = (
  documentsDir: string,
) => `import { useDocumentOfType, useSelectedDocumentId } from "@powerhousedao/reactor-browser";
import type { BillingStatementAction, BillingStatementDocument } from "${documentsDir}/document-models/billing-statement/index.js";

export function useBillingStatementDocument(documentId: string | null | undefined) {
  return useDocumentOfType<BillingStatementDocument, BillingStatementAction>(documentId, "powerhouse/billing-statement");
}

export function useSelectedBillingStatementDocument() {
  const selectedDocumentId = useSelectedDocumentId();
  return useBillingStatementDocument(selectedDocumentId);
}`;

export const EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES = `import type { EditorModule } from 'document-model';
import { Editor } from './editor.js';

export const module: EditorModule = {
    Component: Editor,
    documentTypes: ['*'],
    config: {
        id: 'test-generic-document-editor',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};`;

export const EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES = `import {
  Button,
  Form,
  FormLabel,
  StringField,
} from "@powerhousedao/document-engineering";
import { useSelectedDocument } from "@powerhousedao/reactor-browser";
import { setName } from "document-model";

export function Editor() {
  const [document, dispatch] = useSelectedDocument();

  if (!document) {
    return null;
  }

  ${EXPECTED_EDITOR_METHOD}`;

export const EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as GenericDocumentEditor } from './generic-document-editor/index.js';`;
