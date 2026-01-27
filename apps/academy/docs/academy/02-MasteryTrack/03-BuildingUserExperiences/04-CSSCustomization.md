# CSS Customization for Connect Integration

When your editor runs inside Connect, it's rendered within a specific container hierarchy. Understanding this structure allows you to customize your editor's appearance to match your application's design requirements.

## Understanding the Editor Container Hierarchy

Connect wraps your editor component in two key containers that you can target for styling:

```
<div id="document-editor-container"
     class="flex-1"
     data-document-type="[type]">
  └── <DocumentEditor />
       └── <div id="document-editor-context"
                class="relative h-full"
                data-editor="[editorId]"
                data-document-type="[type]">
            └── <YourEditorComponent />
```

### Container Details

| Container ID                 | Default Classes   | Data Attributes                     | Purpose                                                     |
| ---------------------------- | ----------------- | ----------------------------------- | ----------------------------------------------------------- |
| `#document-editor-container` | `flex-1`          | `data-document-type`                | Outermost wrapper, controls overall editor space allocation |
| `#document-editor-context`   | `relative h-full` | `data-editor`, `data-document-type` | Inner context, provides positioning context and full height |

These containers are defined in Connect's source:

- [`document-editor-container.tsx`](https://github.com/powerhouse-inc/ph-monorepo/blob/main/apps/connect/src/components/document-editor-container.tsx) (line 94)
- [`editors.tsx`](https://github.com/powerhouse-inc/ph-monorepo/blob/main/apps/connect/src/components/editors.tsx) (line 173)

## Customizing Your Editor's Appearance

### Method 1: Inline Styles in Your Editor Component (Recommended)

The simplest and most maintainable approach is to apply styles directly to your editor's root element. This keeps your styling self-contained within your editor.

```tsx
export function Editor() {
  return (
    <div style={{ height: "100%" }} className="bg-gray-50 p-6">
      {/* Your editor content */}
    </div>
  );
}
```

:::tip
Using `height: "100%"` ensures your editor fills the available vertical space within Connect's container hierarchy.
:::

### Method 2: CSS File with Container Selectors

For more complex customizations or when you need to override Connect's default container styles, you can target the container IDs directly in a CSS file:

:::danger Affects All Editors
Targeting container IDs directly will apply styles to **ALL** editors in your Connect application. For editor-specific styling, use [Method 3: Scoped Styling with Data Attributes](#method-3-scoped-styling-with-data-attributes) instead.
:::

```css
/* editors/my-editor/editor.css */
#document-editor-container {
  /* Customize the outer container */
  background-color: #f8fafc;
}

#document-editor-context {
  /* Customize the inner context */
  max-width: 1200px;
  margin: 0 auto;
}

/* Scope styles to your editor within the context */
#document-editor-context .my-editor-root {
  padding: 2rem;
}
```

:::warning Best Practice: Centralize Style Imports
Remember to import styles in your `styles.css` file rather than directly in `.tsx` files. Direct imports work in development but won't be included in production builds.

```css
/* styles.css */
@import "./editors/my-editor/editor.css";
```

:::

### Method 3: Scoped Styling with Data Attributes

Connect adds `data-editor` and `data-document-type` attributes to editor containers, allowing you to scope CSS rules to specific editors without affecting others.

```css
/* Only applies to a specific editor */
#document-editor-context[data-editor="document-editor-editor"] {
  background-color: #f0f9ff;
}

/* Only applies to a specific document type */
#document-editor-context[data-document-type="powerhouse/document-editor"] {
  max-width: 900px;
  margin: 0 auto;
}

/* Combine both for precise targeting */
#document-editor-context[data-editor="document-editor-editor"][data-document-type="powerhouse/document-editor"] {
  padding: 1rem;
}
```

#### Finding Your Editor ID

The `data-editor` value comes from the `id` property in your editor module configuration:

```typescript
// editors/my-editor/module.ts
import type { EditorModule } from "@powerhousedao/reactor-browser";

export const MyEditor: EditorModule = {
  config: {
    id: "my-custom-editor", // <-- This becomes the data-editor value
    documentTypes: ["my-org/my-document-model"],
  },
  Component: MyEditorComponent,
};
```

#### Common Editor IDs

| Editor ID                | Document Type                | Description     |
| ------------------------ | ---------------------------- | --------------- |
| `document-editor-editor` | `powerhouse/document-editor` | Document Editor |
| `vetra-drive-app`        | `powerhouse/document-drive`  | Drive Explorer  |
| `app-editor`             | `powerhouse/app`             | App Editor      |

:::tip Runtime Inspection
You can inspect the `data-editor` and `data-document-type` attributes in your browser's developer tools when editing a document to find the exact values for your target editor.
:::

## Reference Implementation: Vetra Drive App

The Vetra Drive App provides a real-world example of CSS customization. Here's how it styles its editor wrapper:

```tsx
// From: packages/vetra/editors/vetra-drive-app/editor.tsx
<div
  style={{ height: "100%" }}
  className="bg-gray-50 p-6 after:pointer-events-none after:absolute after:inset-0 after:bg-blue-500 after:opacity-0 after:transition after:content-['']"
>
  <DriveExplorer {/* ... */} />
</div>
```

This example demonstrates:

- **`height: "100%"`** - Ensures the editor fills the full container height
- **`bg-gray-50`** - Applies a light gray background color
- **`p-6`** - Adds consistent padding around the content
- **`after:*` pseudo-element** - Creates a visual effect layer for transitions

## Common Use Cases

### Full-Height Editor with Scrollable Content

When your editor needs a fixed header/toolbar with scrollable main content:

```tsx
export function Editor() {
  return (
    <div style={{ height: "100%" }} className="flex flex-col">
      <header className="flex-shrink-0 border-b p-4">
        <h1>Document Title</h1>
        {/* Toolbar buttons */}
      </header>
      <main className="flex-1 overflow-auto p-4">
        {/* Scrollable content area */}
      </main>
    </div>
  );
}
```

### Custom Background and Theming

Apply custom backgrounds or gradients to match your application's theme:

```tsx
export function Editor() {
  return (
    <div
      style={{ height: "100%" }}
      className="bg-gradient-to-b from-slate-50 to-white"
    >
      {/* Themed content */}
    </div>
  );
}
```

### Centered Content with Max Width

Constrain content width for better readability:

```tsx
export function Editor() {
  return (
    <div style={{ height: "100%" }} className="bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        {/* Centered, width-constrained content */}
      </div>
    </div>
  );
}
```

## Troubleshooting

### Editor Doesn't Fill Available Height

**Problem:** Your editor content appears squished or doesn't use the full height.

**Solution:** Ensure your root element has `height: "100%"` or uses flex utilities:

```tsx
// Option 1: Inline style
<div style={{ height: "100%" }}>

// Option 2: Tailwind class
<div className="h-full">
```

### Styles Not Applied in Production

**Problem:** Styles work in development but not in production builds.

**Solution:** Move style imports from `.tsx` files to your `styles.css` file:

```css
/* styles.css - correct location for imports */
@import "./editors/my-editor/editor.css";
```

### Z-Index Conflicts

**Problem:** Overlays, modals, or dropdowns appear behind other elements.

**Solution:** The `#document-editor-context` has `position: relative`. Use this as your positioning context:

```tsx
<div style={{ height: "100%" }} className="relative">
  {/* Your content */}
  <div className="absolute right-0 top-0 z-10">{/* Positioned overlay */}</div>
</div>
```

### Content Overflows Container

**Problem:** Content extends beyond the editor boundaries.

**Solution:** Add overflow handling to your root element:

```tsx
<div style={{ height: "100%" }} className="overflow-auto">
  {/* Scrollable when content overflows */}
</div>

// Or hide overflow
<div style={{ height: "100%" }} className="overflow-hidden">
  {/* Content is clipped */}
</div>
```

## Further Reading

- [Building Document Editors](/academy/MasteryTrack/BuildingUserExperiences/BuildingDocumentEditors) - Fundamentals of editor development including basic styling
- [Building a Drive Explorer](/academy/MasteryTrack/BuildingUserExperiences/BuildingADriveExplorer) - Creating custom drive apps with styling
