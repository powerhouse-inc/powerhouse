import { lazyWithPreload } from 'document-model-libs/utils';

export type { EditorProps } from '@monaco-editor/react';

export default lazyWithPreload(() => import('@monaco-editor/react'));
