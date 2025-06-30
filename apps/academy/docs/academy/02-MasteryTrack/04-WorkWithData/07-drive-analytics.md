# Drive Analytics

Drive Analytics provides automated monitoring and insights into document drive operations within Powerhouse applications. This system tracks user interactions, document modifications, and drive activity to help developers understand usage patterns and system performance.

## Overview

The Drive Analytics system consists of two specialized processors that automatically collect metrics from document drives:

1. **Drive Analytics Processor**: Tracks file and folder operations (creation, deletion, moves, etc.)
2. **Document Analytics Processor**: Tracks document content changes and state modifications

These processors run in the background, converting operations into structured time-series data that can be queried and visualized in real-time.

## Available Metrics in Connect

Connect applications have Drive Analytics enabled by default through the `ReactorAnalyticsProvider`. When enabled, the system automatically tracks:

### Drive Operations Metrics
- **File Creation**: New documents added to drives
- **Folder Creation**: New directories created  
- **File Updates**: Document content modifications
- **Node Updates**: Metadata changes
- **File Moves**: Documents relocated between folders
- **File Copies**: Document duplication
- **File Deletions**: Documents removed from drives

### Document Operations Metrics
- **State Changes**: Document model state modifications

## Data Sources and Structure

Drive Analytics organizes data using hierarchical source paths that allow precise querying of different analytics contexts:

### Drive Analytics Sources
Pattern: `ph/drive/{driveId}/{branch}/{scope}`
- **driveId**: Unique identifier for the document drive
- **branch**: Branch name (e.g., "main", "dev")  
- **scope**: Operation scope ("global" for shared operations, "local" for device-specific)

Example: `ph/drive/abc123/main/global`

### Document Analytics Sources  
Pattern: `ph/doc/{driveId}/{documentId}/{branch}/{scope}`
- **driveId**: Drive containing the document
- **documentId**: Specific document identifier
- **branch**: Branch name
- **scope**: Operation scope

Example: `ph/doc/abc123/doc456/main/global`

## Available Metrics

### DriveOperations
Tracks file system operations within drives:
- **Value**: Always 1 (counter metric)
- **Purpose**: Count drive-level operations like file creation, deletion, moves
- **Source Pattern**: `ph/drive/*`

### DocumentOperations  
Tracks document content and state changes:
- **Value**: Always 1 (counter metric)
- **Purpose**: Count document-specific operations like state changes
- **Source Pattern**: `ph/doc/*`

## Complete Dimensions Reference

### Drive Analytics Dimensions

#### 1. Drive Dimension
**Pattern**: `ph/drive/{driveId}/{branch}/{scope}/{revision}`
**Purpose**: Identifies the drive context with revision information
```tsx
// Examples
"ph/drive/abc123/main/global/42"
"ph/drive/my-drive/feature-branch/local/15"
```

#### 2. Operation Dimension
**Pattern**: `ph/drive/operation/{operationType}/{operationIndex}`
**Purpose**: Identifies specific operation types and their sequence

**Available Operation Types**:
- **ADD_FILE**: Create new file
- **ADD_FOLDER**: Create new folder  
- **UPDATE_FILE**: Modify file content
- **UPDATE_NODE**: Modify node metadata
- **MOVE_NODE**: Move file/folder to different location
- **COPY_NODE**: Duplicate existing file/folder
- **DELETE_NODE**: Remove file/folder

```tsx
// Examples
"ph/drive/operation/ADD_FILE/5"
"ph/drive/operation/DELETE_NODE/23"
"ph/drive/operation/MOVE_NODE/12"
```

#### 3. Target Dimension
**Pattern**: `ph/drive/target/{targetType}/{targetId}`
**Purpose**: Identifies what was targeted by the operation

**Target Types**:
- **DRIVE**: Operation affects the drive itself
- **NODE**: Operation affects a specific file/folder

```tsx
// Examples
"ph/drive/target/DRIVE/abc123"
"ph/drive/target/NODE/file456"
"ph/drive/target/NODE/folder789"
```

#### 4. Action Type Dimension
**Pattern**: `ph/drive/actionType/{actionType}/{targetId}`
**Purpose**: Categorizes operations by their effect

**Action Types**:
- **CREATED**: New items added (ADD_FILE, ADD_FOLDER)
- **DUPLICATED**: Items copied (COPY_NODE)
- **UPDATED**: Existing items modified (UPDATE_FILE, UPDATE_NODE)
- **MOVED**: Items relocated (MOVE_NODE)
- **REMOVED**: Items deleted (DELETE_NODE)

```tsx
// Examples
"ph/drive/actionType/CREATED/file123"
"ph/drive/actionType/MOVED/folder456" 
"ph/drive/actionType/REMOVED/doc789"
```

### Document Analytics Dimensions

