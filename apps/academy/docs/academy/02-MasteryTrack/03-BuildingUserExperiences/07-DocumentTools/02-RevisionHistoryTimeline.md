# Revision History Timeline

The timeline feature enables users to view document history and navigate through different revisions of a document. This guide explains how to implement and customize the timeline functionality in your Powerhouse application.

## Enabling the Timeline Feature

To enable the timeline feature in your document editor, you need to set `timelineEnabled: true` in your editor module configuration:

```typescript
// editors/to-do-list/index.ts
export const module: EditorModule<ToDoDocument> = {
  Component: Editor as unknown as FC<EditorProps<ToDoDocument> & Record<string, unknown>>,
  documentTypes: ["powerhouse/todo"],
  config: {
    id: "editor-id",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
    timelineEnabled: true,  // Enable timeline feature
  },
};
```

This setting enables the timeline button in the document toolbar.

## Implementation Options

### Default Drive Explorer

When using the default drive explorer with `ph connect`, the timeline functionality is handled automatically:

- Document analytics are collected and passed to the document toolbar
- The timeline button appears in the toolbar when enabled
- Users can click on timeline items to view document revisions

### Custom Drive Explorer

For custom drive explorers, you need to handle timeline items fetching and user interaction manually. Here's how:

1. First, import the necessary utilities from the Powerhouse common package:

```typescript
import { useTimelineItems, getRevisionFromDate } from "@powerhousedao/common";
```

2. Fetch timeline items using the `useTimelineItems` hook:

```typescript
// In your EditorContainer.tsx
const timelineItems = useTimelineItems(documentId);
```

3. Track the selected timeline item in state:

```typescript
const [selectedTimelineItem, setSelectedTimelineItem] = useState<TimelineItem | null>(null);
```

4. Pass the timeline items to the DocumentToolbar and handle item selection:

```typescript
<DocumentToolbar
  timelineButtonVisible={editorModule.config.timelineEnabled}
  timelineItems={timelineItems.data}
  onTimelineItemClick={setSelectedTimelineItem}
  // ... other props
/>
```

> **Note**: The `timelineButtonVisible` prop should be set based on the `timelineEnabled` setting in the editor module's configuration. This ensures the timeline button is only shown when the feature is enabled for that specific document type.

5. Pass the required context values to your editor component:

```typescript
<EditorComponent
  context={{
    ...context,
    readMode: !!selectedTimelineItem,
    selectedTimelineRevision: getRevisionFromDate(
      selectedTimelineItem?.startDate,
      selectedTimelineItem?.endDate,
      document.operations.global,
    ),
  }}
  // ... other props
/>
```

## Handling Timeline Revisions in Document Editor

In your document editor (e.g., `editors/to-do-list/editor.tsx`), you need to handle the timeline context props:

1. Extract timeline-related properties from the context:

```typescript
const { readMode = false, selectedTimelineRevision, getDocumentRevision } = context;
```

2. Fetch the document at the selected revision when in read mode:

```typescript
const [readModeDocument, setReadModeDocument] = useState<ToDoDocument | null>(null);

useEffect(() => {
  const getReadModeDocument = async () => {
    if (getDocumentRevision && readMode && typeof selectedTimelineRevision === 'number') {
      const document = await getDocumentRevision({ revisions: { global: selectedTimelineRevision } });
      setReadModeDocument(document);
    } else if (!readMode) {
      setReadModeDocument(null);
    }
  };
  getReadModeDocument();
}, [getDocumentRevision, readMode, selectedTimelineRevision]);

// Use the appropriate document based on mode
const document = readModeDocument || writeModeDocument;
```

3. Adapt your UI to reflect read mode:

```typescript
{readMode && (
  <div className="text-gray-500 text-md text-center">(🔒 Read Mode)</div>
)}

{!readMode && (
  // Edit controls here
)}
```

This implementation allows users to navigate through document history while preventing edits to historical revisions.