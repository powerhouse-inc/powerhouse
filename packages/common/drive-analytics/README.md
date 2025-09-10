# Drive Analytics Processors

## Overview

The Drive Analytics package provides two specialized processors that analyze and track operations within the Powerhouse ecosystem:

1. **`DriveAnalyticsProcessor`**: Analyzes Document Drive operations (file creation, updates, moves, deletions, etc.)
2. **`DocumentAnalyticsProcessor`**: Analyzes individual document operations and modifications

Both processors convert operations into structured analytics data stored as time-series with rich dimensional information for analysis and monitoring.

## Purpose

This processor enables developers to:

- Monitor document drive activity and usage patterns
- Track operational metrics across different drives, branches, and scopes
- Analyze user behavior and system performance
- Generate insights about document lifecycle management

## Architecture

The processor implements the `IProcessor` interface and processes `InternalTransmitterUpdate` strands, which contain sequences of operations performed on document drives.

### Key Components

- **Analytics Store**: Stores time-series data with dimensions
- **Chunked Processing**: Processes operations in configurable chunks (default: 50 operations)
- **Source Management**: Automatically clears and rebuilds analytics data when processing from index 0

## Metrics Collected

### Primary Metric: `DriveOperations`

- **Type**: Counter metric (value = 1 for each operation)
- **Purpose**: Tracks the total number of operations performed
- **Granularity**: Per operation, with timestamp precision

## Dimensions

Each analytics data point includes the following dimensions:

### 1. Drive Dimension

- **Path Format**: `ph/drive/{driveId}/{branch}/{scope}/{revision}`
- **Purpose**: Identifies the specific drive, branch, scope, and revision
- **Example**: `ph/drive/abc123/main/global/42`

### 2. Operation Dimension

- **Path Format**: `ph/drive/operation/{operationType}/{operationIndex}`
- **Purpose**: Identifies the specific operation type and its sequence number
- **Example**: `ph/drive/operation/ADD_FILE/5`

### 3. Target Dimension

- **Path Format**: `ph/drive/target/{targetType}/{targetId}`
- **Purpose**: Identifies what was targeted by the operation
- **Target Types**:
  - `DRIVE`: Operation targets the drive itself
  - `NODE`: Operation targets a specific node (file/folder)
- **Example**: `ph/drive/target/NODE/file123`

### 4. Action Type Dimension

- **Path Format**: `ph/drive/actionType/{actionType}/{targetId}`
- **Purpose**: Categorizes the type of action performed
- **Action Types**:
  - `CREATED`: New nodes created (`ADD_FILE`, `ADD_FOLDER`)
  - `DUPLICATED`: Nodes copied (`COPY_NODE`)
  - `UPDATED`: Existing nodes modified (`UPDATE_FILE`, `UPDATE_NODE`)
  - `MOVED`: Nodes relocated (`MOVE_NODE`)
  - `REMOVED`: Nodes deleted (`DELETE_NODE`)
- **Example**: `ph/drive/actionType/CREATED/file123`

## Supported Operations

The processor handles the following operation types:

### Creation Operations

- `ADD_FILE`: Creates a new file
- `ADD_FOLDER`: Creates a new folder

### Modification Operations

- `UPDATE_FILE`: Updates file content
- `UPDATE_NODE`: Updates node metadata

### Organization Operations

- `MOVE_NODE`: Moves nodes between locations
- `COPY_NODE`: Duplicates existing nodes

### Deletion Operations

- `DELETE_NODE`: Removes nodes from the drive

## Data Source Structure

Analytics data is organized using a hierarchical source path:

```
ph/drive/{documentId}/{branch}/{scope}
```

- **documentId**: Unique identifier for the document drive
- **branch**: Branch name (e.g., "main")
- **scope**: Operational scope (e.g., "global", "local")

## Usage Examples

### Querying Drive Activity

```javascript
// Get all operations for a specific drive
const driveOperations = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/drive/abc123/main/global"),
  metric: "DriveOperations",
});

// Get operations by action type
const createdNodes = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/drive/abc123/main/global"),
  metric: "DriveOperations",
  dimensions: {
    actionType: AnalyticsPath.fromString("ph/drive/actionType/CREATED"),
  },
});
```

### Filtering by Operation Type

```javascript
// Get all file additions
const fileAdditions = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/drive/abc123/main/global"),
  metric: "DriveOperations",
  dimensions: {
    operation: AnalyticsPath.fromString("ph/drive/operation/ADD_FILE"),
  },
});
```

### Time-Based Analysis

```javascript
// Get operations within a time range
const recentOperations = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/drive/abc123/main/global"),
  metric: "DriveOperations",
  timeRange: {
    start: DateTime.now().minus({ hours: 24 }),
    end: DateTime.now(),
  },
});
```

## Configuration

### Performance Considerations

- **Chunk Size**: Operations are processed in chunks of 50 (configurable in code)
- **Batch Processing**: Analytics data is written in batches to optimize performance

## Error Handling

- **Source Clearing Errors**: Logged but don't interrupt processing
- **Batch Processing**: Continues processing even if individual batches fail
- **Graceful Degradation**: Skips empty strands and continues processing

