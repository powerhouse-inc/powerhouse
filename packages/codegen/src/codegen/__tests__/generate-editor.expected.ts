export const EXPECTED_INDEX_CONTENT = `import type { EditorModule } from 'document-model';
import type { EditorDocument } from "./editor.js";
import Editor from './editor.js';

export const module: EditorModule<EditorDocument> = {
    Component: Editor,
    documentTypes: ["powerhouse/document-model", ],
    config: {
        id: 'test-document-model-editor',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};

export default module;`;

const EXPECTED_EDITOR_METHOD = `export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  function handleSetName(values: { documentName: string }) {
    dispatch(baseActions.setName(values.documentName));
  }

  return (
    <div className="ph-default-styles text-center">
      <div className="mx-auto inline-flex flex-col gap-10 py-10 text-start">
        <div>
          <h3 className="mb-2">Document Information</h3>
          <div className="inline-flex items-center gap-6">
            <div className="rounded border border-zinc-200 bg-slate-50 p-4">
              <div>
                <b>Id:</b> {document.header.id}
              </div>
              <div>
                <b>Name:</b> {document.header.name}
              </div>
              <div>
                <b>Created:</b>{" "}
                {new Date(document.header.createdAtUtcIso).toLocaleString()}
              </div>
              <div>
                <b>Last Modified:</b>{" "}
                {new Date(
                  document.header.lastModifiedAtUtcIso,
                ).toLocaleString()}
              </div>
              <div>
                <b>Type:</b> {document.header.documentType}
              </div>
            </div>
            <Form
              onSubmit={handleSetName}
              defaultValues={{ documentName: document.header.name }}
              className="flex max-w-sm items-end gap-2"
            >
              <FormGroup>
                <StringField
                  name="documentName"
                  label="Edit Document Name:"
                  className="mb-1"
                />
                <Button type="submit">Submit</Button>
              </FormGroup>
            </Form>
          </div>
        </div>
        <div>
          <h3 className="mb-2">Document state</h3>
          <pre className="overflow-auto rounded-lg border border-zinc-200 bg-slate-50 p-4 font-mono text-sm">
            {JSON.stringify(document.state, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}`;

export const EXPECTED_EDITOR_CONTENT = `import type { EditorProps } from 'document-model';
import { actions as baseActions } from "document-model";
import { type DocumentModelDocument, actions } from "document-model";
import {
  Button,
  Form,
  FormGroup,
  StringField,
} from "@powerhousedao/document-engineering";

export type EditorDocument = DocumentModelDocument;
export type IProps = EditorProps<EditorDocument>;

${EXPECTED_EDITOR_METHOD}`;

export const EXPECTED_MAIN_INDEX_CONTENT = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as DocumentModelEditor } from './document-model-editor/index.js';`;

export const EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES = `import type { EditorModule } from 'document-model';
import type { EditorDocument } from "./editor.js";
import Editor from './editor.js';

export const module: EditorModule<EditorDocument> = {
    Component: Editor,
    documentTypes: ['*'],
    config: {
        id: 'test-generic-document-editor',
        disableExternalControls: true,
        documentToolbarEnabled: true,
        showSwitchboardLink: true,
    },
};

export default module;`;

export const EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES = `import type { EditorProps, PHDocument } from 'document-model';
import { actions as baseActions } from "document-model";
import {
  Button,
  Form,
  FormGroup,
  StringField,
} from "@powerhousedao/document-engineering";

export type EditorDocument = PHDocument;
export type IProps = EditorProps<EditorDocument>;

${EXPECTED_EDITOR_METHOD}`;

export const EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as GenericDocumentEditor } from './generic-document-editor/index.js';`;
