# Powerhouse Document Model

## Getting started

Install the library:

- NPM: `npm install @acaldas/document-model-libs`
- Yarn: `yarn add @acaldas/document-model-libs`

## Documentation

The full documentation for this package is available at: https://acaldas.github.io/document-model-libs/

There are two ways to interact with a document:

### Functional:

```javascript
import {
  actions,
  reducer,
  utils,
} from "@acaldas/document-model-libs/budget-statement";

let budgetStatement = utils.createDocument({
  name: "March report",
  data: { month: "2023/01" },
});

budgetStatement = reducer(
  budgetStatement,
  actions.addAccount([{ address: "eth:0x00" }]),
);
```

### Object oriented:

```javascript
import { BudgetStatement } from "@acaldas/document-model-libs/budget-statement";

const budgetStatement = new BudgetStatement({
  name: "march",
  data: { month: "2023/01" },
});
budgetStatement.addAccount([{ address: "eth:0x00" }]);
```

## Architecture

This implementation is inspired by the [Flux architecture pattern](https://facebookarchive.github.io/flux/). All state changes are performed by a reducer, which is a pure function that enforces state transitions:

```javascript
const newState = reducer(state, action);
```

The business logic is implemented in pure functions, making it easy to test and integrate into different applications. The operations history is kept to allow reverting changes.

An action is a JSON object with the action name and payload:

```javascript
{
  type: "SET_NAME";
  input: {
    name: "March report";
  }
}
```

To make it easier to create actions and avoid bugs, an action creator is provided for each action. This is a function that accepts the action input and returns the JSON structure. For the case above the action creator would be:

```javascript
state = reducer(state, setName("March report"));
```

An Object-oriented version is also provided. A document can be instantiated and interacted in an imperative way:

```javascript
const document = new Document();
document.setName("March report");
```

## Base Document Model

All document models extend the Base Document model, which provides some common features. A document has the following structure:

```javascript
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

Document reducers are wrapped by the Base Document reducer, which is responsible for updating the document attributes described above and adds support for some base document features.

▸ For more information on Document actions, please refer to the [complete documentation](markdown/modules/Document.actions.md).

- `SET_NAME`: Changes the name of the document

```javascript
setName(name: string);
```

- `UNDO`: Cancels the last X operations. Defaults to 1.

```javascript
undo(count: number);
```

- `REDO`: Cancels the last X UNDO operations. Defaults to 1.

```javascript
redo(count: number);
```

- `PRUNE`: Joins multiple operations into a single `LOAD_STATE` operation. Useful to keep operations history smaller. Operations to prune are selected by index, similar to the [slice](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice) method in Arrays.

```javascript
prune(start?: number, end?: number);
```

## Budget Statement Model

A Budget statement follows the following data structure:

```javascript
{
    name: "SES January 2023",
    documentType: "powerhouse/budget-statement",
    revision: 10,
    created: "2023-02-21 10:15:26",
    lastModified: "2023-02-21 13:12:49",
    data: {
        owner: {
            ref: "makerdao/core-unit",
            id: "SES-001",
            title: "Sustainable Ecosystem Scaling"
        },
        month: "2023/01",
        quoteCurrency: "DAI",
        auditReports: [
            {
                timestamp: "2023-02-21 13:12:49",
                report: "attachment://audits/report.pdf",
                status: "Approved" | "ApprovedWithComments" | "NeedsAction" | "Escalated"
            }
        ],
        accounts: [
            {
                address: "eth:0xb5eB779cE300024EDB3dF9b6C007E312584f6F4f",
                name: "Grants Program",
                lineItems: [
                    {
                        category: {
                            ref: "makerdao/budget-category",
                            id: "TravelAndEntertainment",
                            title: "Travel & Entertainment",
                            headcountExpense: true
                        },
                        group: {
                            ref: "makerdao/project",
                            id: "core-unit/SES/2023/005",
                            title: "Core Unit Operational Support"
                        },
                        budgetCap: 10000,
                        payment: 0,
                        actual: 4000,
                        forecast: [
                            {
                                month: "2023/02",
                                value: 30000
                            },
                            {
                                month: "2023/03",
                                value: 40000
                            },
                            {
                                month: "2023/04",
                                value: 30000
                            }
                        ]
                    }
                ]
            }
        ]
    }
}
```

### Budget Statement Actions

▸ For more information on Budget Statement actions, please refer to the [complete documentation](markdown/modules/BudgetStatement.actions.md).
