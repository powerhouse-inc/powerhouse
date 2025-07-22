# Diagram

```mermaid
graph TD

    subgraph "IReactor"
        AQueue["IQueue"] --> AJobs["IJobExecutor"]
        AJobs -->|"Write Commands"| AOS["IOperationStore"]
        AJobs -->|"Write Events"| AES["IEventStore"]
        AJobs -->|"Validate"| ISigner
        AES --> APub

        subgraph AEvents["IEventBus"]
            APub["emit()"]
            ASub["on()"]
        end

    
        ASub --> ARM["IDocumentView"] <-->|"Read/Write"| IDocumentIndexer
        ARM -->|"Read Events"| AES
    end

```
