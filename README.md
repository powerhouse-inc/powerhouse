# Powerhouse Document Model

This library enables document-based business processes. A documents consists of a JSON
Because these different applications, and potentially others, use the same business logic component, they will be guaranteed to use the exact same rules for modifying the documents, ensuring that the data structure doesn’t get corrupted. And saving a lot of time in the development of the software (less bugs, less explanation needed.)

## Getting started

Install the library:

-   NPM: `npm install @acaldas/temp-document-model-libs`
-   Yarn: `yarn add @acaldas/temp-document-model-libs`

### Functional:

```javascript
import {
    actions,
    reducer,
    utils,
} from '@acaldas/temp-document-model-libs/budget-statement';

let budgetStatement = utils.createBudgetStatement({
    name: 'March report',
    data: { month: '2023/01' },
});

budgetStatement = reducer(
    budgetStatement,
    actions.addAccount([{ address: 'eth:0x00' }])
);
```

### Object oriented:

```javascript
import { BudgetStatementObject } from '@acaldas/temp-document-model-libs/budget-statement';

const budgetStatement = new BudgetStatementObject({
    name: 'march',
    data: { month: '2023/01' },
});
budgetStatement.addAccount([{ address: 'eth:0x00' }]);
```

## Architecture

This implementation is inspired by the [Flux architecture pattern](https://facebookarchive.github.io/flux/). All state changes are performed by a reducer, which is a pure function that enforces state transitions:

```javascript
const newState = reducer(state, action);
```

The business logic is implemented in pure functions, making it easy to test and integrate into different applications. The operations history is kept to allow reverting changes.

An action is a JSON object with the action name and payload:

```JSON
{
    type: "SET_NAME"
    input: {
        name: "March report"
    }
}
```

To make it easier to create actions and avoid bugs, an action creator is provided for each action. This is a function that accepts the action input and returns the JSON structure. For the case above the action creator would be:

```javascript
state = reducer(state, setName('March report'));
```

An Object-oriented version is also provided. A document can be instantiated and interacted in an imperative way:

```javascript
const document = new Document();
document.setName('March report');
```

## Base Document Model

All document models extend the Base Document model, which provides some common features. A document has the following structure:

```JSON
{
    name: "SES 2023-01 expense report", // name of the document
    documentType: "powerhouse/budget-statement", // type of the document model
    revision: 4, // number of operations applied to the document
    created: "2023-02-05 12:15:01", // date of creation of the document
    lastModified: "2023-02-05 12:15:01", // date of the last modification
    data: {} // specific state of the document, to be implemented by document models
}
```

### Base Document Actions

All document reducers are wrapped by the Base Document reducer, which is responsible for updating the document attributes described above and adds support for some base document features.

-   `SET_NAME`: Changes the name of the document

```javascript
setName(name: string);
```

-   `UNDO`: Cancels the last X operations. Defaults to 1.

```javascript
undo(count: number);
```

-   `REDO`: Cancels the last X UNDO operations. Defaults to 1.

```javascript
redo(count: number);
```

-   `PRUNE`: Joins multiple operations into a single `LOAD_STATE` operation. Useful to keep operations history smaller. Operations to prune are selected by index, similar to the [slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice) method in Arrays.

```javascript
prune(start?: number, end?: number);
```
