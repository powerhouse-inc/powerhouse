import { State } from 'document-model/document';
import {
    DocumentModelState,
    DocumentModelLocalState,
} from 'document-model/document-model';
import { useEffect, useState } from 'react';
import z from 'zod';

import { ScopeType } from './editor-schema';
import { isJSONEqual } from '../common/json-editor';

type SchemaState = {
    documentName: string;
    schema: string;
    validator: () => z.AnyZodObject;
};

interface UseSchemaEditorProps {
    scope: ScopeType;
    state: State<DocumentModelState, DocumentModelLocalState>;
    setInitialState: (initialValue: string, scope: ScopeType) => void;
}

export const useSchemaEditor = (props: UseSchemaEditorProps) => {
    const { state, scope, setInitialState } = props;

    const specification = state[scope].specifications?.length
        ? state[scope].specifications[state[scope].specifications?.length - 1]
        : undefined;

    const [initialValue, setInitialValue] = useState<JSON>(
        JSON.parse(specification?.state[scope].initialValue || '{}'),
    );

    useEffect(() => {
        const currentValue = specification?.state[scope].initialValue || '{}';

        if (!isJSONEqual(initialValue, currentValue)) {
            setInitialState(JSON.stringify(initialValue), scope);
        }
    }, [initialValue, specification?.state[scope].initialValue]);

    useEffect(() => {
        const specValue = specification?.state[scope].initialValue || '{}';
        if (!isJSONEqual(initialValue, specValue)) {
            setInitialValue(JSON.parse(specValue));
        }
    }, [specification?.state[scope].initialValue]);

    const [schemaState, setSchemaState] = useState<SchemaState>();

    return {
        schemaState,
        setSchemaState,
        specification,
        setInitialValue,
        initialValue,
    };
};
