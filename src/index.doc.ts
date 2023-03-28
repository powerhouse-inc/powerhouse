import * as BudgetStatement from './budget-statement/index.doc';
import * as Document from './document';

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
/**
 * The BudgetStatement module manages the state and actions related to budget statements,
 * which are documents that track the financial transactions of an organization over a month.
 * The module provides a set of objects and functions for creating, updating, and deleting budget statements,
 * as well as performing various operations on them, such as adding or updating line items, submitting for review,
 * and approving or rejecting statements and top-up transactions.
 */
/**
 * The BudgetStatement module provides functionality for managing budget statements.
 * @remarks
 * This module exports the following:
 * - All the actions available of the BudgetStatement model, as well as those from the base document.
 * - The reducer which implements the business logic for each action.
 * - BudgetStatementObject: A class representing a budget statement object, to manage a budget statement in an imperative way.
 * - Utility functions to create Budget Statements and load/save to file.
 */
export { BudgetStatement };

export default { BudgetStatement, Document };