#### 1. Drive Dimension
**Pattern**: `ph/doc/drive/{driveId}/{branch}/{scope}/{revision}`
**Purpose**: Drive context for document operations
```tsx
// Examples
"ph/doc/drive/abc123/main/global/42"
```

#### 2. Operation Dimension  
**Pattern**: `ph/doc/operation/{operationType}/{operationIndex}`
**Purpose**: Document-specific operation identification
```tsx
// Examples (document model operations vary by document type)
"ph/doc/operation/SET_STATE/15"
"ph/doc/operation/ADD_ITEM/8"
"ph/doc/operation/UPDATE_PROPERTY/22"
```

#### 3. Target Dimension
**Pattern**: `ph/doc/target/{driveId}/{targetType}/{documentId}`
**Purpose**: Document target identification

**Target Types**:
- **DRIVE**: Document is the drive document itself (driveId === documentId)
- **NODE**: Document is a regular document within the drive

```tsx
// Examples
"ph/doc/target/abc123/DRIVE/abc123"  // Drive document
"ph/doc/target/abc123/NODE/doc456"   // Regular document
```

## Query Parameters

### Time Range
- **start**: DateTime object for query start time
- **end**: DateTime object for query end time
- **granularity**: Time bucketing (Total, Hourly, Daily, Weekly, Monthly)

### Filtering with Select

Use the `select` parameter to filter by specific dimension values:

```tsx
select: {
  // Filter by specific drives
  drive: [
    AnalyticsPath.fromString("ph/drive/abc123"),
    AnalyticsPath.fromString("ph/drive/xyz789")
  ],
  
  // Filter by operation types
  operation: [
    AnalyticsPath.fromString("ph/drive/operation/ADD_FILE"),
    AnalyticsPath.fromString("ph/drive/operation/UPDATE_FILE")
  ],
  
  // Filter by action types  
  actionType: [
    AnalyticsPath.fromString("ph/drive/actionType/CREATED"),
    AnalyticsPath.fromString("ph/drive/actionType/UPDATED")
  ],
  
  // Filter by targets
  target: [
    AnalyticsPath.fromString("ph/drive/target/NODE")
  ]
}
```

### Level of Detail (LOD)

Control how deeply dimensions are grouped:

```tsx
lod: {
  drive: 1,      // Group by drive only (ignore branch/scope/revision)
  operation: 1,  // Group by operation type only (ignore index)
  actionType: 1, // Group by action type only (ignore target ID)
  target: 1      // Group by target type only (ignore target ID)
}
```

## Querying Analytics Data

### Using the useAnalyticsQuery Hook

The primary way to access drive analytics is through the `useAnalyticsQuery` hook:

```tsx
import { useAnalyticsQuery, AnalyticsGranularity, AnalyticsPath, DateTime } from '@powerhousedao/reactor-browser/analytics';

function DriveUsageChart({ driveId }: { driveId: string }) {
  const { data, isLoading } = useAnalyticsQuery({
    start: DateTime.now().minus({ days: 7 }),
    end: DateTime.now(),
    granularity: AnalyticsGranularity.Daily,
    metrics: ["DriveOperations"],
    select: {
      drive: [AnalyticsPath.fromString(`ph/drive/${driveId}`)],
      actionType: [
        AnalyticsPath.fromString("ph/drive/actionType/CREATED"),
        AnalyticsPath.fromString("ph/drive/actionType/UPDATED"),
        AnalyticsPath.fromString("ph/drive/actionType/REMOVED")
      ]
    },
    lod: {
      drive: 1,
      actionType: 1
    }
  });

  if (isLoading) return <div>Loading analytics...</div>;

  return (
    <div>
      {/* Render your chart using the analytics data */}
      {data?.rows.map(row => (
        <div key={row.metric}>
          {row.metric}: {row.value}
        </div>
      ))}
    </div>
  );
}
```

### Using the useDriveAnalytics Hook

For common drive analytics queries, use the specialized `useDriveAnalytics` hook:

```tsx
import { useDriveAnalytics } from '@powerhousedao/common/drive-analytics';
import { AnalyticsGranularity } from '@powerhousedao/reactor-browser/analytics';

function DriveInsights({ driveIds }: { driveIds: string[] }) {
  const analytics = useDriveAnalytics({
    filters: {
      driveId: driveIds,
      operation: ["ADD_FILE", "UPDATE_FILE", "DELETE_NODE"],
      actionType: ["CREATED", "UPDATED", "REMOVED"]
    },
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    to: new Date().toISOString(),
    granularity: AnalyticsGranularity.Daily,
    levelOfDetail: { drive: 1, operation: 1 }
  });

  if (analytics.isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h3>Drive Activity Summary</h3>
      {analytics.data?.rows.map((row, index) => (
        <div key={index}>
          <strong>{row.dimensions.find(d => d.name === 'actionType')?.path}</strong>: {row.value}
        </div>
      ))}
    </div>
  );
}
```

### Using the useDocumentAnalytics Hook

