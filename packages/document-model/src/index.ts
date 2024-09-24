import * as Document from './document';
import * as DocumentModel from './document-model';

/**
 * This module exports all the public types, functions, and objects
 * from the document module. It provides an easy-to-use interface
 * for managing documents, and can be used in any Redux-based
 * application. This module exports:
 * - All action creators for the base document actions.
 * - The Document object, which is used to for creating and
 * manipulating documents in an object-oriented way.
 * - The baseReducer function, which is a reducer for managing
 * documents
 * - Various utility functions to be used by Document Models.
 */
export { Document };
export { DocumentModel };

export const DocumentModels = {
    'powerhouse/document': Document,
    'powerhouse/document-model': DocumentModel,
};

export default { Document, DocumentModel };
