# What is a document model?

:::tip
This chapter on **Document Model Creation** will help you with an in depth practicial understanding while building an **advanced to-do list** document model. 
Although not required, if you have completed the 'Get Started' tutorial you will revisit familiar topics and can update your existing document model.
:::

:::info **Definition: What is a Document Model?**
A Document Model is a programmable document structure that defines how data is stored, changed, and interpreted in a decentralized system. It acts like a living blueprint—capturing state, tracking changes, and enabling interaction through defined operations.

For instance, an invoice document model might define fields like *issuer*, *lineItems*, and *status*, with operations such as *AddLineItem* and *MarkAsPaid*.
:::

A Document Model can be understood as: 
- A structured software framework that represents and **manages business logic** within a digital environment. 
- A sophisticated template that **encapsulates the essential aspects of a digital process or a set of data**. 
- A blueprints that define how data is **captured, manipulated, and visualised** within a system. 
- A **standardized way to store, modify, and query data** in scalable, decentralized applications.

### **How does a document model function?**

#### **Structure and composition**

Each document model consists of three key components:

1. **State Schema** – Defines the structure of the document.
2. **Document Operations** – Defines how the document can be modified.
3. **Event History** – Maintains an append-only log of changes.

Document models leverage **event sourcing, CQRS (Command Query Responsibility Segregation), and an append-only architecture** to ensure immutability, auditability, and scalability. 

---

## **1. Structure of a document model**

A document model consists of the following key components:

### **1.1 State schema**

The **state schema** defines the structure of the document, including its fields and data types. It serves as a blueprint for how data is stored and validated.

Example of a **GraphQL-like state schema** for an invoice document:

```graphql
type InvoiceState {
  id: OID!                # Unique identifier for the invoice
  issuer: OID!            # Reference to the issuing entity
  recipient: OID!         # Reference to the recipient entity
  status: String          # (value: "DRAFT") # Invoice status
  dueDate: DateTime       # Payment due date
  lineItems: [LineItem!]! # List of line items
  totalAmount: Currency   # Computed field for total invoice value
}

type LineItem {
  id: OID!
  description: String
  quantity: Int 
  unitPrice: Currency
}
```

### **State schema features:**

- Uses **GraphQL-like definitions** for a **clear, structured schema**.
- Supports **custom scalar types** like `OID`, `Currency`, and `DateTime`. Or other Web3 specific scalars
- Defines **relationships** using object references (`OID!`).

The state schema acts as a **template** for document instances. Every new invoice created will follow this structure.

---

### **1.2 Document operations**

Document models are **append-only**, meaning changes are not made directly to the document state. Instead, **document operations** define valid state transitions.

Example operations for modifying an invoice:

```graphql
input AddLineItemInput {
  invoiceId: OID!
  description: String
  quantity: Int 
  unitPrice: Currency
}

input UpdateRecipientInput {
  invoiceId: OID!
  newRecipient: OID!
}

input MarkAsPaidInput {
  invoiceId: OID!
}
```

Each operation **modifies the document state** without altering past data.    
Instead, a new event is appended to the document history.

---

### **1.3 Event history (append-only log)**

Every operation applied to a document is **stored as an event** in an append-only log.

#### **Example event log for an invoice document:**

```json
[
  { "timestamp": 1700000001, "operation": "CREATE_INVOICE", "data": { "id": "inv-001", "issuer": "company-123", "recipient": "client-456" } },
  { "timestamp": 1700000100, "operation": "ADD_LINE_ITEM", "data": { "description": "Software Development", "quantity": 10, "unitPrice": 100 } },
  { "timestamp": 1700000200, "operation": "MARK_AS_PAID", "data": {} 
```

### **Event history benefits:**

- Provides a **transparent audit trail** of changes.
- Enables **time travel debugging** by reconstructing past states.
- Supports **event sourcing**, allowing developers to **replay events** to restore state.

---

## **2. How document models work technically**

Document models in Powerhouse rely on **event-driven architecture, event sourcing, and CQRS principles**. Here's a step-by-step breakdown:

### **2.1 Document creation**

1. A user (or system) **submits an operation** to create a new document.
2. The document model **validates** the input data against the state schema.
3. The system **appends the operation** as an event in the document history.
4. The **initial state is computed** by applying the recorded events.

**Example:**

```json
{
  "operation": "CREATE_INVOICE",
  "data": { "id": "inv-001", "issuer": "company-123", "recipient": "client-456" }
}
```

---

### **2.2 Document modification**

1. A user submits an **operation** (e.g., `ADD_LINE_ITEM`).
2. The **event is appended** to the document history.
3. The **state transition logic updates the computed state**.
4. The UI re-renders the updated document.

**Example:**
Adding a line item:

```json
{
  "operation": "ADD_LINE_ITEM",
  "data": { "description": "Software Development", "quantity": 10, "unitPrice": 100 }
}
```

Since changes are **not applied directly**, this model is **highly scalable and auditable**.

---

### **2.3 Querying document models**

Powerhouse uses **GraphQL queries** to fetch document states efficiently. Because documents store structured data, developers can instantly query:

```graphql
query {
  invoice(id: "inv-001") {
    issuer
    recipient
    status
    lineItems {
      description
      quantity
      unitPrice
    }
  }
}
```

This removes the need for **complex database joins** and allows for **fast, structured access to data**.

---

### **What do document models unlock?**

Document Models offer a range of features that can be leveraged to create sophisticated, automated, and data-driven solutions:

- **Automation**: Automate workflows using consistent, structured document logic.
- **Auditability**: Maintain a full history of changes for compliance and transparency.
- **API Integration**: Seamlessly connect with Switchboard or external APIs for data exchange.
- **Data Analysis**: Enable real-time and historical insights through structured read models.
- **Version Control**: Track and compare document states over time, similar to Git.
- **Collaboration**: Empower decentralized teams to build, modify, and share documents asynchronously.
- **Extensibility**: Add new fields, operations, and integrations over time without rewriting logic.

Document Models are a powerful primitive within the Powerhouse vision, offering a flexible, structured, and efficient way to manage business logic and data. 

### Up next: How to build a document model

In the next chapters, we'll teach you how to build a To-do List document model while explaining all of the theory that is involved.