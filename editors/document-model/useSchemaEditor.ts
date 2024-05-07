import type {
    BaseAction,
    State,
    Operation,
    OperationScope,
} from 'document-model/document';
import type {
    DocumentModelState,
    DocumentModelLocalState,
    DocumentSpecification,
    DocumentModelAction,
} from 'document-model/document-model';
import { useEffect, useState } from 'react';
import z from 'zod';
import { isJSONEqual } from '../common/json-editor';

type SchemaState = {
    documentName: string;
    schema: string;
    validator: () => z.AnyZodObject;
};

interface UseSchemaEditorProps {
    scope: OperationScope;
    state: State<DocumentModelState, DocumentModelLocalState>;
    setInitialState: (initialValue: string, scope: OperationScope) => void;
    latestOperation?: Operation<DocumentModelAction | BaseAction> | null;
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
    const { state, scope, setInitialState, latestOperation } = props;

    const stateScope = state.global;

    const specification = stateScope.specifications.length
        ? stateScope.specifications[stateScope.specifications.length - 1]
        : undefined;

    const specScope = specification?.state[scope];

    const [initialValue, setInitialValue] = useState<JSON>(
        JSON.parse(specScope?.initialValue || '{}') as JSON,
    );

    useEffect(() => {
        const currentValue = specScope?.initialValue || '{}';

        if (
            !isJSONEqual(initialValue, currentValue) &&
            latestOperation?.type !== 'SET_INITIAL_STATE'
        ) {
            setInitialState(JSON.stringify(initialValue), scope);
        }
    }, [initialValue, specScope?.initialValue]);

    useEffect(() => {
        const specValue = specScope?.initialValue || '{}';
        if (!isJSONEqual(initialValue, specValue)) {
            setInitialValue(JSON.parse(specValue) as JSON);
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
