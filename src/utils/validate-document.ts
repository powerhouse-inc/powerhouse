import { Document, ValidationError } from 'document-model/document';
import {
    DocumentModel as DocumentModelClass,
    Module,
    utils as documentModelUtils,
} from 'document-model/document-model';

export const validateDocument = (document: Document) => {
    const errors: ValidationError[] = [];

    if (document.documentType !== 'powerhouse/document-model') {
        return errors;
    }

    const doc = document as unknown as DocumentModelClass;
    const specs = doc.state.global.specifications[0];

    // validate initial state errors
    const initialStateErrors = Object.keys(specs.state).reduce<
        ValidationError[]
    >((acc, scopeKey) => {
        const scope = scopeKey as keyof typeof specs.state;

        return [
            ...acc,
            ...documentModelUtils
                .validateInitialState(
                    specs.state[scope].initialValue,
                    scope !== 'global',
                )
                .map(err => ({
                    ...err,
                    message: `${err.message}. Scope: ${scope}`,
                    details: { ...err.details, scope },
                })),
        ];
    }, []);

    // validate schema state errors
    const schemaStateErrors = Object.keys(specs.state).reduce<
        ValidationError[]
    >((acc, scopeKey) => {
        const scope = scopeKey as keyof typeof specs.state;
        const isGlobalScope = scope === 'global';

        return [
            ...acc,
            ...documentModelUtils
                .validateStateSchemaName(
                    specs.state[scope].schema,
                    document.name,
                    !isGlobalScope ? scope : '',
                    !isGlobalScope,
                )
                .map(err => ({
                    ...err,
                    message: `${err.message}. Scope: ${scope}`,
                    details: { ...err.details, scope },
                })),
        ];
    }, []);

    // modules validation
    const modulesErrors = documentModelUtils.validateModules(
        specs.modules as Module[],
    );

    return [...initialStateErrors, ...schemaStateErrors, ...modulesErrors];
};
