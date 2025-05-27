# Intro to Packages

Packages of document models are a core structuring mechanism in the Powerhouse framework, allowing developers to group and manage related document models efficiently. These packages serve as modular collections of document definitions, ensuring consistency, scalability, and reusability across different applications.

By packaging document models together, developers can create well-organized, interoperable sets of data structures that capture the specific needs of various operational processes. Whether used for financial operations, governance, or contributor management, these packages streamline development and integration within Powerhouse's decentralized framework.

### Key Features

- **Modular Structure** – Packages encapsulate related document models, making it easier to manage and deploy them as a cohesive unit.
- **Standardized Definitions** – Each document model within a package follows Powerhouse's structured schema approach, ensuring consistency in data representation.
- **Reusability and Extensibility** – Packages can be shared across different projects or extended with additional models as needed.
- **Dependency Management** – Developers can define dependencies between document models, ensuring proper relationships and data flows between interconnected components.
- **Automated Schema Evolution** – Versioning mechanisms allow document models within a package to evolve over time without breaking existing functionality.

### Example Use Cases

- **Finance Package** – A set of document models handling invoices, payments, budgets, and financial reporting. link
- **Contributor Billing Package** – Defines document models for tracking work, invoicing, and facilitating payments (in both fiat and crypto) for contributors in decentralized organizations. link
- **Governance Package** – Models for proposals, voting, contributor agreements, and decision-making processes. link
- **People Ops Package** – Documents managing contributor profiles, roles, task assignments, and reputation tracking. link
- **Project Management Package** – Models for task tracking, milestones, resource allocation, and deliverables. link  


    A **Powerhouse Package** is a **modular unit** that defines and automates **data structures and workflows** within the Powerhouse ecosystem. Each package includes several components that work together to ensure **seamless interaction, data processing, and automation** for different areas of decentralized operations.

Packages follow a **scoped naming convention** based on the organization that owns them or created the package:

- `@powerhousedao` The organization behind Powerhouse.
- `@sky-ph` The Sky / MakerDAO organization with a -ph suffix to indicate it concerns Powerhouse ecosystem packages.
- `@myorg-ph` Your organization with the -ph suffix included.

Within a package, you'll find **several key modules**, each serving a distinct role in structuring and processing data.

---

## **Modules of a Powerhouse Package**

### **1. Document Model**

The **core component** of any package, defining how data is structured and manipulated.

- Specifies **schemas** (data structures) and **state transitions** (operations).
- Serves as the foundation for decentralized workflows.
- **Example:** An **Invoice** document model might define fields like `issuer`, `recipient`, `amount`, and operations like `ADD_LINE_ITEM` or `MARK_AS_PAID`.

### **2. Document Model Editor**

A **UI component** that allows users to **interact with document models visually**.

- Enables users to **create, modify, and manage** documents without coding.
- Supports multiple editors for a single document model, offering different **UI experiences** tailored to specific roles.

### **3. Scripts**

**Automated actions** that run on demand or on a schedule.

- Executes **one-time or recurring tasks** within a package.
- Not continuously running—activated manually or at predefined intervals.
- **Example:** A script that **generates a weekly financial report** from invoice data.

### **4. Processors**

**Event-driven background tasks** that react to document changes.

- Subscribes to **document operations or system events** and processes data automatically.
- Supports real-time **data updates, analytics, and workflow automation**.
- **Example:** A processor that **monitors new invoices** and updates an **analytics dashboard** in real-time.

### **5. Drive-Apps**

**Custom interfaces** that provide enhanced ways to interact with a package's document models.

- Allows **visualization, sorting, and organization** of drive contents (e.g., **Kanban boards, list views**).
- Can aggregate data and display **key insights** from document models.
- **Example:** A Drive-App for **People Ops** might show a **dashboard of contributor profiles, role assignments, and activity logs**.

---

Each of these modules plays a crucial role in making **Powerhouse Packages extensible, reusable, and efficient**, allowing developers and organizations to **streamline operations and automate workflows** within decentralized environments.