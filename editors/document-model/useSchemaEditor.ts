import { State } from 'document-model/document';
import {
    DocumentModelState,
    DocumentModelLocalState,
    DocumentSpecification,
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

export interface SchemaResult {
    schemaState?: SchemaState;
    setSchemaState: React.Dispatch<
        React.SetStateAction<SchemaState | undefined>
    >;
    specification?: DocumentSpecification;
    setInitialValue: React.Dispatch<React.SetStateAction<JSON>>;
    initialValue: JSON;
}

export const useSchemaEditor = (props: UseSchemaEditorProps): SchemaResult => {
    const { state, scope, setInitialState } = props;

    const stateScope = state.global;

    const specification = stateScope.specifications?.length
        ? stateScope.specifications[stateScope.specifications?.length - 1]
        : undefined;

    const specScope = specification?.state[scope];

    const [initialValue, setInitialValue] = useState<JSON>(
        JSON.parse(specScope?.initialValue || '{}'),
    );

    useEffect(() => {
        const currentValue = specScope?.initialValue || '{}';

        if (!isJSONEqual(initialValue, currentValue)) {
            setInitialState(JSON.stringify(initialValue), scope);
        }
    }, [initialValue, specScope?.initialValue]);

    useEffect(() => {
        const specValue = specScope?.initialValue || '{}';
        if (!isJSONEqual(initialValue, specValue)) {
            setInitialValue(JSON.parse(specValue));
        }
    }, [specScope?.initialValue]);

    const [schemaState, setSchemaState] = useState<SchemaState>();

    return {
        schemaState,
        setSchemaState,
        specification,
        setInitialValue,
        initialValue,
    };
};
