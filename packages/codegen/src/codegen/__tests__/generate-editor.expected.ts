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

  function handleSetName(values: { name: string }) {
    if (values.name) {
      dispatch(baseActions.setName(values.name));
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
              resetOnSuccessfulSubmit
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

export const EXPECTED_EDITOR_CONTENT = `import type { EditorProps } from 'document-model';
import { actions as baseActions } from "document-model";
import { type DocumentModelDocument, actions } from "document-model";
import {
  Button,
  Form,
  FormLabel,
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
  FormLabel,
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
