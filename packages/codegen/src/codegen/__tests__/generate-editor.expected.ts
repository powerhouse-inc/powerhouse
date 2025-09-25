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

export const EXPECTED_EDITOR_CONTENT = `import type { EditorProps } from 'document-model';
import { type DocumentModelDocument, actions } from "document-model";
import { Button } from '@powerhousedao/design-system';

export type EditorDocument = DocumentModelDocument;
export type IProps = EditorProps<EditorDocument>;

export default function Editor(props: IProps) {
    return (
        <div>
            <div className="html-defaults-container">
                <h1>This h1 will be styled</h1>
                <p>This paragraph will also be styled.</p>
                <button>Styled Button</button>
            </div>
            <div>
                <h1>This h1 outside the container will NOT be styled by html-defaults.css</h1>
            </div>
        </div>
    );
};`;

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
import { Button } from '@powerhousedao/design-system';

export type EditorDocument = PHDocument;
export type IProps = EditorProps<EditorDocument>;

export default function Editor(props: IProps) {
    return (
        <div>
            <div className="html-defaults-container">
                <h1>This h1 will be styled</h1>
                <p>This paragraph will also be styled.</p>
                <button>Styled Button</button>
            </div>
            <div>
                <h1>This h1 outside the container will NOT be styled by html-defaults.css</h1>
            </div>
        </div>
    );
};`;

export const EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES = `/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

export { module as GenericDocumentEditor } from './generic-document-editor/index.js';`;
