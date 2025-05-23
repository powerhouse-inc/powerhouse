# Moving Beyond CRUD

Powerhouse uses "single field operations" as granular actions that go beyond traditional CRUD (Create, Read, Update, Delete) operations.   
In a basic CRUD framework, the focus is on making entire objects or records editable as a whole, often leading to oversimplified data management that can't easily handle complex workflows or state transitions.

## What Are Single Field Operations?
These are focused, granular updates to individual fields within a document rather than treating the document as a whole. This approach allows for precise control and tracking of changes. For example:

- Setting a Document Number (simple string input)
- Changing Master Status (an enum dropdown selection)

Each of these operations targets only one field and has a corresponding form that collects and submits the new value.

## Why go beyond CRUD?

### Granular State Tracking:
Powerhouse's system emphasizes understanding how documents transition from one state to another in fine detail. By breaking down actions into specific field-level operations, it allows for tracking the exact sequence of changes, which is crucial for things like auditing, version control, and complex workflows.

### Operational Focus:
The system is designed around the idea of operations themselves—not just the data they manipulate. While traditional CRUD frameworks might treat each field as independently updatable without any logic or process attached, Powerhouse assigns specific operations that can enforce business rules and state transitions.

### Customization & Flexibility:
CRUD frameworks are often too rigid for real-world applications that need more nuanced behaviors. Powerhouse offers both the simplicity of CRUD for standard operations and the ability to go deeper, defining more complex, field-specific operations when needed. This hybrid approach ensures flexibility without sacrificing systematic structure.

### Automation Potential:
Even though creating these granular operations might seem tedious, the goal is to build a system where standard CRUD operations can eventually be auto-generated, leaving developers to focus only on defining the exceptional, non-standard behaviors.

### Improved Permissions and User Intent:
By having specific operations tied to individual fields, it becomes easier to manage permissions (e.g., who can change the master status but not the content) and to capture user intent more precisely, which is valuable in complex collaborative environments.


## Understanding the Code Example

![Alt text for the image](./images/image.png)

| `SetDocNumberForm.tsx` (StringField) | `SetMasterStatusForm.tsx` (EnumField) |
|-------------------------------------|---------------------------------------|
| **Purpose:** To update the document number (a string field).<br /><br />**How it works:**<br />- A form is rendered with a StringField input<br />- The defaultValue comes from the document model (props.defaultValue.docNo)<br />- On submit (or onBlur), the new document number is dispatched via the dispatch function<br />- It uses a generic onSubmit handler that processes the collected input and triggers the document update<br /><br />**Key takeaway:**<br />- This is a simple, single field form that maps a scalar string to a reusable component (StringField)<br />- The form structure is systematic: label, name, placeholder, and onBlur event handler | **Purpose:** To update the master status (an enum field).<br /><br />**How it works:**<br />- A form is rendered with an EnumField dropdown<br />- The dropdown options are enum values like "APPROVED", "DEFERRED", etc.<br />- The default value is pre-filled from props.defaultValue.masterStatus<br />- On change, the form dispatches the updated status<br /><br />**Key takeaway:**<br />- This form uses an EnumField component, showcasing how different scalar types (in this case, enums) map to different input components<br />- Options are provided systematically, meaning they could potentially be auto-generated from the document model |



## Why Is This Granular Approach Important?    
1. **Systematic Yet Customizable:**
Even we are manually building these forms now, the structure is simple and repeatable:
- Identify the scalar type (string, enum, etc.).
- Map it to a reusable component.
- Use a standardized form structure with an onSubmit handler and a dispatch function.
2. **Auto-Generation Potential:**
The systematic nature of these forms means they could be automatically generated in the future.
- For example, if a field is identified as a string, the system could auto-generate a form using a StringField.
- For enums, it could auto-generate the EnumField with all valid options.


## How to implement single field operations

### At the schema definition level

### At the frontend level



