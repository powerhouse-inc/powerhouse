# Utilities and Tips

## What will be produced for you on your next document model: 

To help you along your way in document model generation we've set you up with a couple of tools that help you write your reducers. Alongside we'll offer you a series of tips that make your life a bit easier while defining document models.

### 1. Introducing Zod

The reducer's input, output, and possibly internal state are defined and enforced using the Zod library. Zod is a TypeScript-first schema declaration and validation library that allows developers to create schemas that describe the shape and constraints of data. By using Zod to strongly type a reducer, you leverage TypeScript's static type checking along with Zod's runtime validation to ensure that the data flowing through the reducer conforms to expected types and structures at both compile-time and runtime.

### 2. Introducing Immer

Immer is a library designed to simplify the process of working with immutable state in JavaScript applications, particularly in contexts like Redux reducers, where immutability is a key principle. Immer allows you to write code that appears to mutate state directly while actually producing new immutable states behind the scenes. This approach significantly simplifies the reducer logic, especially when dealing with complex state shapes or deep updates. 

### 3. Generate Mock Data

The GenerateMock function is designed to simplify the creation of mock data for testing purposes. By taking a Zod schema as its input, it leverages the capabilities of Faker.js to automatically generate fake, yet plausible, values for each element defined within the schema. This allows developers to efficiently produce mock data corresponding to the structure and constraints specified in their Zod schemas, facilitating thorough testing and validation of application functionality without the need for manually crafting mock data sets for each schema.

### 4. Making use of utility Functions

Embedding detailed business logic directly within reducers can lead to bulky, hard-to-test code. To mitigate this, we recommend abstracting business logic into discrete utility functions. Reducers become straightforward maps between action types and state transformations, with the heavy lifting offloaded to utility functions. This offers several advantages to your document model. 

1. Modularity: Utility functions encapsulate specific pieces of business logic, making your codebase more organized and modular. 

2. Granular Testing: By isolating business logic in utility functions, you can write more focused and granular tests. 

3. Reusability: Utility functions can be reused across different parts of your application, including multiple reducers. 

4. Reducer Simplicity: Keeping reducers lean by focusing on state transition mechanisms rather than detailed logic makes them more predictable and easier to maintain. 

### 5. Working with derived fields

Understand that inputs to reducers don't have to directly map to the schema's state fields. This is particularly important for derived fields, which are computed based on other data or transactions within the model.

- **Derived Fields**: Certain fields within a state object, such as for example 'an asset', do not hold values provided directly by user input but are calculated from other data, like a series of transactions. 

- **Reducer Inputs and State Updates**: The input to a reducer function responsible for updating the state of such an asset doesn't need to include these derived fields explicitly. Instead, the reducer needs sufficient information to identify the asset and perform calculations to update these derived fields based on new transactions and the latest state.

- **Example of Updating Derived Fields**: When a new 'transaction' occurs, such as the sale of 'an asset', the relevant reducer function computes the necessary updates to the derived fields (e.g., "purchase price") of the associated asset. This computation is based on the details of the transaction and the existing data of the asset within the state.

Even in scenarios involving intricate relationships between different parts of the state (such as our example above: transactions affecting assets), the reducer treats the state as a single cohesive object. It performs all necessary computations and updates within the context of a single operation, returning a new, updated state object that reflects all changes.

### 6. `getDifferences` function

Even though we're receiving all of the fields in the form, at the moment we're submitting an edit for an item, we first check which fields are actually different with the previous state with the getDifferences function. This allows us to only publish an edit operation action that only contains the changed fields. We don't include all of the fields, which it might to by default, but only the 'differences' in the data. Making it much easier to keep track of operations going forward. 

```javascript
input : {
    id : "0.4019292477011591"
    text : "New task"
}
```

### 8. How reducers & editors go hand in hand.

In developing a document model, it's crucial to distinguish between derived and stored states to maintain efficiency and simplicity. For instance, the state of our checked to-dos in our to-do list application doesn't need to be persistently saved in the document model, as their count can be dynamically derived from the current state. 

Reducers help manage and update states based on actions, while editors provide functionalities such as counting checked to-dos through specific functions. Both derived states, like the count of checked to-dos or unit prices in a portfolio, and the tools to manage them (reducers and editors) reside within the same repository, so it's most effective to develop and update reducers and editors concurrently. Keeping this in mind while developing ensures that only essential data is stored, while derived data is efficiently calculated as needed.

### 9. No need for asynchronous operations

Asynchronous operations should be handled outside of the document model, ensuring that reducers remain pure functions of the state

Document models primary focus is on capturing the data specific to a business domain rather than facilitating user interface interactions. The document model's role is to represent and capture the business logic and rules inherent to the domain model. 
For instance, in the context of a real asset portfolio, the document model is concerned with operations such as adding a new transaction to an asset and how such actions affect the total value of the asset—essentially, the core calculations and data manipulations that reflect business events and their impacts on the domain state.

This focus on the business logic side, rather than on asynchronous operations typically associated with user interface interactions (like fetching data or updating UI elements in response to user actions), means that the document model serves as a portable module. It's designed to be used across different contexts within the applications of powerhouse, prioritising the accurate representation and manipulation of business data (through Fusion or Switchboard) over UI concerns. 

### Additional Tips

- Design state schemas with clear distinctions between directly inputted data and derived/computed fields.

- Implement reducers that can handle complex operations by computing necessary updates based on actions without requiring explicit inputs for derived fields.

- Maintain the purity of reducer functions by ensuring they do not mutate the existing state but instead return new instances of the state with the required updates.

- Validation and Leniency: While some validation is necessary, aim to be as lenient as possible without allowing unrecoverable states. 

- The strict ts-eslint rules set by the core developers at Powerhouse will help you maintain code quality, consistency, and adherence to best practices across the project.