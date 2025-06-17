---
id: Domain Modeling
title: Domain Modeling
description: This guide will introduce you to the principles of domain modeling and provide a step-by-step process for creating your first GraphQL state schema for a document model.
slug: /domain-modeling
---

# Introduction to Domain Modeling with Powerhouse

This guide will introduce you to the principles of domain modeling and provide a step-by-step process for creating your first GraphQL state schema for a document model.

## What is Domain Modeling?

Domain modeling in Powerhouse revolves around defining the structure and behavior of business data using **document models**. Each document model specifies:
1. **State Schema**: The data structure.
2. **Operations**: Valid transformations of the state.

Document models are at the core of Powerhouse's event-sourcing architecture, enabling robust and transparent workflows for specific **"business domain's**. Which can range from finances, people-ops or development, but can get as specific as 'invoicing', 'reporting' or 'quality-assurance-checklist'. 

## The analysis and design process

The process for business analysts is a user-centered and iterative approach to problem-solving within a specific business domain. It involves collaboration with expert stakeholders to understand their needs, define problem statements, and develop actionable solutions. The process might include steps such as:

- Interviewing users & business domain experts 
- Documenting user journeys to come to a problem statements
- Ideation & solution exploration
- Defining new use case scenario's
- Protyping and wireframing for user validation
- Implement the document model schema definition.

The team at Powerhouse is currently welcoming new business partners to support them in their analysis and design needs via our [discord server](https://discord.com/invite/h7GKvqDyDP)

For our introduction to domain modeling we will instead of an intense analysis and design process stick to a domain that's quite familiar to most of us: 'Invoicing'. 

---

## Steps to Create Your First GraphQL Document Model Schema Definition

First we'll guide you through the necessary steps of reaching your end goal. At the end we'll introduce our custom tooling, "the document-model-editor" which you can use inside Connect to define your document model schema definition. 

### Step 1: Understand the Basics of a Document Model
A document model consists of:
- **Document State Schema**: Defines the shape of the data.
- **Document Operations**: Specify how the state can change.

For example, an `Invoice` document might include:
- **State Schema**: Recipient, line items, status.
- **Operations**: Add line item, update recipient.

### Step 2: Define the GraphQL State Schema
Use GraphQL to model the document state. All fields should:
1. Be **optional** to allow creating an empty document.
2. Have **defaults** where required using custom directives.

#### Example
```graphql
type InvoiceState {
  id: OID!
  status: String @default(value: "DRAFT")
  recipient: String
  dueDate: DateTime
  lineItems: [LineItem!]!
}

type LineItem {
  id: OID!
  description: String
  quantity: Int @default(value: 1)
  unitPrice: Currency
}
```

### Step 3: Define Document Operations
Operations represent user actions as state transitions. Define these with GraphQL input types.

#### Example
```graphql
input AddLineItemInput {
  invoiceId: OID!
  description: String
  quantity: Int @default(value: 1)
  unitPrice: Currency
}
```

### Step 4: Implement Reducer Functions
Each operation requires a reducer function to handle state transitions. Start by scaffolding the reducers, then implement specific business logic.

#### Example
```typescript
function addLineItem(state, { input }) {
  const { description, quantity, unitPrice } = input;
  const lineItem = { id: generateOID(), description, quantity, unitPrice };
  return {
    ...state,
    lineItems: [...state.lineItems, lineItem],
  };
}
```

### Step 6: Test Your Document Model
Validate the operations by simulating state transitions.
Use the Powerhouse Reactor for local-first development, enabling offline editing and testing. Ensure the document history maintains an immutable audit trail of all operations.