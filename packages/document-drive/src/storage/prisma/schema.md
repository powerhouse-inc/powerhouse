```mermaid
erDiagram
    Drive ||--o{ DriveDocument : "contains"
    Document ||--o{ DriveDocument : "belongs to"
    Document ||--o{ Operation : "has"
    Document ||--o{ SynchronizationUnit : "has"
    Operation }o--|| SynchronizationUnit : "belongs to"
    Operation ||--o{ Attachment : "has"

    Drive {
        string id PK
        string slug UK
    }

    Document {
        string id PK
        datetime created
        datetime lastModified
        boolean isDrive
        string revision
        string name
        string initialState
        string documentType
        string meta
    }

    DriveDocument {
        string driveId PK,FK
        string documentId PK,FK
    }

    Operation {
        string id PK
        string opId
        string documentId FK
        string scope
        string branch
        int index
        int skip
        string hash
        datetime timestamp
        string input
        string type
        string syncId FK
        boolean clipboard
        json context
        bytes resultingState
    }

    SynchronizationUnit {
        string id PK
        string documentId FK
        string scope
        string branch
    }

    Attachment {
        string id PK
        string operationId FK
        string mimeType
        string data
        string filename
        string extension
        string hash
    }
```

This entity relationship diagram visually represents the database schema defined in the Prisma configuration. The diagram follows the crow's foot notation where:

- `||--o{` represents a one-to-many relationship
- `}o--||` represents a many-to-one relationship
- `PK` indicates a Primary Key
- `FK` indicates a Foreign Key
- `UK` indicates a Unique Key

## Relationships Explained

1. **Drive to DriveDocument**: A Drive can contain many DriveDocuments
2. **Document to DriveDocument**: A Document can belong to many DriveDocuments
3. **Document to Operation**: A Document can have many Operations
4. **Document to SynchronizationUnit**: A Document can have many SynchronizationUnits
5. **Operation to SynchronizationUnit**: Many Operations can belong to one SynchronizationUnit
6. **Operation to Attachment**: An Operation can have many Attachments