## Monitoring and Debugging

### Logging

The processor uses structured logging with the following context:

- **Logger Path**: `["processor", "drive-analytics"]`
- **Error Logging**: Failed source clearing operations

## Dependencies

```javascript
import {
  AnalyticsPath,
  DateTime,
  type AnalyticsSeriesInput,
  type IAnalyticsStore,
} from "@powerhousedao/reactor-browser/analytics";
```

---

# Document Analytics Processor

## Overview

The `DocumentAnalyticsProcessor` is a complementary processor that focuses specifically on tracking individual document operations within drives. Unlike the DriveAnalyticsProcessor which tracks drive-level operations, this processor monitors document-specific activities and modifications.

## Purpose

The DocumentAnalyticsProcessor enables developers to:

- Monitor individual document activity and modification patterns
- Track document-specific operations across different drives and branches
- Analyze document lifecycle and usage patterns
- Distinguish between drive-level documents and regular document nodes
- Generate insights about document-specific behavior

## Metrics Collected

### Primary Metric: `DocumentOperations`

- **Type**: Counter metric (value = 1 for each operation)
- **Purpose**: Tracks the total number of document operations performed
- **Granularity**: Per document operation, with timestamp precision

## Dimensions

Each analytics data point includes the following dimensions:

### 1. Drive Dimension

- **Path Format**: `ph/doc/drive/{driveId}/{branch}/{scope}/{revision}`
- **Purpose**: Identifies the drive context where the document operation occurred
- **Example**: `ph/doc/drive/abc123/main/global/42`

### 2. Operation Dimension

- **Path Format**: `ph/doc/operation/{operationType}/{operationIndex}`
- **Purpose**: Identifies the specific operation type and its sequence number
- **Example**: `ph/doc/operation/SET_STATE/15`

### 3. Target Dimension

- **Path Format**: `ph/doc/target/{driveId}/{targetType}/{documentId}`
- **Purpose**: Identifies the document target and its relationship to the drive
- **Target Types**:
  - `DRIVE`: Document operation targets the drive document itself (when driveId === documentId)
  - `NODE`: Document operation targets a regular document node within the drive
- **Example**: `ph/doc/target/abc123/NODE/doc456`

## Data Source Structure

Document analytics data is organized using a hierarchical source path:

```
ph/doc/{driveId}/{documentId}/{branch}/{scope}
```

- **driveId**: Unique identifier for the containing drive
- **documentId**: Unique identifier for the specific document
- **branch**: Branch name (e.g., "main", "feature/xyz")
- **scope**: Operational scope (e.g., "global", "local")

## Target Type Determination

The processor automatically determines the target type based on the relationship between drive and document:

```javascript
const target = driveId === documentId ? "DRIVE" : "NODE";
```

- **DRIVE**: When the document IS the drive document (drive-level operations)
- **NODE**: When the document is a regular document within the drive

## Usage Examples

### Querying Document Activity

```javascript
// Get all operations for a specific document
const documentOperations = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/doc/abc123/doc456/main/global"),
  metric: "DocumentOperations",
});

// Get operations by target type
const driveDocumentOps = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/doc/abc123/abc123/main/global"),
  metric: "DocumentOperations",
  dimensions: {
    target: AnalyticsPath.fromString("ph/doc/target/abc123/DRIVE"),
  },
});
```

### Filtering by Operation Type

```javascript
// Get all state changes for documents
const stateChanges = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/doc/abc123/*/main/global"),
  metric: "DocumentOperations",
  dimensions: {
    operation: AnalyticsPath.fromString("ph/doc/operation/SET_STATE"),
  },
});
```

## Configuration

### Performance Considerations

- **Chunk Size**: Operations are processed in chunks of 50 (same as DriveAnalyticsProcessor)
- **Batch Processing**: Analytics data is written in batches to optimize performance
- **Source Clearing**: Automatically clears existing data when processing from index 0

## Integration with DriveAnalyticsProcessor

Both processors can be used together to provide comprehensive analytics:

- **DriveAnalyticsProcessor**: Tracks file/folder operations (ADD_FILE, MOVE_NODE, etc.)
- **DocumentAnalyticsProcessor**: Tracks document content and state operations

### Combined Usage

```javascript
// Use both processors for complete coverage
const driveProcessor = new DriveAnalyticsProcessor(analyticsStore);
const documentProcessor = new DocumentAnalyticsProcessor(analyticsStore);

// Register both processors
await processorManager.register(driveProcessor);
await processorManager.register(documentProcessor);
```

## Monitoring and Debugging

### Logging

The processor uses structured logging with the following context:

- **Logger Path**: `["processor", "document-analytics"]`
- **Error Logging**: Failed source clearing operations

### Distinguishing Data Sources

When querying analytics data, you can distinguish between the two processors:

```javascript
// Drive-level analytics (from DriveAnalyticsProcessor)
const driveData = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/drive/*"),
  metric: "DriveOperations",
});

// Document-level analytics (from DocumentAnalyticsProcessor)
const documentData = await analyticsStore.getSeriesValues({
  source: AnalyticsPath.fromString("ph/doc/*"),
  metric: "DocumentOperations",
});
```
