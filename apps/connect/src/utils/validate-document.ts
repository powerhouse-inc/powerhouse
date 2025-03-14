import {
    type DocumentModelDocument,
    type PHDocument,
    validateInitialState,
    validateModules,
    validateStateSchemaName,
    type ValidationError,
} from 'document-model';
export const validateDocument = (document: PHDocument) => {
    const errors: ValidationError[] = [];

    if (document.documentType !== 'powerhouse/document-model') {
        return errors;
    }

    const doc = document as DocumentModelDocument;
    const specs = doc.state.global.specifications[0];

    // validate initial state errors
    const initialStateErrors = Object.keys(specs.state).reduce<
        ValidationError[]
    >((acc, scopeKey) => {
        const scope = scopeKey as keyof typeof specs.state;

        return [
            ...acc,
            ...validateInitialState(
                specs.state[scope].initialValue,
                scope !== 'global',
            ).map(err => ({
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
            ...validateStateSchemaName(
                specs.state[scope].schema,
                doc.name || doc.state.global?.name || '',
                !isGlobalScope ? scope : '',
                !isGlobalScope,
            ).map(err => ({
                ...err,
                message: `${err.message}. Scope: ${scope}`,
                details: { ...err.details, scope },
            })),
        ];
    }, []);

    // modules validation
    const modulesErrors = validateModules(specs.modules);

    return [...initialStateErrors, ...schemaStateErrors, ...modulesErrors];
};
