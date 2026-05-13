# DocumentToolbar
A toolbar component for displaying and interacting with a Powerhouse document.
`DocumentToolbar` renders a default set of document controls for common document actions: undo, redo, download, document name editing, revision history, opening in Switchboard, and closing the current document view.
The toolbar can be customized by enabling or disabling built-in controls, replacing individual controls, adding custom controls to toolbar slots, replacing the toolbar containers, applying custom styles, or replacing the entire toolbar contents with `children`.
## Basic usage
```tsx
import { DocumentToolbar } from "./document-toolbar";
export function MyDocumentPage({ document }) {
  return <DocumentToolbar document={document} />;
}
```
When no `document` prop is provided, the toolbar falls back to the currently selected document.
```tsx
<DocumentToolbar />
```
## Built-in controls
The default toolbar includes these controls:
```ts
["undo", "redo", "download", "name", "history", "switchboard", "close"]
```
The controls are arranged into three slots:
```ts
{
  first: ["undo", "redo", "download"],
  second: ["name"],
  third: ["history", "switchboard", "close"],
}
```
## Disabling controls
Use `disabledControls` to remove specific built-in controls from the default toolbar.
```tsx
<DocumentToolbar
  document={document}
  disabledControls={["download", "switchboard"]}
/>
```
## Enabling only specific controls
Use `enabledControls` to render only a subset of the built-in controls.
```tsx
<DocumentToolbar
  document={document}
  enabledControls={["download", "switchboard"]}
/>
```
## Combining enabled and disabled controls
A control renders only when it is included in `enabledControls` and absent from `disabledControls`.
When a control appears in both lists, `disabledControls` takes precedence.
```tsx
<DocumentToolbar
  document={document}
  enabledControls={["download", "switchboard", "close"]}
  disabledControls={["download"]}
/>
```
In this example, only `switchboard` and `close` render.
## Adding one custom control to a slot
Use `customControls` to add controls to a specific toolbar slot.
```tsx
<DocumentToolbar
  document={document}
  customControls={{
    first: {
      component: ({ document }) => (
        <button
          onClick={() => {
            alert(`custom control one in ${document?.header.name}`);
          }}
        >
          custom one
        </button>
      ),
    },
  }}
/>
```
Custom controls receive the current document when available.
## Adding custom controls at the end of a slot
By default, custom controls render at the start of their slot. Use `position: "end"` to render a custom control after the built-in controls in that slot.
```tsx
<DocumentToolbar
  document={document}
  customControls={{
    second: {
      position: "end",
      component: ({ document }) => (
        <button
          onClick={() => {
            alert(`custom control two in ${document?.header.name}`);
          }}
        >
          custom two
        </button>
      ),
    },
  }}
/>
```
## Adding multiple custom controls to a slot
A slot can receive a list of custom controls. Each item needs a `key`.
```tsx
<DocumentToolbar
  document={document}
  customControls={{
    first: [
      {
        key: "custom-one",
        component: ({ document }) => (
          <button
            onClick={() => {
              alert(`custom control one in ${document?.header.name}`);
            }}
          >
            custom one
          </button>
        ),
      },
      {
        key: "custom-two",
        position: "end",
        component: ({ document }) => (
          <button
            onClick={() => {
              alert(`custom control two in ${document?.header.name}`);
            }}
          >
            custom two
          </button>
        ),
      },
    ],
  }}
/>
```
## Replacing the toolbar container
Use `toolbarContainer` to replace the outer toolbar container.
```tsx
<DocumentToolbar
  document={document}
  toolbarContainer={({ children }) => (
    <div className="bg-amber-300">{children}</div>
  )}
/>
```
The custom toolbar container should accept normal `div` props.
A fuller version usually forwards `className` and the remaining props:
```tsx
<DocumentToolbar
  document={document}
  toolbarContainer={({ children, className, ...props }) => (
    <div className={className} {...props}>
      {children}
    </div>
  )}
/>
```
## Replacing the controls container
Use `controlsContainer` to replace the container used for each toolbar slot.
```tsx
<DocumentToolbar
  document={document}
  controlsContainer={({ children }) => (
    <div className="bg-cyan-300">{children}</div>
  )}
/>
```
The custom controls container should accept normal `div` props.
## Replacing a built-in control
Use `componentOverrides` to replace individual built-in controls while keeping the default toolbar structure.
```tsx
import { ToolbarDownloadButton } from "./toolbar-button";
import type { PHDocument } from "@powerhousedao/shared/document-model";
<DocumentToolbar
  document={document}
  componentOverrides={{
    download: (props: { document?: PHDocument }) => (
      <ToolbarDownloadButton
        {...props}
        onClick={() => alert(props.document?.header.name)}
      >
        <span>Download??</span>
      </ToolbarDownloadButton>
    ),
  }}
/>
```
This is useful when you want to reuse the built-in control behavior or styling but change part of the rendering or click behavior.
## Replacing the document name control
The `name` control can also be replaced through `componentOverrides`.
```tsx
<DocumentToolbar
  document={document}
  componentOverrides={{
    name: ({ document }) => (
      <textarea defaultValue={document?.header.name ?? "no name"} />
    ),
  }}
/>
```
## Replacing the entire toolbar contents
Pass `children` when you want complete control over the toolbar contents.
```tsx
<DocumentToolbar document={document}>
  <div>I've totally overridden the whole thing</div>
</DocumentToolbar>
```
When `children` is provided, the built-in controls are not rendered. Props such as `enabledControls`, `disabledControls`, `customControls`, `componentOverrides`, `controlsContainer`, and `controlsContainerClassName` are not used in this mode.
The props are typed so that the `children` mode is mutually exclusive with the default-toolbar customization props.
## Custom styles
Use `toolbarClassName` to add classes to the outer toolbar container.
Use `controlsContainerClassName` to add classes to each controls container.
```tsx
<DocumentToolbar
  document={document}
  toolbarClassName="border-none bg-green-100"
  controlsContainerClassName="rounded-lg border border-green-300 p-2"
/>
```
The built-in toolbar components use `tailwind-merge`, so compatible Tailwind classes passed through these props can override default classes.
## Exported components
```ts
DocumentToolbar
ToolbarButton
ToolbarUndoButton
ToolbarRedoButton
ToolbarDownloadButton
ToolbarSwitchboardButton
ToolbarHistoryButton
ToolbarCloseButton
ToolbarName
ToolbarInput
ToolbarContainer
ToolbarControlsContainer
```
The individual toolbar controls are exported so they can be reused when building custom toolbar layouts or custom control components.
## Exported types
```ts
DocumentToolbarProps
DocumentToolbarWithChildrenProps
DocumentToolbarWithCustomControlsProps
DocumentToolbarControlName
ToolbarButtonProps
ToolbarButtonClickHandler
ToolbarControlComponent
ToolbarControlComponents
ContainerComponent
ControlSlot
ControlPosition
CustomToolbarControl
CustomToolbarControlList
CustomToolbarControls
```
## Custom control component shape
Custom controls should match `ToolbarControlComponent`.
```tsx
import type { ToolbarControlComponent } from "./document-toolbar";
const MyControl: ToolbarControlComponent = ({ document }) => {
  return <button>{document?.header.name}</button>;
};
```
## Toolbar button props
The built-in toolbar button controls accept `ToolbarButtonProps`.
```tsx
<ToolbarDownloadButton document={document}>
  Export
</ToolbarDownloadButton>
```
Each toolbar button accepts:
```ts
{
  document?: PHDocument;
  children?: ReactNode;
  className?: string;
  onClick?: (document?: PHDocument) => void;
}
```
Providing `children` replaces the default button contents. Providing `onClick` replaces the default button behavior.
```tsx
<ToolbarHistoryButton
  document={document}
  onClick={(document) => {
    console.log("Custom history action", document?.header.id);
  }}
/>
```
## Notes
- `DocumentToolbar` falls back to the currently selected document when `document` is omitted.
- Built-in undo and redo buttons automatically disable themselves when the corresponding action is unavailable.
- The document name control supports inline renaming.
- `children` mode replaces the toolbar contents completely.
- `disabledControls` takes precedence over `enabledControls`.