For document-specific analytics queries, use the `useDocumentAnalytics` hook:

```tsx
import { useDocumentAnalytics } from '@powerhousedao/common/drive-analytics';
import { AnalyticsGranularity } from '@powerhousedao/reactor-browser/analytics';

function DocumentInsights({ driveId, documentIds }: { driveId: string, documentIds: string[] }) {
  const analytics = useDocumentAnalytics({
    filters: {
      driveId: [driveId],
      documentId: documentIds,
      target: ["NODE"], // Focus on document nodes vs drive documents
      branch: ["main"],
      scope: ["global"]
    },
    from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
    to: new Date().toISOString(),
    granularity: AnalyticsGranularity.Hourly,
    levelOfDetail: { 
      drive: 1, 
      operation: 1,
      target: 1 
    }
  });

  if (analytics.isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h3>Document Activity Summary</h3>
      {analytics.data?.rows.map((row, index) => (
        <div key={index}>
          Document Operations: {row.value}
        </div>
      ))}
    </div>
  );
}
```

## Advanced Query Examples

### Filter by Multiple Criteria

```tsx
// Get file creations and updates for specific drives in the last 24 hours
const { data } = useAnalyticsQuery({
  start: DateTime.now().minus({ hours: 24 }),
  end: DateTime.now(),
  granularity: AnalyticsGranularity.Hourly,
  metrics: ["DriveOperations"],
  select: {
    drive: [
      AnalyticsPath.fromString("ph/drive/project-a"),
      AnalyticsPath.fromString("ph/drive/project-b")
    ],
    operation: [
      AnalyticsPath.fromString("ph/drive/operation/ADD_FILE"),
      AnalyticsPath.fromString("ph/drive/operation/UPDATE_FILE")
    ],
    target: [
      AnalyticsPath.fromString("ph/drive/target/NODE")
    ]
  },
  lod: {
    drive: 1,
    operation: 1
  }
});
```

### Compare Document vs Drive Operations

```tsx
// Using the specialized hooks for easier comparison
const driveOps = useDriveAnalytics({
  filters: { driveId: [driveId] },
  from: DateTime.now().minus({ days: 1 }).toISO(),
  to: DateTime.now().toISO(),
  granularity: AnalyticsGranularity.Total
});

const docOps = useDocumentAnalytics({
  filters: { driveId: [driveId] },
  from: DateTime.now().minus({ days: 1 }).toISO(),
  to: DateTime.now().toISO(),
  granularity: AnalyticsGranularity.Total
});

// Or using useAnalyticsQuery directly
const driveOpsQuery = useAnalyticsQuery({
  start: DateTime.now().minus({ days: 1 }),
  end: DateTime.now(),
  granularity: AnalyticsGranularity.Total,
  metrics: ["DriveOperations"],
  select: {
    drive: [AnalyticsPath.fromString(`ph/drive/${driveId}`)]
  }
});

const docOpsQuery = useAnalyticsQuery({
  start: DateTime.now().minus({ days: 1 }),
  end: DateTime.now(),
  granularity: AnalyticsGranularity.Total,
  metrics: ["DocumentOperations"],
  select: {
    drive: [AnalyticsPath.fromString(`ph/doc/drive/${driveId}`)]
  }
});
```

### Real-time Activity Monitoring

```tsx
// Monitor specific drive for real-time updates
const { data } = useAnalyticsQuery(
  {
    start: DateTime.now().minus({ minutes: 10 }),
    end: DateTime.now(),
    granularity: AnalyticsGranularity.Total,
    metrics: ["DriveOperations"],
    select: {
      drive: [AnalyticsPath.fromString(`ph/drive/${driveId}`)]
    }
  },
  {
    sources: [AnalyticsPath.fromString(`ph/drive/${driveId}`)],
    refetchInterval: 5000 // Poll every 5 seconds
  }
);
```

## Real-time Updates

Analytics queries can automatically update when new data is available by specifying sources:

```tsx
const { data } = useAnalyticsQuery(
  {
    start: DateTime.now().minus({ hours: 1 }),
    end: DateTime.now(),
    granularity: AnalyticsGranularity.Total,
    metrics: ["DriveOperations"]
  },
  {
    sources: [AnalyticsPath.fromString(`ph/drive/${driveId}`)]
  }
);

// This query will automatically refetch when new operations occur in the specified drive
```


## Configuration in Connect

Drive Analytics is automatically enabled in Connect applications through feature flags:

```tsx
// In apps/connect/src/context/reactor-analytics.tsx
export function ReactorAnalyticsProvider({ children }: PropsWithChildren) {
  return (
    <AnalyticsProvider options={{ databaseName: "connect:analytics" }}>
      {connectConfig.analytics.driveAnalyticsEnabled && (
        <DriveAnalyticsProcessor />
      )}
      {children}
    </AnalyticsProvider>
  );
}
```
