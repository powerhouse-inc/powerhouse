# Dark Mode Style Candidates

This report lists places in the codebase that may need dark-mode review.
It includes Tailwind classes related to colors, borders, shadows, rings, fills, strokes, gradients, and similar visual styling.


## `./apps/connect/src/components/app-skeleton.tsx`

- **Line 35**: `      <div className="rounded-lg bg-white/90 px-6 py-4 text-sm text-gray-900 shadow-lg">`
- **Line 37**: `        <div className="text-gray-600">{PHASE_LABEL[status.phase]}</div>`
- **Line 63**: `      <div className="animate-pulse overflow-hidden rounded-full shadow-lg">`

## `./apps/connect/src/pages/demo/atlas-import.tsx`

- **Line 111**: `    <div className="flex size-full justify-center gap-x-4 bg-gray-50">`
- **Line 112**: `      <div className="w-full max-w-[850px] rounded-2xl bg-white p-6 drop-shadow-sm">`
- **Line 113**: `        <h1 className="text-lg font-medium text-gray-900">`
- **Line 116**: `        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-6">`
- **Line 117**: `          <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl bg-slate-50">`
- **Line 193**: `              <div className="mt-3 text-sm text-gray-800">`
- **Line 197**: `              <div className="mt-3 text-sm text-gray-500">`
- **Line 209**: `              className="mt-4 h-9 border border-gray-200 bg-white px-3 text-gray-600"`

## `./apps/connect/src/components/error-boundary.tsx`

- **Line 71**: ` * Simple text-based fallback component.`
- **Line 79**: `  return <div className="text-center">{message}</div>;`
- **Line 97**: `      <div className="w-full max-w-lg rounded-lg border border-gray-500 bg-white p-6 shadow-sm">`
- **Line 100**: `          <h1 className="text-lg font-semibold">Something went wrong</h1>`
- **Line 102**: `        <p className="mb-4 text-sm text-gray-700">{errorMessage}</p>`
- **Line 105**: `            <summary className="cursor-pointer select-none text-sm font-medium text-gray-700 underline hover:text-gray-700">`
- **Line 108**: `            <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-3 text-xs">`
- **Line 116**: `          className="text-md mt-4 px-3 py-1.5 font-medium"`
- **Line 134**: `      <h3 className="text-lg font-semibold">{errorMessage}</h3>`

## `./apps/connect/src/pages/settings.tsx`

- **Line 7**: `        <h4 className="text-3xl font-bold leading-normal">Settings</h4>`
- **Line 22**: `        <h5 className="text-2xl leading-relaxed">General</h5>`
- **Line 25**: `        <h5 className="mb-8 text-2xl leading-relaxed">Budget Statements</h5>`
- **Line 26**: `        <div className="rounded-2xl bg-slate-50 py-24 text-center">`
- **Line 27**: `          <h5 className="text-2xl leading-relaxed">`
- **Line 33**: `        <h5 className="text-2xl leading-relaxed">Document Models</h5>`
- **Line 37**: `        <h5 className="text-2xl leading-relaxed">LDF Applications</h5>`

## `./apps/connect/src/components/button.tsx`

- **Line 10**: `        "shadow-button rounded-md bg-gray-500/20 px-4 py-1.5 text-gray-500 hover:bg-slate-100 hover:shadow-none",`

## `./apps/connect/src/components/missing-model-banner.tsx`

- **Line 31**: `      <div className="flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">`
- **Line 40**: `          className="rounded-md border border-amber-300 bg-white px-3 py-1 text-amber-900 hover:bg-amber-50"`
- **Line 88**: `        <div className="border-b border-slate-100 pb-2 text-2xl font-bold text-gray-800">`
- **Line 91**: `        <div className="my-4 text-sm text-gray-600">`
- **Line 96**: `          <div className="rounded-xl bg-slate-50 p-4 text-sm text-gray-600">`
- **Line 107**: `                  className="rounded-xl bg-slate-50 p-4"`
- **Line 109**: `                  <div className="mb-1 font-mono text-sm font-semibold text-gray-800">`
- **Line 112**: `                  <div className="mb-2 text-xs text-gray-600">`
- **Line 116**: `                    <div className="mb-2 text-xs text-gray-500">`
- **Line 122**: `                    <div className="mb-2 break-words font-mono text-xs text-red-700">`
- **Line 137**: `                        "min-h-[32px] rounded-xl px-3 py-1 text-sm font-semibold text-white transition-all hover:scale-105",`
- **Line 139**: `                          ? "cursor-not-allowed bg-gray-300 hover:scale-100"`
- **Line 140**: `                          : "bg-gray-800 active:opacity-75",`
- **Line 155**: `            className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"`

## `./apps/connect/src/components/migration-banner.tsx`

- **Line 66**: `      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-yellow-500 bg-yellow-400 px-4 py-3 text-sm text-gray-900 shadow-lg">`
- **Line 71**: `          <div className="text-gray-800">`
- **Line 76**: `            <div className="mt-2 font-medium text-red-900">`
- **Line 85**: `          className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"`
- **Line 93**: `          className="rounded border border-gray-900 bg-transparent px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-900/10 disabled:opacity-50"`

## `./apps/connect/src/components/modal/modals/SettingsModal.tsx`

- **Line 34**: `        icon: <Icon name="Danger" size={12} className="text-red-900" />,`
- **Line 35**: `        label: <span className="text-red-900">Danger Zone</span>,`

## `./apps/connect/src/components/modal/modals/CookiesPolicyModal.tsx`

- **Line 18**: `            subtitle: <h2 className="mb-4 text-lg font-bold" />,`
- **Line 25**: `      bodyProps={{ className: "text-left" }}`

## `./apps/connect/src/components/cookie-banner.tsx`

- **Line 57**: `      <div className="absolute inset-0 bg-black opacity-15" />`
- **Line 58**: `      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-white px-10 pb-16 pt-10 shadow-lg">`
- **Line 67**: `          <p className="font-semibold text-gray-500">`
- **Line 76**: `                    className="cursor-pointer text-gray-900 hover:underline"`

## `./apps/connect/src/components/editors.tsx`

- **Line 29**: `      <h3 className="text-lg font-semibold">{message}</h3>`
- **Line 123**: `          <div className="text-center leading-10">`
- **Line 151**: `          <div className="text-center leading-10">`

## `./apps/connect/src/components/modal/modals/DownloadDocumentWithErrorsModal.tsx`

- **Line 29**: `          <ul className="mt-4 flex list-disc flex-col items-start px-4 text-xs">`

## `./apps/connect/src/components/modal/modals/settings/about.tsx`

- **Line 39**: `      <div className="bg-white p-3">`
- **Line 41**: `        <p className="mb-3 text-sm font-normal text-gray-600">`
- **Line 45**: `          className="flex items-center gap-x-2 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100"`
- **Line 62**: `    <div className="bg-white p-3 text-sm">`
- **Line 98**: `    <div className="my-4 bg-white p-3">`
- **Line 101**: `        <p className="text-sm font-normal text-gray-600">`
- **Line 120**: `    <li className="text-sm text-gray-700">`
- **Line 124**: `          <span className="text-xs text-gray-500">{info.host}</span>`
- **Line 128**: `        <div className="mt-1 text-xs text-gray-400">Loading…</div>`
- **Line 131**: `        <div className="mt-1 text-xs text-red-600">`
- **Line 136**: `        <div className="mt-1 text-xs text-gray-600">`
- **Line 161**: `        <div className="mt-1 text-xs text-gray-400">Local drive — N/A</div>`

## `./apps/connect/src/components/modal/modals/DebugSettingsModal.tsx`

- **Line 39**: `          <div className="text-xl font-bold">Debug Tools</div>`
- **Line 44**: `        <div className="flex text-sm font-bold">`
- **Line 54**: `                className="ml-2 font-mono text-xs font-normal text-blue-600 hover:underline"`
- **Line 64**: `                className="ml-2 font-mono text-xs font-normal text-gray-500"`
- **Line 72**: `        <div className="mt-4 flex text-sm font-bold">`
- **Line 77**: `        <div className="mt-4 flex text-sm font-bold">`
- **Line 83**: `            <label htmlFor="serviceWorkerDebugMode" className="text-xs">`
- **Line 103**: `            <label htmlFor="appVersion" className="text-xs">`
- **Line 107**: `              containerClassName="p-1 bg-white border border-gray-200 rounded-md text-sm"`
- **Line 108**: `              inputClassName="text-xs font-normal"`
- **Line 111**: `                <div className="flex h-full items-center text-xs">Version:</div>`

## `./apps/connect/src/components/search-bar.tsx`

- **Line 39**: `      className="max-w-searchbar-width m-4 shrink-0 bg-gray-100"`

## `./packages/design-system/style.css`

- **Line 14**: `  --toastify-text-color-light: var(--color-gray-800);`
- **Line 29**: `  accent-color: var(--color-gray-900);`
- **Line 70**: `.hover-bg-transparent:hover {`
- **Line 89**: `    @apply mb-4 mt-6 font-sans text-[32px] font-bold leading-[120%] text-[#343839];`
- **Line 93**: `    @apply mb-3 mt-5 font-sans text-2xl font-bold leading-[120%] text-[#343839];`
- **Line 97**: `    @apply mb-2 mt-4 font-sans text-xl font-bold leading-[120%] text-[#343839];`
- **Line 101**: `    @apply font-sans text-base font-normal leading-[120%] text-[#343839];`
- **Line 105**: `    @apply font-sans text-sm font-normal leading-[100%] text-[#474d4e];`
- **Line 118**: `    /* text-sm, font-normal, leading-5 */`
- **Line 119**: `    /* text-gray-900 is #1a202c, using established default */`
- **Line 120**: `    /* bg-white */`
- **Line 121**: `    /* border border-gray-300 (#d1d5db), using established default */`
- **Line 126**: `    @apply mb-[10px] box-border w-full rounded-md border border-[#ced4da] bg-white px-3 py-[7px] font-sans text-sm font-normal leading-5 text-[#343839];`
- **Line 143**: `    @apply bg-gray-50 text-gray-500;`
- **Line 149**: `    @apply text-[#007bff] no-underline;`
- **Line 154**: `    @apply text-[#0056b3] underline;`
- **Line 159**: `    @apply outline-none ring-2 ring-[#007bff]/50 ring-offset-2;`
- **Line 172**: `    @apply block font-sans font-medium text-[#343839];`
- **Line 178**: `    @apply my-4 h-px border-0 bg-[#ced4da];`

## `./packages/design-system/theme.css`

- **Line 93**: `  --shadow-modal:`
- **Line 96**: `  --shadow-tab: 0px 16px 16px -4px rgba(0, 0, 0, 0.1);`
- **Line 97**: `  --shadow-sidebar:`
- **Line 99**: `  --shadow-tooltip:`
- **Line 103**: `  --shadow-button:`
- **Line 112**: `  --animate-slide-in-from-top: slideInFromTop 0.2s ease-in-out;`
- **Line 113**: `  --animate-slide-in-from-bottom: slideInFromBottom 0.2s ease-in-out;`
- **Line 114**: `  --animate-slide-in-from-left: slideInFromLeft 0.2s ease-in-out;`
- **Line 115**: `  --animate-slide-in-from-right: slideInFromRight 0.2s ease-in-out;`

## `./packages/design-system/src/connect/components/document-state-viewer/document-state-viewer.tsx`

- **Line 33**: `    return <div className="text-sm text-gray-500">No state data</div>;`
- **Line 46**: `              "-mt-2 rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-sm",`

## `./packages/design-system/src/connect/components/document-timeline/components/h-divider.tsx`

- **Line 47**: `    <div className="flex flex-col text-xs">`
- **Line 49**: `      {!!subtitle && <div className="text-gray-300">{subtitle}</div>}`
- **Line 79**: `        className="rounded-md bg-gray-900 text-white"`
- **Line 89**: `            "mx-0.5 flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-300",`
- **Line 90**: `            isSelected && "bg-blue-300",`
- **Line 98**: `          <div className="h-0.5 w-1 rounded-full bg-gray-500" />`

## `./packages/design-system/src/connect/components/document-timeline/components/timeline-bar.tsx`

- **Line 61**: `    <div className="flex flex-col text-xs">`
- **Line 63**: `      <div className="text-green-900">{`${additions} additions +`}</div>`
- **Line 64**: `      <div className="text-red-700">{`${deletions} deletions -`}</div>`
- **Line 95**: `            "flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-300",`
- **Line 101**: `          <div className="size-[3px] rounded-full bg-gray-500" />`
- **Line 105**: `          className="rounded-md bg-gray-900 text-white"`
- **Line 115**: `              "flex h-[25px] w-1.5 cursor-pointer flex-col items-center justify-center rounded-[2px] hover:bg-blue-300",`
- **Line 117**: `              isSelected && "bg-blue-300",`
- **Line 125**: `                  "h-3 w-0.5 rounded-t-full bg-green-600",`
- **Line 133**: `                  "h-3 w-0.5 rounded-b-full bg-red-600",`

## `./packages/design-system/src/connect/components/document-timeline/document-timeline.tsx`

- **Line 128**: `        <div className="absolute left-[0px] z-[20] h-[17px] w-[6px] bg-white">`
- **Line 129**: `          <div className="mt-[11px] h-[6px] w-[6px] rounded-tl-md bg-slate-50" />`
- **Line 132**: `        <div className="absolute right-[0px] top-[11px] z-[20] h-[6px] w-[6px] bg-white">`
- **Line 133**: `          <div className="h-[6px] w-[6px] rounded-tr-md bg-slate-50" />`
- **Line 135**: `        <div className="absolute inset-x-0 bottom-0 h-[25px] rounded-md bg-slate-50" />`
- **Line 144**: `              <div className="flex rounded-sm bg-blue-200">`
- **Line 150**: `        <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-[25px] w-2 rounded-l-md bg-slate-50" />`
- **Line 151**: `        <div className="pointer-events-none absolute bottom-0 right-0 z-10 h-[25px] w-2 rounded-r-md bg-slate-50" />`

## `./packages/design-system/src/connect/components/object-inspector-modal/object-inspector-modal.tsx`

- **Line 46**: `        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">`
- **Line 47**: `          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>`
- **Line 49**: `            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-gray-500 outline-none hover:text-gray-900"`
- **Line 61**: `            <p className="text-gray-500">No data to display</p>`

## `./packages/design-system/src/connect/components/breadcrumbs/breadcrumbs.tsx`

- **Line 50**: `    <div className="flex h-9 flex-row items-center gap-2 p-6 text-gray-500">`
- **Line 57**: `            className="flex items-center justify-center rounded-md p-1 transition-colors hover:bg-gray-100 hover:text-gray-800"`
- **Line 86**: `            className="text-gray-800"`
- **Line 95**: `            className="ml-1 flex items-center justify-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 transition-colors hover:bg-gray-200 hover:text-gray-800"`
- **Line 122**: `    "cursor-pointer transition-colors last-of-type:text-gray-800 hover:text-gray-800",`
- **Line 123**: `    isDragging ? "opacity-60" : isDropTarget ? "bg-blue-100" : "",`

## `./packages/design-system/src/connect/components/node-input/node-input.tsx`

- **Line 57**: `      className={twMerge("bg-inherit text-inherit outline-none", className)}`

## `./packages/design-system/src/connect/components/editor-undo-redo-buttons/editor-undo-redo-buttons.tsx`

- **Line 13**: `    "w-8 h-8 rounded-lg flex justify-center items-center rounded border border-gray-200";`
- **Line 15**: `    <div className="flex gap-x-2 text-gray-500">`
- **Line 20**: `            canUndo ? "text-gray-900 active:opacity-50" : "text-gray-500",`
- **Line 29**: `            canRedo ? "text-gray-900 active:opacity-50" : "text-gray-500",`

## `./packages/design-system/src/connect/components/modal/upgrade-drive-modal.tsx`

- **Line 7**: `  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 45**: `      <div className="w-[400px] p-6 text-slate-300">`
- **Line 46**: `        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">`
- **Line 49**: `        <div className="my-6 rounded-md bg-slate-50 p-4 text-center">`
- **Line 56**: `              "flex-1 bg-slate-50 text-slate-800",`
- **Line 63**: `            className={twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50")}`

## `./packages/design-system/src/connect/components/modal/confirmation-modal.tsx`

- **Line 8**: `  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 62**: `        {...mergeClassNameProps(containerProps, "w-[400px] p-6 text-slate-300")}`
- **Line 67**: `            "border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800",`
- **Line 75**: `            "my-6 rounded-md bg-slate-50 p-4 text-center",`
- **Line 91**: `              twMerge(buttonStyles, "flex-1 bg-slate-50 text-slate-800"),`
- **Line 100**: `              twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50"),`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/about.tsx`

- **Line 10**: `    <div className="bg-white p-3">`
- **Line 12**: `      <p className="text-sm font-normal text-gray-600">`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/default-editor.tsx`

- **Line 31**: `      <h3 className="mb-4 font-semibold text-gray-900">`

## `./packages/codegen/src/templates/boilerplate/LICENSE.ts`

- **Line 277**: `    e) Convey the object code using peer-to-peer transmission, provided`
- **Line 428**: `occurring solely as a consequence of using peer-to-peer transmission`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/danger-zone.tsx`

- **Line 41**: `    <div className={cn("h-full rounded-lg bg-white p-3", className)}>`
- **Line 103**: `        "mb-4 flex w-96 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm last-of-type:mb-0",`
- **Line 109**: `        <span className="block text-sm font-medium leading-[18px]">`
- **Line 113**: `          <span className="text-sm text-gray-600">`
- **Line 120**: `            className="group flex items-center gap-x-2 text-sm text-slate-500 transition-colors hover:text-[#9896FF]"`
- **Line 126**: `              className="size-4 text-gray-400 transition-colors group-hover:text-inherit"`
- **Line 142**: `            className: "text-red-900",`
- **Line 161**: `            className="text-gray-600 group-hover:text-gray-900"`
- **Line 176**: `        className="flex items-center gap-x-2 rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm font-medium text-red-900 transition-colors hover:bg-gray-100"`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/form.tsx`

- **Line 49**: `      className={cn(error && "text-destructive", className)}`
- **Line 88**: `      className={cn("text-[0.8rem] text-gray-600", className)}`
- **Line 110**: `      className={cn("text-[0.8rem] font-medium text-red-800", className)}`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/module-form.tsx`

- **Line 3**: `import { TextField } from "./text-field.js";`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation.tsx`

- **Line 111**: `            className="h-4 w-4 rounded border-gray-300"`
- **Line 113**: `          <span className="text-sm text-gray-700">`
- **Line 129**: `        <h3 className="my-2 text-sm font-medium text-gray-700">`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/package-manager-list.tsx`

- **Line 22**: `    <div className="flex items-start gap-2 text-sm">`
- **Line 23**: `      <p className="text-gray-600">{label}:</p>`
- **Line 24**: `      <p className="text-gray-600">{value}</p>`
- **Line 58**: `    className: "text-gray-800",`
- **Line 65**: `    className: "text-red-900",`
- **Line 81**: `        "relative flex flex-col items-start rounded-md border border-gray-200 p-3 text-sm leading-5 shadow-sm",`
- **Line 86**: `        <h3 className="font-semibold text-gray-900">{registryPackage.name}</h3>`
- **Line 95**: `          <span className="text-xs font-normal text-gray-500">`
- **Line 157**: `            className="text-gray-600 group-hover:text-gray-900"`
- **Line 328**: `      <h3 className="sticky top-0 z-10 mb-3 border-b border-gray-200 bg-white">`
- **Line 334**: `          className="flex w-full items-center gap-2 pb-2 text-left text-base font-semibold text-gray-900 hover:text-gray-700"`
- **Line 340**: `              "shrink-0 text-gray-500 transition-transform",`
- **Line 345**: `          <span className="text-xs font-medium text-gray-500">{count}</span>`
- **Line 351**: `            <p className="text-sm text-gray-500">{emptyText}</p>`
- **Line 368**: `      <h4 className="mb-2 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">`
- **Line 370**: `        <span className="font-medium normal-case tracking-normal text-gray-400">`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation-form.tsx`

- **Line 4**: `import { TextField } from "./text-field.js";`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/text-field.tsx`

- **Line 23**: `import type { TextareaHandle } from "./text-area.js";`
- **Line 24**: `import { Textarea } from "./text-area.js";`
- **Line 151**: `                  className="text-sm font-medium text-gray-700"`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/state-schemas.tsx`

- **Line 144**: `        <h3 className="mb-2 text-lg capitalize">{scope} state schema *</h3>`
- **Line 175**: `            <p className="mt-2 text-sm text-red-600">`
- **Line 183**: `          <h3 className="mb-2 text-right text-lg capitalize">`
- **Line 189**: `            className="mb-2 w-fit whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 pl-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"`
- **Line 216**: `            <p key={index} className="mt-2 text-sm text-red-600">`
- **Line 275**: `            <h3 className="mb-2 text-lg capitalize">local state schema *</h3>`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/input.tsx`

- **Line 12**: `          "flex h-9 w-full rounded-md border border-gray-400 bg-transparent px-3 py-1 text-sm transition-colors hover:bg-gray-100 focus-visible:bg-gray-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/package-manager-input.tsx`

- **Line 74**: `    <div className="flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-gray-50">`
- **Line 76**: `        <p className="truncate text-sm font-medium text-gray-900">{baseName}</p>`
- **Line 78**: `          <p className="truncate text-xs text-gray-500">{option.description}</p>`
- **Line 81**: `          <p className="truncate text-xs text-gray-400">{option.meta}</p>`
- **Line 101**: `          <span className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">`
- **Line 108**: `            className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"`
- **Line 188**: `      <h3 className="mb-4 font-semibold text-gray-900">Install Package</h3>`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/button.tsx`

- **Line 14**: `        "h-10 whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/errors.tsx`

- **Line 9**: `        <p className="text-sm font-semibold text-red-900" key={error}>`

## `./packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx`

- **Line 25**: `      <h3 className="mb-3 text-xl font-bold text-gray-600">New document</h3>`
- **Line 38**: `              <span className="text-sm">`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/tabs.tsx`

- **Line 14**: `      "flex items-center justify-center rounded-xl bg-slate-50 p-1 shadow-[inset_0px_0px_2px_rgba(255,255,255,0.50)]",`
- **Line 29**: `      "flex w-full items-center justify-center whitespace-nowrap rounded-lg p-1 text-sm text-gray-500 transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-gray-50 data-[state=active]:text-gray-800 data-[state=active]:shadow-[0px_16px_16px_-4px_rgba(0,0,0,0.10)]",`

## `./packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/file-content-view.tsx`

- **Line 61**: `      <div className="mb-8 text-sm text-gray-400">No documents or files 📄</div>`

## `./packages/design-system/src/powerhouse/components/modal/modal.tsx`

- **Line 37**: `            "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 grid place-items-center overflow-y-auto bg-slate-900/50",`
- **Line 45**: `              "data-[state=closed]:animate-zoom-out data-[state=open]:animate-zoom-in bg-white",`

## `./packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/layout.tsx`

- **Line 69**: `        <div className="mb-4 text-base font-semibold text-gray-600">`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/text-area.tsx`

- **Line 44**: `          "min-h-10 w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",`

## `./packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/folder-view.tsx`

- **Line 17**: `        "rounded-md border-2 border-transparent p-2",`
- **Line 27**: `          <div className="mb-8 text-sm text-gray-400">`

## `./packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/search-bar.tsx`

- **Line 41**: `      className="max-w-searchbar-width m-4 shrink-0 bg-gray-100"`

## `./packages/design-system/src/powerhouse/components/button/button.tsx`

- **Line 27**: `    small: "px-2 py-1.5 text-xs rounded-md font-medium",`
- **Line 28**: `    medium: "px-6 py-3 text-base rounded-xl font-semibold tracking-wide",`
- **Line 33**: `      "bg-gray-200 text-gray-600 hover:text-gray-700 hover:border-gray-300 active:border-slate-100 active:text-gray-600 disabled:text-gray-400",`
- **Line 34**: `    dark: "bg-gray-800 text-slate-50 hover:bg-slate-800 active:border-slate-700 disabled:bg-gray-300 disabled:text-slate-100",`
- **Line 35**: `    red: "bg-red-900 text-slate-50 hover:opacity-80 active:border-red-800 disabled:text-red-400 disabled:opacity-100",`
- **Line 36**: `    blue: "bg-blue-900 text-slate-50 hover:opacity-80 active:border-blue-800 disabled:text-blue-400 disabled:opacity-100",`
- **Line 42**: `    "flex items-center justify-center gap-2 border border-none outline-none transition disabled:cursor-not-allowed",`

## `./packages/codegen/src/templates/document-editor/editor.ts`

- **Line 22**: `    <div className="mx-auto max-w-4xl bg-gray-50 p-6">`
- **Line 50**: `            <h3 className="text-base">ID</h3>`
- **Line 59**: `            <h3 className="text-base">Created</h3>`
- **Line 67**: `            <h3 className="text-base">Type</h3>`
- **Line 71**: `            <h3 className="text-base">Last Modified</h3>`
- **Line 84**: `          <h3 className="text-base">Document State</h3>`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.test.ts`

- **Line 568**: `      JSON.stringify({ id: "placeholder-id" }, null, 2),`
- **Line 861**: `          id: "placeholder-id",`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/package-manager/version-picker.tsx`

- **Line 89**: `          "flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 transition-colors",`
- **Line 90**: `          "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/20",`
- **Line 97**: `        <Icon name="ChevronDown" size={12} className="shrink-0 text-gray-500" />`
- **Line 106**: `        <div className="border-b border-gray-200 p-2">`
- **Line 111**: `              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"`
- **Line 117**: `              className="h-8 pl-7 text-xs"`
- **Line 123**: `            <p className="px-3 py-4 text-center text-xs text-gray-500">`
- **Line 129**: `              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">`
- **Line 145**: `                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors",`
- **Line 146**: `                      "hover:bg-gray-100",`
- **Line 147**: `                      isSelected && "bg-gray-100 font-semibold",`
- **Line 150**: `                    <span className="truncate text-gray-900">{tag}</span>`
- **Line 151**: `                    <span className="truncate text-gray-500">{ver}</span>`
- **Line 159**: `              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">`
- **Line 175**: `                      "flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors",`
- **Line 176**: `                      "hover:bg-gray-100",`
- **Line 177**: `                      isSelected && "bg-gray-100 font-semibold",`
- **Line 180**: `                    <span className="truncate text-gray-900">{ver}</span>`

## `./packages/codegen/src/templates/app/components/Files.ts`

- **Line 21**: `      <h3 className="mb-2 text-sm font-semibold text-gray-600">Documents</h3>`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.ts`

- **Line 343**: `      return isNonNull ? "placeholder-id" : null;`

## `./packages/design-system/src/powerhouse/components/legacy/stylesVariant.ts`

- **Line 99**: `    boxSizing: "border-box",`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/editor.tsx`

- **Line 323**: `    <main className="min-h-dvh bg-gray-50 p-6">`
- **Line 364**: `            <h3 className="mb-6 text-lg capitalize">{scope} Operations</h3>`

## `./packages/codegen/src/templates/app/components/EmptyState.ts`

- **Line 13**: `    <div className="py-12 text-center text-gray-500">`
- **Line 14**: `      <p className="text-lg">This folder is empty</p>`
- **Line 15**: `      <p className="mt-2 text-sm">Create your first document or folder below</p>`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/model-metadata-form.tsx`

- **Line 9**: `import { TextField } from "./text-field.js";`
- **Line 116**: `      className="border-none pl-0 text-xl font-bold text-gray-900"`

## `./packages/codegen/src/templates/app/components/NavigationBreadcrumbs.ts`

- **Line 10**: `    <div className="border-b border-gray-200 pb-3 space-y-3">`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/divider.tsx`

- **Line 24**: `    <div className={cn("bg-gray-200", sizeClass, marginClass, className)} />`

## `./packages/design-system/src/powerhouse/components/legacy/styles.ts`

- **Line 88**: `    boxSizing: "border-box",`

## `./packages/design-system/src/connect/components/modal/settings-modal-v2/settings-modal.tsx`

- **Line 37**: `          "flex h-9 w-48 cursor-pointer items-center gap-x-2 rounded-md pl-3 hover:bg-slate-50",`
- **Line 38**: `          selectedTab === tab.id ? "bg-slate-50" : "bg-transparent",`
- **Line 74**: `      <div className="flex justify-between border-b border-slate-50 p-4">`
- **Line 75**: `        <h1 className="text-center text-xl font-semibold">{title}</h1>`
- **Line 78**: `          className="flex size-6 items-center justify-center rounded-md outline-none"`
- **Line 86**: `        <div className="m-6 flex h-full flex-1 flex-col overflow-hidden rounded-lg border border-slate-50">`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/label.tsx`

- **Line 8**: `  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation-description-form.tsx`

- **Line 3**: `import { TextField } from "./text-field.js";`

## `./packages/design-system/src/powerhouse/components/legacy/styles.css`

- **Line 4**: `  box-sizing: border-box;`
- **Line 28**: `  border-bottom: 1px solid #aaa;`
- **Line 33**: `  border-bottom: 1px solid #0a0a0a;`
- **Line 40**: `  box-sizing: border-box;`
- **Line 49**: `  text-align: left;`
- **Line 54**: `  text-align: center;`
- **Line 58**: `  text-align: right;`
- **Line 64**: `  border-radius: 5px;`
- **Line 66**: `  box-sizing: border-box;`
- **Line 86**: `  box-sizing: border-box;`
- **Line 90**: `  box-sizing: border-box;`
- **Line 96**: `  box-sizing: border-box;`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation-error-form.tsx`

- **Line 7**: `import { TextField } from "./text-field.js";`

## `./packages/design-system/src/connect/components/modal/drive-settings-modal.tsx`

- **Line 91**: `          <h1 className="text-xl font-bold">Drive settings</h1>`
- **Line 93**: `            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"`

## `./packages/powerhouse-vetra-packages/editors/document-model-editor/components/module.tsx`

- **Line 52**: `    <div className="relative rounded-3xl bg-gray-100 p-6">`
- **Line 64**: `            className="absolute right-1 top-1 p-2 text-gray-800 transition-colors hover:text-gray-500"`

## `./packages/codegen/src/templates/app/components/CreateDocument.ts`

- **Line 20**: `      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">`
- **Line 49**: `      className="cursor-pointer rounded-md bg-gray-200 py-2 px-3 hover:bg-gray-300"`

## `./packages/design-system/src/connect/components/modal/inspector-modal/inspector-modal.tsx`

- **Line 76**: `            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-gray-500 outline-none hover:text-gray-900"`

## `./packages/design-system/src/powerhouse/components/pagination/pagination-button.tsx`

- **Line 17**: `    "h-8 min-w-8 border border-solid border-gray-300 bg-white px-3 py-1 text-xs text-gray-900 hover:bg-gray-100",`
- **Line 18**: `    !active && "border-0",`

## `./packages/codegen/src/templates/app/components/Folders.ts`

- **Line 20**: `      <h3 className="mb-2 text-sm font-bold text-gray-600">Folders</h3>`

## `./packages/design-system/src/connect/components/modal/create-document-modal.tsx`

- **Line 9**: `  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 63**: `        className="w-[400px] p-6 text-slate-300"`
- **Line 66**: `        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">`
- **Line 71**: `            <div className="mb-2 text-red-500">`
- **Line 92**: `              "flex-1 bg-slate-50 text-slate-800",`
- **Line 100**: `            className={twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50")}`

## `./packages/codegen/src/templates/app/editor.ts`

- **Line 20**: `    <div className="bg-gray-50 p-6">`

## `./packages/design-system/src/connect/components/modal/add-remote-drive-modal.tsx`

- **Line 52**: `          <h1 className="text-xl font-bold">Add drive</h1>`
- **Line 54**: `            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"`

## `./packages/design-system/src/powerhouse/components/sidebar/sidebar-panel.tsx`

- **Line 46**: `          "no-scrollbar flex-1 overflow-auto text-gray-900 transition-shadow",`

## `./packages/design-system/src/powerhouse/components/sidebar/sidebar.tsx`

- **Line 34**: `      className={twMerge(`group flex h-full flex-col bg-slate-50`, className)}`

## `./packages/design-system/src/connect/components/modal/replace-duplicate-modal.tsx`

- **Line 7**: `  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 67**: `        {...mergeClassNameProps(containerProps, "w-[450px] p-6 text-slate-300")}`
- **Line 69**: `        <div className="flex items-center justify-between border-b border-slate-50 pb-2">`
- **Line 73**: `              "text-2xl font-bold text-gray-800",`
- **Line 80**: `            className="flex size-6 items-center justify-center rounded-md outline-none hover:bg-slate-100"`
- **Line 89**: `            "my-6 rounded-md bg-slate-50 p-4 text-center",`
- **Line 100**: `              twMerge(buttonStyles, "flex-1 bg-gray-800 text-gray-50"),`

## `./packages/design-system/src/connect/components/modal/delete-drive-modal.tsx`

- **Line 22**: `      bodyProps={{ className: "p-0 bg-white my-0" }}`
- **Line 28**: `            ? "bg-red-600 hover:scale-100 cursor-not-allowed active:opacity-100"`
- **Line 29**: `            : "bg-red-900",`
- **Line 34**: `        <div className="my-6 rounded-md bg-slate-50 p-4 text-center">`

## `./packages/design-system/src/connect/components/modal/read-required-modal.tsx`

- **Line 9**: `  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 85**: `        className: twMerge("rounded-3xl outline-none", contentProps?.className),`
- **Line 95**: `        {...mergeClassNameProps(containerProps, "w-[500px] p-6 text-slate-300")}`
- **Line 100**: `            "border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800",`
- **Line 109**: `            "my-6 max-h-[245px] overflow-scroll rounded-md bg-slate-50 p-4 text-center",`
- **Line 128**: `                "flex-1 bg-gray-800 text-gray-50",`
- **Line 130**: `                  "cursor-not-allowed bg-gray-300 hover:scale-100",`

## `./packages/design-system/src/connect/components/modal/settings-modal/dependency-versions/dependency-versions.tsx`

- **Line 66**: `      toggleClassName="text-gray-900 text-sm"`
- **Line 68**: `      <ul className="text-sm text-gray-600">`

## `./packages/design-system/src/connect/components/account-popover/account-popover-user.tsx`

- **Line 36**: `    <div className="flex flex-col divide-y divide-gray-200 text-gray-900">`
- **Line 38**: `        {username && <div className="text-sm font-medium">{username}</div>}`
- **Line 44**: `            className="w-full cursor-pointer bg-transparent p-0 active:opacity-70"`
- **Line 51**: `                <span className="text-xs">{shortAddress(address)}</span>`
- **Line 55**: `                className={`absolute left-0 text-xs transition-opacity duration-150 ${isCopied ? "opacity-100" : "opacity-0"}`}`
- **Line 69**: `            className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-600"`
- **Line 80**: `            "flex w-full items-center gap-2 text-sm text-red-900",`
- **Line 82**: `              ? "cursor-pointer hover:text-red-700"`

## `./packages/design-system/src/connect/components/account-popover/account-popover-login.tsx`

- **Line 40**: `          "mt-4 flex h-7 w-full cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-transparent text-sm active:opacity-70",`

## `./packages/design-system/src/connect/components/modal/settings-modal/row.tsx`

- **Line 14**: `      <div className="flex items-center justify-between gap-x-12 text-sm font-medium">`

## `./packages/design-system/src/connect/components/dropdown-menu/dropdown-menu.tsx`

- **Line 34**: `      <DropdownMenuTrigger asChild className="outline-none">`
- **Line 39**: `          "cursor-pointer rounded-2xl border border-gray-200 bg-white text-sm font-medium text-slate-500 shadow-lg",`
- **Line 46**: `              "flex items-center px-5 py-2 outline-none first-of-type:rounded-t-2xl first-of-type:pt-3 last-of-type:rounded-b-2xl last-of-type:pb-3 hover:bg-slate-50",`

## `./packages/design-system/src/connect/components/loading-screen/loading-screen.tsx`

- **Line 22**: `        "absolute inset-0 z-10 flex items-center justify-center bg-white",`

## `./packages/design-system/src/connect/components/modal/settings-modal/clear-storage-row.tsx`

- **Line 18**: `        className="h-auto min-h-9 rounded border border-solid border-gray-300 bg-white px-3 py-0 text-sm text-red-800 hover:border-gray-500 hover:bg-white hover:text-red-900"`

## `./packages/design-system/src/connect/components/modal/settings-modal/settings-modal.tsx`

- **Line 41**: `      <div className="w-[432px] p-4 text-gray-900">`
- **Line 43**: `          <h1 className="text-center text-xl font-bold">{title}</h1>`
- **Line 45**: `            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"`
- **Line 51**: `        <div className="mt-8 flex min-h-[50px] items-center justify-center rounded-md bg-slate-50 p-3 text-xs font-medium text-gray-600">`
- **Line 57**: `            className="text-gray-900"`

## `./packages/design-system/src/connect/components/code-popover.tsx`

- **Line 84**: `          className="shadow-tooltip z-50 rounded-lg border border-gray-200 bg-white p-2 text-xs outline-none"`

## `./packages/design-system/src/connect/components/toggle/toggle.tsx`

- **Line 19**: `      <div className="peer h-6 w-11 rounded-full bg-gray-500 after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:border after:border-none after:bg-gray-50 after:transition-all peer-checked:bg-blue-900 peer-checked:after:translate-x-full peer-focus:outline-none" />`

## `./packages/design-system/src/connect/components/modal/add-local-drive-modal.tsx`

- **Line 46**: `          <h1 className="text-xl font-bold">Create new drive </h1>`
- **Line 48**: `            className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"`

## `./packages/design-system/src/connect/components/upload-file-list/upload-file-list.tsx`

- **Line 38**: `        "w-[358px] rounded-md border border-gray-100 bg-gray-50 p-4 shadow-[1px_4px_15px_rgba(74,88,115,0.25)]",`
- **Line 50**: `          className="min-w-0 flex-1 text-left text-sm font-medium leading-4 text-gray-900 hover:opacity-80"`
- **Line 61**: `            className="text-gray-900 hover:opacity-80"`
- **Line 79**: `              className="text-gray-900 hover:opacity-80"`

## `./packages/design-system/src/connect/components/document-toolbar/containers.tsx`

- **Line 18**: `        "flex h-12 w-full items-center justify-between rounded-xl border border-gray-200 bg-slate-50 px-4",`

## `./packages/design-system/src/connect/components/modal/missing-package-modal.tsx`

- **Line 8**: `  "min-h-[36px] text-sm font-semibold py-2 px-4 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";`
- **Line 97**: `      <div className="w-[460px] p-6 text-slate-300">`
- **Line 98**: `        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">`
- **Line 101**: `        <div className="my-4 text-sm text-gray-600">`
- **Line 110**: `              <div key={packageName} className="rounded-xl bg-slate-50 p-4">`
- **Line 111**: `                <div className="mb-1 text-sm font-semibold text-gray-800">`
- **Line 114**: `                <div className="mb-3 text-xs text-gray-500">`
- **Line 126**: `                      "border border-slate-200 bg-white text-slate-800",`
- **Line 138**: `                      "bg-gray-800 text-gray-50",`

## `./packages/design-system/src/connect/components/db-explorer/components/filter-bar.tsx`

- **Line 197**: `          itemClassName="px-2 py-1 text-xs"`
- **Line 198**: `          menuClassName="px-2 py-1 text-xs min-w-[80px]"`
- **Line 209**: `        itemClassName="px-2 py-1 text-xs"`
- **Line 210**: `        menuClassName="px-2 py-1 text-xs min-w-[150px]"`
- **Line 220**: `        itemClassName="px-2 py-1 text-xs"`
- **Line 221**: `        menuClassName="px-2 py-1 text-xs min-w-[100px]"`
- **Line 227**: `          className="min-w-[150px] rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"`
- **Line 234**: `        className="flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"`
- **Line 331**: `    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-gray-300 bg-white p-2">`
- **Line 334**: `          className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"`
- **Line 348**: `            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">`
- **Line 354**: `          className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"`

## `./packages/design-system/src/connect/components/modal/delete-item-modal.tsx`

- **Line 22**: `        className: "bg-red-900",`

## `./packages/design-system/src/connect/components/db-explorer/components/table-view.tsx`

- **Line 224**: `      <div className="flex shrink-0 items-center justify-between text-sm">`
- **Line 226**: `          <span className="text-gray-600">`
- **Line 235**: `              className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 250**: `              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 258**: `              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 267**: `              <span className="flex items-center px-1 text-xs text-gray-500">`
- **Line 276**: `                  "min-w-8 rounded border px-2 py-1 text-xs",`
- **Line 278**: `                    ? "border-blue-500 bg-blue-50 text-blue-700"`
- **Line 279**: `                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100",`
- **Line 289**: `              <span className="flex items-center px-1 text-xs text-gray-500">`
- **Line 295**: `              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 303**: `              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 316**: `          "max-h-full overflow-auto rounded-lg border border-gray-300 transition-opacity",`
- **Line 320**: `        <table className="w-full border-collapse">`
- **Line 321**: `          <thead className="sticky top-0 bg-gray-100">`
- **Line 323**: `              <th className="w-12 px-2 py-2 text-center text-xs font-medium text-gray-600">`
- **Line 334**: `                      "group px-3 py-2 text-left text-xs font-medium text-gray-600",`
- **Line 335**: `                      index > 0 && "border-l border-gray-300",`
- **Line 337**: `                        "cursor-pointer hover:bg-gray-200 hover:text-gray-900",`
- **Line 356**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 366**: `                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"`
- **Line 368**: `                  <td className="px-2 py-2 text-center">`
- **Line 370**: `                      className="flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"`
- **Line 385**: `                        "px-3 py-2 text-xs text-gray-900",`
- **Line 386**: `                        colIndex > 0 && "border-l border-gray-300",`
- **Line 392**: `                          row[column.name] === null && "italic text-gray-400",`

## `./packages/design-system/src/connect/components/combobox/combobox.tsx`

- **Line 50**: `          className="w-full px-2 py-3 hover:bg-slate-50"`
- **Line 80**: `            boxSizing: "border-box",`
- **Line 121**: `            boxSizing: "border-box",`

## `./packages/design-system/src/connect/components/db-explorer/components/schema-tree-sidebar.tsx`

- **Line 56**: `          "flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm hover:bg-gray-100",`
- **Line 57**: `          selected && "bg-blue-50",`
- **Line 64**: `            className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500 hover:text-gray-700"`
- **Line 80**: `        {icon && <span className="shrink-0 text-gray-500">{icon}</span>}`
- **Line 81**: `        <span className="min-w-0 flex-1 truncate text-gray-700">{label}</span>`
- **Line 83**: `          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500" />`
- **Line 105**: `      className="flex items-center gap-1 py-0.5 pr-2 text-xs text-gray-500"`
- **Line 110**: `      <span className="ml-auto shrink-0 text-gray-400">({typeLabel})</span>`
- **Line 150**: `    <div className="flex flex-col overflow-auto pt-4 text-sm">`
- **Line 166**: `                className="ml-auto p-0.5 text-gray-400 hover:text-gray-600"`

## `./packages/design-system/src/connect/components/image-input/image-input.tsx`

- **Line 60**: `            "flex cursor-pointer items-center gap-2 rounded-xl bg-gray-100 p-3 text-gray-800",`

## `./packages/design-system/src/connect/components/db-explorer/db-explorer.tsx`

- **Line 274**: `          className: "bg-red-900 text-white hover:bg-red-800",`
- **Line 288**: `          className: "bg-red-900 text-white hover:bg-red-800",`
- **Line 292**: `      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200">`
- **Line 305**: `          <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 p-2">`
- **Line 308**: `                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 317**: `                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 325**: `              <div className="flex flex-col gap-1 border-t border-gray-200 pt-2">`
- **Line 326**: `                <div className="flex items-center justify-between text-xs text-gray-600">`
- **Line 328**: `                  <span className="font-semibold text-gray-900">`
- **Line 336**: `                    className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"`
- **Line 354**: `          <div className="text-sm text-gray-500">`
- **Line 358**: `          <div className="text-sm text-gray-500">Loading...</div>`

## `./packages/design-system/src/connect/components/document-toolbar/toolbar-name.tsx`

- **Line 56**: `        "cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700",`

## `./packages/design-system/src/connect/components/select/select.tsx`

- **Line 70**: `        "border border-gray-200 bg-gray-50 text-gray-800 transition-[border-radius]",`
- **Line 82**: `          "flex min-w-[360px] cursor-pointer items-center justify-between pr-3 text-gray-800 outline-none",`
- **Line 96**: `          "max-h-0 w-full overflow-hidden bg-inherit transition-[max-height] ease-in-out",`
- **Line 136**: `        disabled ? "cursor-not-allowed text-gray-500" : "text-gray-800",`
- **Line 137**: `        "flex size-full cursor-pointer items-center gap-2 bg-inherit py-3 pl-3 text-start outline-none",`
- **Line 144**: `        <p className="capitalize text-inherit">`
- **Line 147**: `        <p className="text-xs text-gray-600">{description}</p>`

## `./packages/design-system/src/connect/components/formatted-json-viewer.tsx`

- **Line 22**: `                className="inline-block text-green-800"`
- **Line 32**: `              className="inline-block cursor-pointer text-gray-600"`

## `./packages/design-system/src/connect/components/tooltip/tooltip.tsx`

- **Line 47**: `            "shadow-tooltip z-50 rounded-lg border border-gray-200 bg-white p-2 text-xs",`

## `./packages/reactor-browser/src/renown/components/RenownLoginButton.tsx`

- **Line 61**: `    transition: "background-color 150ms, border-color 150ms",`

## `./packages/design-system/src/connect/components/divider/divider.tsx`

- **Line 6**: `    <div {...props} className={twMerge("h-px bg-gray-200", props.className)} />`

## `./packages/design-system/src/connect/components/file-item/file-item.tsx`

- **Line 123**: `        <div className="absolute bottom-[-2px] right-0 size-3 rounded-full bg-white">`
- **Line 136**: `    "group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2 text-gray-600 hover:text-gray-800",`
- **Line 144**: `        <div className="max-h-6 truncate text-sm font-medium group-hover:text-gray-800">`
- **Line 147**: `        <div className="max-h-6 truncate text-xs font-medium text-gray-600 group-hover:text-gray-800">`
- **Line 168**: `            <Icon className="text-gray-600" name="VerticalDots" />`

## `./packages/design-system/src/connect/components/document-toolbar/toolbar-input.tsx`

- **Line 43**: `        "text-center text-sm font-medium text-gray-500",`

## `./packages/design-system/src/ui/components/form-description/form-description.tsx`

- **Line 18**: `        "font-sans text-sm font-normal leading-5 text-gray-600 dark:text-gray-500",`

## `./packages/design-system/src/connect/components/integrity-inspector/integrity-inspector.tsx`

- **Line 105**: `        <h2 className="text-lg font-semibold text-gray-900">`
- **Line 112**: `          <label className="text-xs font-medium text-gray-600">`
- **Line 116**: `            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-400"`
- **Line 124**: `          <label className="text-xs font-medium text-gray-600">`
- **Line 128**: `            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-400"`
- **Line 137**: `            className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"`
- **Line 150**: `            className="flex items-center gap-1 rounded border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-sm text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"`
- **Line 163**: `            className="flex items-center gap-1 rounded border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-sm text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"`
- **Line 179**: `        <div className="flex shrink-0 items-center gap-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2">`
- **Line 180**: `          <span className="text-sm text-yellow-800">`
- **Line 186**: `            className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"`
- **Line 199**: `            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"`
- **Line 208**: `      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-300 p-4">`
- **Line 210**: `          <div className="flex h-full items-center justify-center text-sm text-gray-400">`
- **Line 216**: `          <div className="flex h-full items-center justify-center text-sm text-gray-500">`
- **Line 222**: `          <div className="rounded bg-red-50 p-3 text-sm text-red-700">`
- **Line 249**: `            result.isConsistent ? "bg-green-500" : "bg-red-500",`
- **Line 252**: `        <span className="text-sm font-medium">`
- **Line 259**: `      <div className="text-xs text-gray-500">Document: {result.documentId}</div>`
- **Line 263**: `          <h3 className="text-sm font-medium text-gray-700">Keyframe Issues</h3>`
- **Line 264**: `          <table className="w-full border-collapse text-xs">`
- **Line 266**: `              <tr className="bg-gray-100">`
- **Line 267**: `                <th className="px-2 py-1 text-left font-medium text-gray-600">`
- **Line 270**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 273**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 276**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 279**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 286**: `                <tr key={`kf-${i}`} className="odd:bg-white even:bg-gray-50">`
- **Line 288**: `                  <td className="border-l border-gray-300 px-2 py-1">`
- **Line 291**: `                  <td className="border-l border-gray-300 px-2 py-1">`
- **Line 294**: `                  <td className="border-l border-gray-300 px-2 py-1 font-mono">`
- **Line 297**: `                  <td className="border-l border-gray-300 px-2 py-1 font-mono">`
- **Line 309**: `          <h3 className="text-sm font-medium text-gray-700">Snapshot Issues</h3>`
- **Line 310**: `          <table className="w-full border-collapse text-xs">`
- **Line 312**: `              <tr className="bg-gray-100">`
- **Line 313**: `                <th className="px-2 py-1 text-left font-medium text-gray-600">`
- **Line 316**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 319**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 322**: `                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">`
- **Line 329**: `                <tr key={`snap-${i}`} className="odd:bg-white even:bg-gray-50">`
- **Line 331**: `                  <td className="border-l border-gray-300 px-2 py-1">`
- **Line 334**: `                  <td className="border-l border-gray-300 px-2 py-1 font-mono">`
- **Line 337**: `                  <td className="border-l border-gray-300 px-2 py-1 font-mono">`
- **Line 354**: `        <span className="size-3 rounded-full bg-green-500" />`
- **Line 355**: `        <span className="text-sm font-medium">Rebuild complete</span>`
- **Line 357**: `      <div className="text-xs text-gray-500">Document: {result.documentId}</div>`
- **Line 359**: `        <div className="text-sm text-gray-700">`
- **Line 364**: `        <div className="text-sm text-gray-700">`

## `./packages/design-system/src/connect/components/document-toolbar/toolbar-button.tsx`

- **Line 29**: `        "grid size-fit place-items-center rounded-lg border border-gray-200 bg-white p-1 text-gray-900",`
- **Line 31**: `          ? "cursor-not-allowed text-gray-500"`
- **Line 116**: `    children = <span className="px-1 text-xs">Download</span>,`

## `./packages/reactor-browser/src/renown/components/RenownUserButton.tsx`

- **Line 56**: `    transition: "background-color 150ms, border-color 150ms",`

## `./packages/design-system/src/connect/components/home-screen/home-screen-item.tsx`

- **Line 20**: `        "hover-bg-transparent relative flex h-24 w-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md p-2 text-center text-sm text-black",`
- **Line 28**: `          <div className="size-8 items-center justify-center rounded-lg bg-black pt-1">`
- **Line 29**: `            <span className="text-6 w-6 text-white">`
- **Line 37**: `        {description && <p className="text-gray-500">{description}</p>}`

## `./packages/design-system/src/connect/components/form/inputs/drive-app.tsx`

- **Line 16**: `        "flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-800",`
- **Line 23**: `        <p className="text-xs text-gray-600">Built by Powerhouse</p>`

## `./packages/design-system/src/connect/components/default-editor-loader/default-editor-loader.tsx`

- **Line 13**: `        <h3 className="mb-4 text-xl">{message}</h3>`

## `./packages/design-system/src/connect/components/form/inputs/available-offline-toggle.tsx`

- **Line 16**: `      <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-900">`
- **Line 19**: `            className="font-medium text-gray-900"`
- **Line 24**: `          <p className="text-xs text-gray-600">`

## `./packages/design-system/src/connect/components/revision-history/revision/operation.tsx`

- **Line 15**: `        <span className="flex cursor-pointer items-center gap-2 text-xs">`
- **Line 17**: `          <Icon className="text-gray-300" name="Braces" size={16} />`

## `./packages/design-system/src/connect/components/form/inputs/delete-drive.tsx`

- **Line 26**: `      <p className="mb-2 rounded-md bg-slate-50 p-4 text-center text-slate-200">`

## `./packages/design-system/src/connect/components/revision-history/revision/signature.tsx`

- **Line 17**: `        <span className="flex w-fit cursor-pointer items-center gap-1 rounded-lg border border-gray-200 px-2 py-1">`
- **Line 19**: `          <Icon className="text-gray-300" name="InfoSquare" size={16} />`
- **Line 41**: `      ? "text-red-800"`
- **Line 43**: `        ? "text-green-700"`
- **Line 44**: `        : "text-orange-700";`
- **Line 46**: `  return <span className={`text-xs ${color}`}>{verificationStatusText}</span>;`

## `./packages/design-system/src/connect/components/queue-inspector/queue-inspector.tsx`

- **Line 197**: `        <h2 className="text-lg font-semibold text-gray-900">Queue Inspector</h2>`
- **Line 201**: `              "flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:opacity-50",`
- **Line 203**: `                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"`
- **Line 204**: `                : "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100",`
- **Line 217**: `            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"`
- **Line 228**: `      <div className="flex shrink-0 items-center gap-4 rounded-lg bg-gray-100 px-4 py-2 text-sm">`
- **Line 233**: `              state.isPaused ? "bg-yellow-500" : "bg-green-500",`
- **Line 236**: `          <span className="font-medium text-gray-700">`
- **Line 240**: `        <div className="text-gray-600">`
- **Line 243**: `        <div className="text-gray-600">`
- **Line 248**: `      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">`
- **Line 249**: `        <table className="w-full border-collapse">`
- **Line 250**: `          <thead className="sticky top-0 bg-gray-100">`
- **Line 260**: `                      "group cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900",`
- **Line 261**: `                      index > 0 && "border-l border-gray-300",`
- **Line 279**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 288**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 298**: `                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"`
- **Line 300**: `                  <td className="px-3 py-2 text-xs">`
- **Line 302**: `                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"`
- **Line 309**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 314**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 319**: `                          ? "bg-purple-100 text-purple-700"`
- **Line 320**: `                          : "bg-blue-100 text-blue-700",`
- **Line 326**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 331**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 336**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 341**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 346**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 349**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs">`
- **Line 354**: `                          ? "bg-green-100 text-green-700"`
- **Line 355**: `                          : "bg-gray-100 text-gray-600",`
- **Line 359**: `                        <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-500" />`
- **Line 371**: `      <div className="shrink-0 text-sm text-gray-600">`

## `./packages/design-system/src/connect/components/revision-history/revision/revision-number.tsx`

- **Line 26**: `        <span className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">`
- **Line 30**: `              className="cursor-pointer text-slate-100"`

## `./packages/design-system/src/ui/components/text-input/text-input.tsx`

- **Line 13**: `import TextInputDiff from "./text-input-diff.js";`

## `./packages/design-system/src/connect/components/form/inputs/label.tsx`

- **Line 11**: `      className={twMerge("block font-semibold text-gray-500", className)}`

## `./packages/design-system/src/connect/components/form/inputs/drive-name.tsx`

- **Line 8**: `    <div className="flex gap-2 rounded-xl bg-gray-100 p-3 font-semibold text-gray-500">`
- **Line 9**: `      <Icon className="text-gray-600" name="Drive" />`

## `./packages/design-system/src/connect/components/form/inputs/location-info.tsx`

- **Line 16**: `        "my-3 flex items-center gap-2 rounded-xl border border-gray-100 p-3 text-gray-800 shadow",`
- **Line 23**: `        <p className="text-xs text-slate-200">{locationInfo.description}</p>`

## `./packages/design-system/src/connect/components/form-input/form-input.tsx`

- **Line 37**: `          "mb-1 flex gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-black placeholder:text-gray-50",`
- **Line 38**: `          isError && "border-red-900",`
- **Line 43**: `          <span className={twJoin((!isDirty || isError) && "text-slate-200")}>`
- **Line 51**: `            "w-full bg-transparent font-semibold outline-none",`
- **Line 60**: `          "hidden min-h-4 text-xs text-red-900",`

## `./packages/design-system/src/connect/components/toast/toast.tsx`

- **Line 44**: `          <Icon className="text-green-800" name="CheckCircleFill" size={24} />`
- **Line 50**: `          <Icon className="text-gray-600" name="WarningFill" size={24} />`
- **Line 56**: `          <Icon className="text-gray-600" name="ClockFill" size={24} />`
- **Line 62**: `          <Icon className="text-red-800" name="TrashFill" size={24} />`
- **Line 82**: `    className="flex items-center text-gray-500 hover:text-gray-600"`

## `./packages/design-system/src/connect/components/revision-history/revision/address.tsx`

- **Line 24**: `        <span className="flex w-fit cursor-pointer items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs text-slate-100">`

## `./packages/design-system/src/connect/components/form/drive-settings-form.tsx`

- **Line 84**: `          <p className="py-2 text-sm text-gray-500">Local drive — N/A</p>`
- **Line 87**: `          <p className="py-2 text-sm text-gray-400">Loading…</p>`
- **Line 90**: `          <p className="py-2 text-sm text-red-600">`
- **Line 95**: `          <div className="py-2 text-sm text-gray-700">`
- **Line 113**: `          className="flex gap-2 py-3 font-semibold text-red-900 transition hover:brightness-125"`

## `./packages/design-system/src/ui/components/json-viewer/json-viewer.tsx`

- **Line 69**: `  container: `${_defaultStyles.container} !bg-transparent`,`
- **Line 70**: `  label: `${_defaultStyles.label} !text-gray-600`,`
- **Line 71**: `  punctuation: `${_defaultStyles.punctuation} !text-gray-700 !font-semibold`,`
- **Line 72**: `  collapseIcon: `${_defaultStyles.collapseIcon} !text-gray-600`,`
- **Line 73**: `  stringValue: `${_defaultStyles.stringValue} !text-gray-600`,`

## `./packages/reactor-browser/src/utils/index.ts`

- **Line 5**: `export * from "./get-revision-from-date.js";`

## `./packages/design-system/src/connect/components/form/add-remote-drive-form.tsx`

- **Line 122**: `            className="mt-4 w-full py-2 text-base"`

## `./packages/design-system/src/connect/components/revision-history/revision/timestamp.tsx`

- **Line 29**: `        <span className="cursor-pointer text-xs">committed at {shortDate}</span>`

## `./packages/design-system/src/connect/components/form/add-local-drive-form.tsx`

- **Line 41**: `          <Label htmlFor="name" className="text-sm font-medium text-gray-800">`
- **Line 55**: `            className="text-sm font-medium text-gray-800"`
- **Line 64**: `            className="text-sm font-medium text-gray-800"`

## `./packages/design-system/src/ui/components/checkbox/checkbox-base.tsx`

- **Line 23**: `      "border-input border shadow-sm shadow-black/[.04]",`
- **Line 25**: `      "ring-offset-background transition-shadow",`
- **Line 27**: `      "focus-visible:border-ring focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",`
- **Line 29**: `      "disabled:cursor-not-allowed disabled:border-gray-700 disabled:data-[invalid=false]:data-[state=checked]:bg-gray-700 disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-700 dark:disabled:data-[invalid=false]:data-[state=checked]:bg-gray-500 dark:disabled:data-[invalid=false]:data-[state=indeterminate]:bg-gray-500",`
- **Line 31**: `      "data-[state]:border-gray-700 dark:data-[state]:border-gray-500",`
- **Line 32**: `      "data-[state=checked]:bg-gray-900 data-[state=indeterminate]:bg-gray-900 dark:data-[state=checked]:bg-gray-400 dark:data-[state=indeterminate]:bg-gray-400",`
- **Line 33**: `      "data-[state=checked]:text-slate-50 data-[state=indeterminate]:text-slate-50 dark:data-[state=checked]:text-gray-900 dark:data-[state=indeterminate]:text-gray-900",`
- **Line 36**: `        "group-hover:border-gray-900 data-[state=checked]:group-hover:bg-gray-900 data-[state=indeterminate]:group-hover:bg-gray-900",`
- **Line 37**: `        "dark:group-hover:border-slate-50 dark:data-[state=checked]:group-hover:bg-slate-50 dark:data-[state=indeterminate]:group-hover:bg-slate-50",`
- **Line 40**: `      "data-[invalid=true]:data-[state]:!border-red-800 data-[invalid=true]:data-[state=checked]:!bg-red-800 data-[invalid=true]:data-[state=indeterminate]:!bg-red-800",`
- **Line 41**: `      "dark:data-[invalid=true]:data-[state]:!border-red-800 dark:data-[invalid=true]:data-[state=checked]:!bg-red-800 dark:data-[invalid=true]:data-[state=indeterminate]:!bg-red-800",`
- **Line 43**: `      "data-[invalid=true]:group-hover:!border-red-900 data-[invalid=true]:data-[state=checked]:group-hover:!bg-red-900 data-[invalid=true]:data-[state=indeterminate]:group-hover:!bg-red-900",`
- **Line 50**: `    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">`

## `./packages/design-system/src/connect/components/debug-inspector/debug-inspector.tsx`

- **Line 40**: `        <h2 className="text-lg font-semibold text-gray-900">PGlite data dir</h2>`
- **Line 41**: `        <p className="mt-1 text-sm text-gray-600">`
- **Line 46**: `        <div className="mt-2 inline-flex items-center gap-2 rounded bg-gray-100 px-3 py-1 text-sm">`
- **Line 47**: `          <span className="text-gray-600">Current version:</span>`
- **Line 48**: `          <span className="font-semibold text-gray-900">`
- **Line 65**: `              className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"`
- **Line 74**: `        <div className="flex shrink-0 items-center gap-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2">`
- **Line 75**: `          <span className="text-sm text-yellow-900">`
- **Line 82**: `            className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"`
- **Line 89**: `            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"`
- **Line 97**: `        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">`

## `./packages/design-system/src/connect/components/footer/footer.tsx`

- **Line 11**: `        "flex items-center gap-x-6 text-xs font-medium text-[#9DA6B9]",`

## `./packages/design-system/src/connect/components/revision-history/revision/revision.tsx`

- **Line 12**: `    <article className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2">`

## `./packages/design-system/src/connect/components/revision-history/revision/errors.tsx`

- **Line 15**: `  const color = hasErrors ? "text-red-800" : "text-green-700";`
- **Line 28**: `        "flex w-fit items-center rounded-lg border border-gray-200 px-2 py-1 text-xs",`

## `./packages/design-system/src/ui/components/text-field/text-field.tsx`

- **Line 4**: `import { type TextInputProps, TextInput } from "../text-input/text-input.js";`

## `./packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx`

- **Line 194**: `        <h2 className="text-lg font-semibold text-gray-900">`
- **Line 199**: `            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"`
- **Line 210**: `      <div className="flex shrink-0 items-center gap-4 rounded-lg bg-gray-100 px-4 py-2 text-sm">`
- **Line 211**: `        <div className="text-gray-600">`
- **Line 214**: `        <div className="flex items-center gap-2 text-gray-600">`
- **Line 215**: `          <span className="size-2 rounded-full bg-green-500" />`
- **Line 218**: `        <div className="flex items-center gap-2 text-gray-600">`
- **Line 219**: `          <span className="size-2 rounded-full bg-red-500" />`
- **Line 225**: `        <div className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">`
- **Line 230**: `      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">`
- **Line 231**: `        <table className="w-full border-collapse">`
- **Line 232**: `          <thead className="sticky top-0 bg-gray-100">`
- **Line 242**: `                      "group cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900",`
- **Line 243**: `                      index > 0 && "border-l border-gray-300",`
- **Line 261**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 270**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 281**: `                    "hover:bg-blue-50",`
- **Line 283**: `                      ? "bg-red-50"`
- **Line 284**: `                      : "odd:bg-white even:bg-gray-50",`
- **Line 287**: `                  <td className="px-3 py-2 text-xs">`
- **Line 289**: `                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"`
- **Line 296**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs">`
- **Line 301**: `                          ? "bg-green-100 text-green-700"`
- **Line 302**: `                          : "bg-red-100 text-red-700",`
- **Line 306**: `                        <span className="inline-block size-1.5 rounded-full bg-green-500" />`
- **Line 309**: `                        <span className="inline-block size-1.5 rounded-full bg-red-500" />`
- **Line 314**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 322**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 330**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 335**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 338**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 341**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 344**: `                        className="block truncate text-red-600"`
- **Line 350**: `                      <span className="text-gray-400">-</span>`
- **Line 353**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 362**: `                      <span className="text-gray-400">-</span>`
- **Line 365**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs">`
- **Line 368**: `                        className="flex items-center gap-1 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"`
- **Line 384**: `      <div className="shrink-0 text-sm text-gray-600">`

## `./packages/design-system/src/connect/components/upload-file-item/upload-file-item.tsx`

- **Line 49**: `          "flex w-full flex-col gap-0.5 rounded-md border border-gray-100 bg-white p-2 shadow-[0_2px_12px_rgba(37,42,52,0.1)]",`

## `./packages/design-system/src/connect/components/status-icon/sync-status-icon.tsx`

- **Line 40**: `        className={twMerge("text-blue-900", className)}`
- **Line 48**: `        className={twMerge("text-blue-900", className)}`
- **Line 56**: `        className={twMerge("text-green-900", className)}`
- **Line 64**: `        className={twMerge("text-orange-900", className)}`
- **Line 72**: `        className={twMerge("text-red-900", className)}`
- **Line 80**: `        className={twMerge("text-red-900", className)}`

## `./packages/design-system/src/ui/components/tooltip/tooltip.tsx`

- **Line 32**: `        "z-50 overflow-hidden rounded-md text-sm",`
- **Line 34**: `        "border border-gray-200 bg-white text-gray-900 dark:border-gray-900 dark:bg-slate-900 dark:text-gray-200",`
- **Line 36**: `        "px-3 py-1.5 shadow-md",`
- **Line 41**: `        "data-[side=bottom]:animate-slide-in-from-top",`
- **Line 42**: `        "data-[side=left]:animate-slide-in-from-right",`
- **Line 43**: `        "data-[side=right]:animate-slide-in-from-left",`
- **Line 44**: `        "data-[side=top]:animate-slide-in-from-bottom",`

## `./packages/design-system/src/connect/components/revision-history/header/document-state.tsx`

- **Line 26**: `      className="rounded-lg bg-slate-50 p-1 text-stone-300"`

## `./packages/design-system/src/ui/components/id-autocomplete/id-autocomplete.tsx`

- **Line 137**: `              className={cn("dark:bg-charcoal-900 bg-gray-100")}`

## `./packages/design-system/src/ui/components/id-autocomplete/id-autocomplete-list-option.tsx`

- **Line 18**: `            ? "text-gray-400 dark:text-gray-700"`
- **Line 19**: `            : "text-gray-900 dark:text-gray-300",`
- **Line 51**: `        "mt-0.5 focus-visible:outline-none",`
- **Line 66**: `          "text-gray-500 dark:text-gray-600",`
- **Line 106**: `          "truncate text-xs leading-5",`
- **Line 108**: `            ? "text-gray-400 dark:text-gray-700"`
- **Line 109**: `            : "text-gray-500 dark:text-gray-600",`
- **Line 127**: `              "truncate text-sm font-bold leading-5",`
- **Line 129**: `                ? "text-gray-400 dark:text-gray-700"`
- **Line 130**: `                : "text-gray-900 dark:text-gray-300",`
- **Line 141**: `                "truncate text-xs leading-5 text-blue-900 hover:underline focus-visible:outline-none",`
- **Line 149**: `                "truncate text-xs leading-5",`
- **Line 151**: `                  ? "text-gray-400 dark:text-gray-700"`
- **Line 152**: `                  : "text-gray-500 dark:text-gray-600",`
- **Line 172**: `              "truncate text-xs leading-5",`
- **Line 174**: `                ? "text-gray-400 dark:text-gray-700"`
- **Line 175**: `                : "text-gray-500 dark:text-gray-600",`
- **Line 186**: `              "line-clamp-2 text-xs leading-5",`
- **Line 188**: `                ? "text-gray-400 dark:text-gray-700"`
- **Line 189**: `                : "text-gray-900 dark:text-gray-300",`
- **Line 202**: `                "truncate text-xs leading-5",`
- **Line 204**: `                  ? "text-gray-400 dark:text-gray-700"`
- **Line 205**: `                  : "text-gray-500 dark:text-gray-600",`
- **Line 218**: `        "w-full max-w-full rounded-md bg-transparent px-3 pb-2",`

## `./packages/design-system/src/connect/components/revision-history/header/branch.tsx`

- **Line 10**: `    <button className="flex h-8 w-fit items-center gap-1 rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-stone-300">`
- **Line 13**: `      <span className="text-gray-900">{branch}</span>`

## `./packages/design-system/src/ui/components/command/command.tsx`

- **Line 28**: `      "group relative flex items-center border-b",`
- **Line 29**: `      "border-b-gray-300 dark:border-b-gray-900",`
- **Line 30**: `      "hover:border-b-gray-300 dark:hover:border-b-gray-800",`
- **Line 31**: `      "hover:bg-gray-100 dark:hover:bg-gray-900",`
- **Line 32**: `      "focus-within:border-b-gray-300 dark:focus-within:border-b-gray-800",`
- **Line 33**: `      "focus-within:bg-gray-100 dark:focus-within:bg-gray-900",`
- **Line 42**: `        "pointer-events-none absolute left-2 top-3.5 text-gray-500 dark:text-gray-700",`
- **Line 43**: `        "group-hover:text-gray-700 dark:group-hover:text-gray-500",`
- **Line 44**: `        "group-focus-within:!text-gray-900 dark:group-focus-within:!text-gray-50",`
- **Line 50**: `        "flex w-full bg-transparent pb-2 pl-8 pr-3 pt-3 text-[14px] font-normal leading-5 outline-none",`
- **Line 51**: `        "placeholder:text-gray-500 dark:placeholder:text-gray-700",`
- **Line 52**: `        "group-hover:placeholder:text-gray-700 dark:group-hover:placeholder:text-gray-500",`
- **Line 53**: `        "group-focus-within:placeholder:!text-gray-700 dark:group-focus-within:placeholder:!text-gray-300",`
- **Line 71**: `      "focus:outline-none",`
- **Line 104**: `      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",`
- **Line 121**: `      "text-[14px] leading-4 outline-none",`
- **Line 122**: `      "border-y-2 border-white dark:border-slate-600",`

## `./packages/design-system/src/ui/components/id-autocomplete/id-autocomplete-input-container.tsx`

- **Line 159**: `              className={cn("animate-spin text-gray-500 dark:text-gray-600")}`
- **Line 165**: `                <Icon name="Error" size={16} className={cn("text-red-900")} />`
- **Line 186**: `                    "focus-visible:outline-none [&_svg]:pointer-events-none",`
- **Line 194**: `                    className={cn("text-gray-500 dark:text-gray-600")}`

## `./packages/design-system/src/connect/components/revision-history/revision-history.tsx`

- **Line 87**: `    <hr className="h-12 border-none" />`
- **Line 104**: `        <div className="mt-4 flex justify-center rounded-md bg-slate-50 p-4">`
- **Line 114**: `            <h3 className="my-40 text-gray-600">`

## `./packages/design-system/src/connect/components/revision-history/header/header.tsx`

- **Line 36**: `        "flex items-center justify-between bg-transparent",`
- **Line 44**: `          className="shadow-button rounded-lg bg-gray-50 p-1 text-stone-300"`
- **Line 49**: `        <h1 className="text-xs">{title}</h1>`

## `./packages/design-system/src/connect/components/upload-file-item/components/status-row.tsx`

- **Line 33**: `      return "text-green-700";`
- **Line 38**: `      return "text-red-900";`
- **Line 40**: `      return "text-gray-900";`
- **Line 42**: `      return "text-gray-900";`
- **Line 80**: `        className={twMerge("text-xs leading-[18px]", getStatusColor(status))}`
- **Line 86**: `        <div className="text-xs font-medium leading-[18px] text-gray-900">`
- **Line 95**: `          className="text-xs leading-[18px] text-blue-900 hover:opacity-80"`

## `./packages/design-system/src/ui/components/id-autocomplete/id-autocomplete-list.tsx`

- **Line 85**: `                "h-full cursor-pointer border-y-0 p-0",`
- **Line 86**: `                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",`

## `./packages/design-system/src/ui/components/index.ts`

- **Line 30**: `export * from "./text-field/text-field.js";`
- **Line 31**: `export * from "./text-input/text-input-diff.js";`
- **Line 32**: `export * from "./text-input/text-input.js";`

## `./packages/design-system/src/connect/components/revision-history/header/scope.tsx`

- **Line 17**: `      containerClassName="bg-slate-50 text-gray-500 rounded-lg w-fit text-xs z-10"`
- **Line 19**: `      itemClassName="py-2 text-gray-500 grid grid-cols-[auto,auto] gap-1"`
- **Line 21**: `      menuClassName="min-w-0 text-gray-500"`

## `./packages/design-system/src/connect/components/upload-file-item/components/progress-bar.tsx`

- **Line 16**: `    <div className="h-2 w-full overflow-hidden rounded-sm bg-gray-200">`
- **Line 18**: `        className="h-full bg-blue-900 transition-all duration-300 ease-out"`

## `./packages/design-system/src/connect/components/remotes-inspector/remotes-inspector.tsx`

- **Line 216**: `        <h2 className="text-lg font-semibold text-gray-900">`
- **Line 223**: `                className="w-[260px] rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400"`
- **Line 234**: `                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"`
- **Line 245**: `            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"`
- **Line 256**: `        <div className="shrink-0 rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700">`
- **Line 261**: `      <div className="max-h-full overflow-auto rounded-lg border border-gray-300">`
- **Line 262**: `        <table className="w-full border-collapse">`
- **Line 263**: `          <thead className="sticky top-0 bg-gray-100">`
- **Line 277**: `                      "group px-3 py-2 text-left text-xs font-medium text-gray-600",`
- **Line 278**: `                      index > 0 && "border-l border-gray-300",`
- **Line 280**: `                        "cursor-pointer hover:bg-gray-200 hover:text-gray-900",`
- **Line 300**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 309**: `                  className="px-3 py-8 text-center text-sm text-gray-500"`
- **Line 319**: `                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"`
- **Line 321**: `                  <td className="px-3 py-2 text-xs text-gray-900">`
- **Line 326**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 331**: `                  <td className="border-l border-gray-300 px-3 py-2">`
- **Line 340**: `                      <span className="text-xs text-gray-400">-</span>`
- **Line 343**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 351**: `                  <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 359**: `                  <td className="border-l border-gray-300 px-3 py-2">`
- **Line 361**: `                      className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"`
- **Line 370**: `                    <td className="border-l border-gray-300 px-3 py-2">`
- **Line 374**: `                            className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"`
- **Line 384**: `                            className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"`
- **Line 401**: `      <div className="shrink-0 text-sm text-gray-600">`

## `./packages/design-system/src/connect/components/revision-history/header/doc-id.tsx`

- **Line 26**: `      className="flex h-8 w-fit items-center gap-1 rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-stone-300"`
- **Line 31**: `      <span className="text-gray-900">{docId}</span>`

## `./packages/design-system/src/connect/components/upload-file-item/components/header.tsx`

- **Line 45**: `          className="text-gray-600"`
- **Line 50**: `        <div className="text-xs font-medium leading-[18px] text-gray-900">`
- **Line 53**: `        <div className="text-xs font-medium leading-[18px] text-gray-500">`
- **Line 63**: `            className="flex h-[18px] w-[18px] items-center justify-center text-gray-600 hover:text-gray-800"`

## `./packages/design-system/src/connect/components/remotes-inspector/components/connection-state-badge.tsx`

- **Line 9**: `  connected: "bg-green-100 text-green-800",`
- **Line 10**: `  connecting: "bg-blue-100 text-blue-800",`
- **Line 11**: `  reconnecting: "bg-yellow-100 text-yellow-800",`
- **Line 12**: `  error: "bg-red-100 text-red-800",`
- **Line 13**: `  disconnected: "bg-gray-100 text-gray-600",`
- **Line 20**: `  const style = stateStyles[state] ?? "bg-gray-100 text-gray-600";`
- **Line 25**: `        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",`
- **Line 31**: `        <span className="text-[10px] opacity-75">({failureCount})</span>`

## `./packages/design-system/src/connect/components/remotes-inspector/components/mailbox-table.tsx`

- **Line 158**: `          className="flex items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-gray-900"`
- **Line 174**: `            className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"`
- **Line 185**: `        <div className="overflow-hidden rounded-lg border border-gray-300">`
- **Line 186**: `          <table className="w-full border-collapse">`
- **Line 187**: `            <thead className="sticky top-0 bg-gray-100">`
- **Line 197**: `                        "group cursor-pointer px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-200 hover:text-gray-900",`
- **Line 198**: `                        index > 0 && "border-l border-gray-300",`
- **Line 216**: `                    className="px-3 py-4 text-center text-sm text-gray-500"`
- **Line 226**: `                    className="odd:bg-white even:bg-gray-50 hover:bg-blue-50"`
- **Line 228**: `                    <td className="px-3 py-2 text-xs">`
- **Line 230**: `                        className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"`
- **Line 237**: `                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 242**: `                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 247**: `                    <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 256**: `                      <td className="border-l border-gray-300 px-3 py-2 text-xs">`
- **Line 258**: `                          className="block truncate text-red-600"`
- **Line 266**: `                        <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`
- **Line 272**: `                        <td className="border-l border-gray-300 px-3 py-2 text-xs text-gray-900">`

## `./packages/design-system/src/connect/components/remotes-inspector/components/channel-inspector.tsx`

- **Line 160**: `            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 167**: `          <h2 className="text-lg font-semibold text-gray-900">`
- **Line 173**: `            className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 184**: `        <div className="rounded border border-gray-200 bg-white p-4">`
- **Line 185**: `          <h3 className="mb-3 text-sm font-semibold text-gray-900">`
- **Line 188**: `          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">`
- **Line 208**: `                    ? "text-red-600"`
- **Line 209**: `                    : "text-green-600"`
- **Line 215**: `                <span className="ml-1 text-red-600">`
- **Line 225**: `        <div className="rounded border border-gray-200 bg-white p-4">`
- **Line 226**: `          <h3 className="mb-3 text-sm font-semibold text-gray-900">Poller</h3>`
- **Line 229**: `              <div className="text-sm text-gray-600">`
- **Line 233**: `                    pollerState.isPaused ? "text-yellow-600" : "text-green-600"`
- **Line 241**: `                  className="text-sm text-gray-600"`
- **Line 247**: `                  className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"`
- **Line 259**: `                <span className="text-sm text-gray-500">ms</span>`
- **Line 261**: `                  className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 272**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 280**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 288**: `                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 300**: `      <div className="rounded border border-gray-200 bg-white p-4">`
- **Line 301**: `        <h3 className="mb-3 text-sm font-semibold text-gray-900">`
- **Line 306**: `            <div className="flex items-center gap-3 text-sm text-gray-600">`
- **Line 312**: `                      ? "text-yellow-600"`
- **Line 313**: `                      : "text-green-600"`
- **Line 319**: `              <span className="font-mono text-sm text-gray-500">`
- **Line 327**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 335**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 343**: `                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 353**: `            <div className="flex items-center gap-3 text-sm text-gray-600">`
- **Line 359**: `                      ? "text-yellow-600"`
- **Line 360**: `                      : "text-green-600"`
- **Line 366**: `              <span className="font-mono text-sm text-gray-500">`
- **Line 374**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 382**: `                  className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"`
- **Line 390**: `                className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"`

## `./packages/design-system/src/connect/components/upload-file-item/components/error-details.tsx`

- **Line 20**: `    <div className="break-words text-xs leading-[18px] text-gray-500">`

## `./packages/design-system/src/ui/components/form-message/form-message.tsx`

- **Line 29**: `    error: "text-red-900 dark:text-red-900",`
- **Line 30**: `    info: "text-blue-900 dark:text-blue-900",`
- **Line 31**: `    warning: "text-yellow-900 dark:text-yellow-900",`
- **Line 35**: `    "mb-0 inline-flex items-center text-xs font-medium",`

## `./packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx`

- **Line 67**: `      className="border-l border-slate-100"`

## `./packages/design-system/src/ui/components/select-field/select-field.tsx`

- **Line 147**: `                "dark:border-charcoal-700 dark:bg-charcoal-900 rounded-md border border-gray-300 bg-white",`
- **Line 148**: `                "hover:border-gray-300 hover:bg-gray-100",`
- **Line 149**: `                "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-800",`
- **Line 150**: `                "dark:focus:ring-charcoal-300 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",`
- **Line 151**: `                "dark:focus-visible:ring-charcoal-300 focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0",`
- **Line 153**: `                  "!pointer-events-auto cursor-not-allowed bg-gray-50",`
- **Line 154**: `                  "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-900 hover:border-gray-300 hover:bg-gray-50",`

## `./packages/design-system/src/connect/components/cookie-banner/cookie-banner.tsx`

- **Line 44**: `  const buttonStyles = "min-w-64 h-8 text-base";`
- **Line 48**: `      <div className="text-center">{children}</div>`
- **Line 49**: `      <div className="my-8 flex gap-x-16 text-sm font-medium">`
- **Line 54**: `              className="mr-1 size-3 cursor-pointer rounded-sm border-2 border-gray-900 accent-gray-900 focus:outline-none"`

## `./packages/design-system/src/ui/components/select-field/selected-content.tsx`

- **Line 44**: `          <span className="text-[14px] font-normal leading-5 text-gray-600 dark:text-gray-500">`
- **Line 52**: `            className="cursor-pointer text-gray-700 dark:text-gray-400"`
- **Line 58**: `            className="cursor-pointer text-gray-700 dark:text-gray-400"`
- **Line 69**: `          "max-w-full truncate text-gray-900 dark:text-gray-50",`
- **Line 78**: `              <span className="truncate text-[14px] font-normal leading-5">`
- **Line 86**: `                "text-[14px] font-normal leading-5",`
- **Line 110**: `              className="cursor-pointer text-gray-700 dark:text-gray-400"`
- **Line 118**: `            className="cursor-pointer text-gray-700 dark:text-gray-400"`
- **Line 124**: `            className="cursor-pointer text-gray-700 dark:text-gray-400"`

## `./packages/design-system/src/connect/components/revision-history/skip/skip.tsx`

- **Line 17**: `      <div className="h-px rounded-full bg-slate-100" />`
- **Line 18**: `      <div className="mx-3 text-xs text-slate-100">`
- **Line 21**: `      <div className="h-px rounded-full bg-slate-100" />`

## `./packages/design-system/src/ui/components/form-message/message-list.tsx`

- **Line 30**: `    error: "before:bg-red-900 dark:before:bg-red-900",`
- **Line 31**: `    info: "before:bg-blue-900 dark:before:bg-blue-900",`
- **Line 32**: `    warning: "before:bg-orange-900 dark:before:bg-orange-900",`

## `./packages/design-system/src/connect/components/editor-action-buttons/editor-action-buttons.tsx`

- **Line 24**: `          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"`
- **Line 33**: `          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"`
- **Line 42**: `          className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900 disabled:cursor-not-allowed disabled:text-gray-500"`
- **Line 50**: `        className="grid size-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-900"`

## `./packages/design-system/src/ui/components/select-field/subcomponents/CommandItemList.tsx`

- **Line 29**: `        className={cn("text-gray-700 dark:text-gray-400")}`
- **Line 36**: `        className={cn("size-4", "text-gray-700 dark:text-gray-400")}`
- **Line 65**: `              "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",`
- **Line 67**: `                "!pointer-events-auto cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",`
- **Line 77**: `                    "border-gray-700 dark:border-gray-400",`
- **Line 79**: `                      "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black",`
- **Line 89**: `                      ? "border-gray-900 dark:border-gray-400"`
- **Line 90**: `                      : "border-gray-800 dark:border-gray-400",`
- **Line 91**: `                    "bg-transparent dark:bg-transparent",`
- **Line 95**: `                    <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900 dark:bg-gray-400" />`
- **Line 106**: `                      className="text-gray-900 dark:text-gray-50"`
- **Line 114**: `                "flex-1 truncate text-[14px] font-normal leading-4",`
- **Line 115**: `                "text-gray-700 dark:text-gray-500",`
- **Line 116**: `                opt.disabled && "text-gray-600 dark:text-gray-600",`
- **Line 128**: `                      className="text-gray-900 dark:text-gray-50"`

## `./packages/design-system/src/connect/components/revision-history/timeline/day.tsx`

- **Line 8**: `    <h2 className="-ml-6 flex items-center gap-1 bg-slate-50 py-2 text-xs text-slate-100">`

## `./packages/design-system/src/ui/components/select-field/content.tsx`

- **Line 63**: `          className="text-gray-900 dark:text-gray-50"`
- **Line 67**: `        <CommandEmpty className="p-4 text-center text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-400">`
- **Line 78**: `                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",`
- **Line 88**: `                      "border-gray-700 dark:border-gray-400",`
- **Line 90**: `                        "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black",`
- **Line 106**: `                            className="text-gray-900 dark:text-gray-50"`
- **Line 111**: `                <span className="text-[14px] font-semibold leading-4 text-gray-900 dark:text-gray-50">`
- **Line 123**: `                          className="text-gray-900 dark:text-gray-50"`
- **Line 147**: `            <div className="my-1 border-b border-gray-300 dark:border-gray-600" />`

## `./packages/design-system/src/connect/components/search-bar/filter-item.tsx`

- **Line 24**: `      <div className="text-sm font-semibold text-slate-200">{item.label}</div>`

## `./packages/design-system/src/ui/components/decorators.tsx`

- **Line 120**: `              className="cursor-pointer dark:text-gray-400"`

## `./packages/design-system/src/connect/components/search-bar/search-bar.tsx`

- **Line 55**: `      <div className="mr-2 text-sm font-semibold text-slate-200">`
- **Line 70**: `          "flex h-[52px] min-w-0 flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-slate-200 outline-none",`
- **Line 77**: `        <DropdownMenuTrigger className="ml-3 flex h-full flex-row items-center outline-none">`
- **Line 80**: `        <DropdownMenuContent className="rounded-xl border border-gray-100 bg-gray-50 p-2">`
- **Line 83**: `              className="h-10 cursor-pointer overflow-hidden rounded-lg hover:bg-gray-100"`

## `./packages/design-system/src/connect/components/folder-item/folder-item.tsx`

- **Line 77**: `      <div className="ml-3 max-h-6 truncate font-medium text-gray-600 group-hover:text-gray-800">`
- **Line 90**: `    "group flex h-12 cursor-pointer select-none items-center rounded-lg bg-gray-200 px-2",`
- **Line 91**: `    isDragging ? "opacity-60" : isDropTarget ? "bg-blue-100" : "",`
- **Line 126**: `              <Icon className="text-gray-600" name="VerticalDots" />`

## `./packages/design-system/src/ui/components/form-label/form-label.tsx`

- **Line 25**: `    "inline-flex items-center text-sm font-medium",`
- **Line 27**: `    `text-gray-900 ${inline ? "dark:text-gray-400" : "dark:text-gray-50"}`,`
- **Line 28**: `    hasError && "group-hover:!text-red-900 dark:group-hover:!text-red-900",`
- **Line 29**: `    hasError && inline && "text-red-800 dark:text-red-800",`
- **Line 30**: `    hasError && !inline && "text-red-900 dark:text-red-900",`
- **Line 32**: `      `cursor-not-allowed text-gray-700 ${`
- **Line 33**: `        inline ? "dark:text-gray-600" : "dark:text-gray-300"`
- **Line 36**: `      ? !disabled && "group-hover:text-gray-900 dark:group-hover:text-slate-50"`
- **Line 56**: `            "ml-1 text-gray-800 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-slate-50",`
- **Line 58**: `              `${inline ? "!text-red-800" : "!text-red-900"} group-hover:!text-red-900`,`
- **Line 72**: `                "ml-1 cursor-pointer text-gray-600 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-500",`
- **Line 73**: `                disabled && "text-gray-500",`

## `./packages/design-system/src/ui/components/button/button.tsx`

- **Line 10**: `    "whitespace-nowrap rounded-md text-sm font-medium",`
- **Line 12**: `    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",`
- **Line 21**: `          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",`
- **Line 22**: `        ghost: "hover:bg-accent hover:text-accent-foreground",`

## `./packages/design-system/src/connect/components/drop-zone/drop-zone.tsx`

- **Line 96**: `        <div className="fixed inset-0 z-[1000] flex min-h-screen w-screen items-center justify-center bg-black/50">`
- **Line 97**: `          <div className="rounded-[24px] bg-white p-6 shadow-[1px_4px_15px_rgba(74,88,115,0.25)]">`
- **Line 98**: `            <div className="relative flex h-[130px] w-[400px] flex-col items-center justify-start overflow-visible rounded-lg border border-dashed border-black px-4 py-6">`
- **Line 99**: `              <div className="text-center text-base leading-5 text-zinc-500">`
- **Line 102**: `              <div className="text-center text-base leading-5 text-zinc-500">`

## `./packages/design-system/src/ui/components/search-autocomplete/search-autocomplete.tsx`

- **Line 92**: `          className="max-w-xs text-gray-700"`
- **Line 97**: `          className="h-9 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"`
- **Line 115**: `            className="max-w-xs text-gray-700"`
- **Line 150**: `                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100"`
- **Line 156**: `                      <p className="truncate text-sm font-medium text-gray-900">`
- **Line 160**: `                        <p className="truncate text-xs text-gray-500">`
- **Line 165**: `                        <p className="truncate text-xs text-gray-500">`
- **Line 170**: `                        <p className="truncate text-xs text-gray-400">`
- **Line 181**: `                    <span className="shrink-0 rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">`
- **Line 188**: `                      className="shrink-0 rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"`
- **Line 199**: `      {loading && <p className="mt-1 text-xs text-gray-500">Searching...</p>}`
- **Line 200**: `      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}`
- **Line 206**: `          <p className="mt-1 text-xs text-gray-500">No results found</p>`

## `./packages/design-system/src/ui/components/character-counter/character-counter.tsx`

- **Line 7**: `  normal: "text-gray-500",`
- **Line 8**: `  warning: "text-yellow-900",`
- **Line 9**: `  error: "text-red-900",`
- **Line 13**: `  normal: "text-gray-300 dark:text-gray-700",`
- **Line 14**: `  warning: "text-yellow-400 dark:text-[#644E00]",`
- **Line 15**: `  error: "text-red-400 dark:text-[#7D3D37]",`
- **Line 27**: `    <div className="flex items-center text-[10px] leading-3">`

## `./packages/design-system/src/ui/components/popover/popover.tsx`

- **Line 21**: `          "data-[side=bottom]:animate-slide-in-from-top data-[side=left]:animate-slide-in-from-right",`
- **Line 22**: `          "data-[side=right]:animate-slide-in-from-left data-[side=top]:animate-slide-in-from-bottom",`
- **Line 23**: `          "w-(--radix-popover-trigger-width) z-50 border p-0 outline-none",`
- **Line 24**: `          "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",`
- **Line 25**: `          "rounded-md shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",`

## `./packages/design-system/src/connect/components/sidebar/sidebar-header.tsx`

- **Line 22**: `        "flex justify-center gap-4 border-b border-gray-300 py-4",`

## `./packages/design-system/src/connect/components/sidebar/sidebar-footer.tsx`

- **Line 40**: `        "flex flex-col gap-2 border-t border-gray-300 px-2 py-4",`
- **Line 48**: `          className="flex w-full cursor-pointer items-center justify-center outline-none"`
- **Line 51**: `          <Icon className="text-gray-600" name="ConnectSmall" size={24} />`
- **Line 59**: `          className="mt-3 flex w-full cursor-pointer items-center justify-center outline-none"`
- **Line 62**: `          <Icon className="text-gray-600" name="Tube" />`
- **Line 82**: `          "mt-3 flex w-full items-center justify-center outline-none",`
- **Line 87**: `        <Icon className="text-gray-600" name="Settings" />`
- **Line 88**: `        <span className="hidden text-sm font-semibold leading-6 text-gray-800">`

## `./packages/design-system/src/ui/components/input/input.tsx`

- **Line 12**: `  "flex h-9 w-full rounded-md text-sm font-normal leading-5 text-gray-900 dark:text-gray-50",`
- **Line 14**: `  "dark:border-charcoal-700 dark:bg-charcoal-900 border border-gray-300 bg-white",`
- **Line 18**: `  "font-sans placeholder:text-gray-500 dark:placeholder:text-gray-600",`
- **Line 20**: `  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0 focus-visible:ring-offset-white",`
- **Line 21**: `  "dark:focus-visible:ring-charcoal-300 dark:focus-visible:ring-offset-charcoal-900 dark:focus:bg-charcoal-900 focus:bg-gray-50",`
- **Line 24**: `  "disabled:border-gray-300 disabled:bg-gray-50 disabled:text-gray-700",`
- **Line 25**: `  "disabled:dark:border-charcoal-800 disabled:dark:bg-charcoal-900 disabled:dark:text-gray-300",`

## `./packages/design-system/src/ui/components/input/splitted-input-diff.tsx`

- **Line 7**: `import { TextDiff } from "./subcomponent/text-diff.js";`
- **Line 40**: `            "focus-visible:outline-none [&_svg]:pointer-events-none",`
- **Line 45**: `          <Icon name="Copy" size={16} className={cn("text-gray-500")} />`
- **Line 93**: `          <div className={cn("ml-3 mr-3 h-[34px] w-px bg-gray-300")} />`

## `./packages/design-system/src/ui/components/radio-group-field/radio.tsx`

- **Line 45**: `            "aspect-square size-4 rounded-full border border-gray-800 dark:border-gray-400",`
- **Line 46**: `            "hover:border-gray-900 dark:hover:border-gray-50",`
- **Line 48**: `              "cursor-not-allowed border-gray-600 hover:border-gray-600",`
- **Line 49**: `              "dark:border-gray-600 dark:hover:border-gray-600",`
- **Line 52**: `              "border-red-700 hover:border-red-900",`
- **Line 53**: `              "dark:border-red-700 dark:hover:border-red-900",`
- **Line 68**: `              "after:rounded-full after:bg-gray-800 after:content-['']",`
- **Line 69**: `              "dark:after:bg-gray-400",`
- **Line 71**: `                "group-hover:after:bg-gray-900",`
- **Line 72**: `                "dark:group-hover:after:bg-gray-50",`
- **Line 74**: `              disabled && ["after:bg-gray-600", "dark:after:bg-gray-600"],`
- **Line 83**: `                "peer-hover:text-gray-900 dark:peer-hover:text-gray-50",`

## `./packages/design-system/src/ui/components/input/subcomponent/input-diff.tsx`

- **Line 23**: `        "flex w-full items-center rounded-md font-sans text-sm font-normal leading-5 text-gray-700",`
- **Line 24**: `        "cursor-not-allowed border border-gray-300 bg-transparent px-3",`

## `./packages/design-system/src/ui/components/input/subcomponent/text-diff.tsx`

- **Line 33**: `        ? "bg-green-600/30"`
- **Line 35**: `          ? "bg-red-600/30"`
- **Line 40**: `    <span className={cn("leading-[18px] text-gray-700", bgColor, className)}>`
- **Line 47**: `                  "bg-green-600/30",`
- **Line 60**: `                  "bg-red-600/30",`

## `./packages/design-system/src/connect/components/tabs/tabs.tsx`

- **Line 19**: `        <List className="flex w-full gap-x-2 rounded-xl bg-slate-50 p-1 text-sm font-semibold text-gray-600 outline-none">`
- **Line 25**: `                className="data-[state='active']:tab-shadow ata-disabled:cursor-not-allowed data-disabled:text-gray-400 flex h-7 flex-1 items-center justify-center rounded-lg transition duration-300 data-[state='active']:bg-gray-50 data-[state='active']:text-gray-900"`
- **Line 36**: `      <div className="mt-3 min-h-0 flex-1 rounded-md bg-white">`

## `./packages/design-system/src/connect/components/sidebar/sidebar-login.tsx`

- **Line 18**: `          "group/sidebar-footer flex w-full items-baseline justify-start text-sm font-semibold leading-10 text-gray-600",`

## `./packages/design-system/src/connect/components/sidebar/sidebar-item.tsx`

- **Line 20**: `      className="border-none bg-gray-800 px-3 py-2 text-sm text-white"`
- **Line 24**: `          "group/sidebar-item relative flex cursor-pointer flex-col items-center justify-center text-center text-sm text-black",`
- **Line 26**: `          active && "bg-white",`
- **Line 32**: `          <div className="absolute left-0 top-1/2 h-10 w-1 -translate-y-1/2 rounded-r-sm bg-violet-400" />`
- **Line 34**: `          <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-sm bg-zinc-300 opacity-0 transition-opacity group-hover/sidebar-item:opacity-100" />`
- **Line 38**: `            <div className="flex size-8 items-center justify-center rounded-lg bg-black">`
- **Line 39**: `              <span className="text-sm font-medium text-white">`

## `./packages/design-system/src/connect/components/disclosure/disclosure.tsx`

- **Line 28**: `          "flex cursor-pointer justify-between text-gray-500",`
- **Line 33**: `        <h2 className="font-semibold text-inherit">{title}</h2>`

## `./packages/design-system/src/connect/constants/options.tsx`

- **Line 66**: `    icon: <Icon className="text-orange-900" name="Plus" size={16} />,`
- **Line 70**: `    icon: <Icon className="text-orange-900" name="Xmark" size={16} />,`
- **Line 74**: `    icon: <Icon className="text-orange-900" name="Exclamation" size={16} />,`
- **Line 90**: `    className: "text-red-900",`

## `./packages/vetra/editors/vetra-drive-app/components/ShareMenuItem.tsx`

- **Line 31**: `      <span className="text-xs text-gray-500">{label}</span>`
- **Line 42**: `            className="w-[300px] truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 underline outline-none"`
- **Line 45**: `            <div className="absolute left-0 top-full z-20 mt-1 max-w-md break-all rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg">`
- **Line 52**: `          className="rounded p-1 transition-colors hover:bg-gray-100"`

## `./packages/vetra/editors/vetra-drive-app/components/DataIntegrationsColumn.tsx`

- **Line 30**: `      <h3 className="mb-4 text-sm font-normal text-gray-700">`
- **Line 33**: `      <div className="rounded-md border border-zinc-200 bg-zinc-50">`
- **Line 39**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`
- **Line 54**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`
- **Line 72**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`

## `./packages/vetra/editors/vetra-drive-app/components/ModuleAccordion.tsx`

- **Line 30**: `      className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-gray-50 ${headerClassName}`}`
- **Line 36**: `          className={`text-gray-600 transition-transform duration-300 ${`
- **Line 40**: `        <span className="text-sm font-medium text-gray-700">{title}</span>`
- **Line 41**: `        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">`
- **Line 50**: `        className="rounded p-1 transition-colors hover:bg-gray-200"`
- **Line 52**: `        <PlusIcon width={16} height={16} className="text-gray-600" />`

## `./packages/vetra/editors/vetra-drive-app/components/DriveHeader.tsx`

- **Line 80**: `    <div className="bg-gray-50 px-6 py-4">`
- **Line 84**: `          <h1 className="text-lg font-semibold text-gray-900">`
- **Line 91**: `              className="rounded-full p-1 transition-colors hover:bg-gray-100"`
- **Line 94**: `              <InfoIcon className="text-gray-500" />`
- **Line 99**: `                className="absolute left-0 top-full z-10 mt-2 flex flex-col items-start gap-2 rounded-lg bg-white p-3 shadow-lg"`
- **Line 111**: `                className="rounded-full p-1 transition-colors hover:bg-gray-100"`
- **Line 119**: `                  className="absolute left-0 top-full z-10 mt-2 flex w-max flex-col gap-4 rounded-lg bg-white p-4 shadow-lg"`
- **Line 135**: `          className="flex items-center gap-2 text-sm text-gray-900 underline transition-colors hover:text-gray-700"`

## `./packages/vetra/editors/vetra-drive-app/components/Accordion.tsx`

- **Line 58**: `        className="w-full cursor-pointer text-left focus:outline-none"`

## `./packages/vetra/editors/vetra-drive-app/components/NewModuleItem.tsx`

- **Line 20**: `      className={`flex w-full items-center gap-3 rounded-md bg-zinc-100 p-1 text-left transition-colors hover:bg-zinc-200 ${className}`}`
- **Line 26**: `        <h3 className="truncate text-sm font-medium text-gray-900">{title}</h3>`
- **Line 27**: `        <p className="truncate text-xs text-gray-500">{subtitle}</p>`

## `./packages/vetra/editors/vetra-drive-app/components/ModuleList.tsx`

- **Line 24**: `        <div key={index} className="px-2 py-1 text-sm text-gray-600">`
- **Line 32**: `      <div className="px-2 py-1 text-sm text-gray-600">`

## `./packages/vetra/editors/vetra-drive-app/components/SectionAccordion.tsx`

- **Line 24**: `    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 transition-colors hover:bg-zinc-100">`
- **Line 28**: `        className={`text-gray-600 transition-transform duration-300 ${`
- **Line 32**: `      <h2 className="text-base font-semibold text-gray-800">{title}</h2>`

## `./packages/vetra/editors/vetra-drive-app/components/DriveInfoItem.tsx`

- **Line 34**: `      className="flex h-8 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-50 pl-1 pr-2 text-xs text-stone-300"`
- **Line 39**: `      <span className="text-gray-900">{value}</span>`

## `./packages/vetra/editors/vetra-drive-app/components/UserExperiencesColumn.tsx`

- **Line 26**: `      <h3 className="mb-4 text-sm font-normal text-gray-700">`
- **Line 29**: `      <div className="rounded-md border border-zinc-200 bg-zinc-50">`
- **Line 35**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`
- **Line 50**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`

## `./packages/vetra/editors/vetra-drive-app/components/ModuleItem.tsx`

- **Line 75**: `        "group flex w-full cursor-pointer items-center gap-3 rounded-md bg-zinc-100 p-1 text-left transition-colors hover:bg-zinc-200",`
- **Line 83**: `        <h3 className="truncate text-sm font-medium text-gray-900">`
- **Line 86**: `        <p className="truncate text-xs text-gray-500">`
- **Line 96**: `          menuClassName="border-zinc-200"`
- **Line 108**: `            <Icon className="text-gray-600" name="VerticalDots" />`

## `./packages/vetra/editors/vetra-drive-app/components/DocumentModelsColumn.tsx`

- **Line 23**: `      <h3 className="mb-4 text-sm font-normal text-gray-700">`
- **Line 26**: `      <div className="rounded-md border border-zinc-200 bg-zinc-50">`
- **Line 35**: `          headerClassName="m-4 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-md"`

## `./packages/vetra/editors/processor-editor/components/ProcessorEditorForm.tsx`

- **Line 108**: `        <h2 className="text-lg font-medium text-gray-900">`
- **Line 121**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 131**: `          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${`
- **Line 132**: `            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""`
- **Line 142**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 151**: `          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${`
- **Line 152**: `            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""`
- **Line 165**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 190**: `              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 208**: `                <span className="text-sm text-gray-700">`
- **Line 214**: `                    className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"`
- **Line 228**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 267**: `                <span key={processorApp} className="text-sm text-gray-700">`
- **Line 280**: `            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"`

## `./packages/vetra/editors/subgraph-editor/components/SubgraphEditorForm.tsx`

- **Line 49**: `        <h2 className="text-lg font-medium text-gray-900">`
- **Line 62**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 72**: `          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${`
- **Line 73**: `            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""`
- **Line 85**: `            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"`

## `./packages/vetra/editors/components/StatusPill.tsx`

- **Line 9**: `      className={`rounded-full px-3 py-1 text-xs font-medium ${`
- **Line 11**: `          ? "bg-green-100 text-green-800"`
- **Line 12**: `          : "bg-yellow-100 text-yellow-800"`

## `./packages/vetra/editors/processor-editor/editor.tsx`

- **Line 75**: `    <div className="bg-gray-50 p-6">`

## `./packages/vetra/editors/vetra-drive-app/components/PackageInformationSection.tsx`

- **Line 23**: `      className="my-2 h-[200px] w-full rounded-md border border-dashed border-zinc-200 bg-zinc-50"`
- **Line 37**: `        className="flex items-center justify-center rounded p-1 text-gray-600 transition-colors hover:bg-zinc-200 hover:text-gray-800"`

## `./packages/vetra/editors/subgraph-editor/editor.tsx`

- **Line 29**: `    <div className="bg-gray-50 p-6">`

## `./packages/vetra/editors/document-editor/components/DocumentEditorForm.tsx`

- **Line 26**: `      className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 133**: `        <h2 className="text-lg font-medium text-gray-900">`
- **Line 146**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 156**: `          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${`
- **Line 157**: `            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""`
- **Line 166**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 184**: `                <span className="text-sm text-gray-700">`
- **Line 193**: `                    className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"`
- **Line 210**: `            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"`

## `./packages/vetra/editors/vetra-drive-app/editor.tsx`

- **Line 91**: `      className="bg-gray-50 p-6 after:pointer-events-none after:absolute after:inset-0 after:bg-blue-500 after:opacity-0 after:transition after:content-['']"`

## `./packages/vetra/editors/document-editor/editor.tsx`

- **Line 49**: `    <div className="bg-gray-50 p-6">`

## `./packages/vetra/editors/vetra-package/editor.tsx`

- **Line 107**: `    <div className="bg-gray-50 p-6">`

## `./packages/vetra/editors/vetra-package/components/MetaForm.tsx`

- **Line 76**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 85**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 93**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 102**: `            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 113**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 125**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 142**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 151**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 159**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 168**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 176**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 199**: `              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 201**: `            <div className="flex min-h-[80px] flex-wrap gap-2 rounded-md border border-gray-300 p-3">`
- **Line 205**: `                  className="inline-flex items-center rounded border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs text-blue-800"`
- **Line 213**: `                    className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"`
- **Line 230**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 239**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 247**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 256**: `            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 264**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 273**: `            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"`
- **Line 281**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 290**: `            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"`
- **Line 298**: `            className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 307**: `            className="w-full cursor-not-allowed rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"`

## `./packages/vetra/editors/app-editor/components/EditName.tsx`

- **Line 43**: `          className="p-1 text-lg font-semibold text-gray-900"`
- **Line 50**: `          <button type="submit" className="text-sm text-gray-600">`
- **Line 54**: `            className="text-sm text-red-800"`
- **Line 65**: `      <h2 className="text-lg font-semibold text-gray-900">`
- **Line 69**: `        className="text-sm text-gray-600"`

## `./packages/vetra/editors/app-editor/components/AppEditorForm.tsx`

- **Line 130**: `        <h2 className="text-lg font-medium text-gray-900">App Configuration</h2>`
- **Line 141**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 151**: `          className={`w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 ${`
- **Line 152**: `            isReadOnly ? "cursor-not-allowed bg-gray-100" : ""`
- **Line 162**: `          className="mb-2 block text-sm font-medium text-gray-700"`
- **Line 170**: `              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"`
- **Line 203**: `                  <span className="text-sm text-gray-700">{type}</span>`
- **Line 207**: `                      className="ml-2 text-gray-400 hover:text-gray-600 focus:outline-none"`
- **Line 215**: `              <span className="text-sm text-gray-700">All documents (*)</span>`
- **Line 223**: `        <h3 className="text-md mb-4 font-medium text-gray-900">`
- **Line 236**: `              className={`mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${`
- **Line 240**: `            <span className="text-sm font-medium text-gray-700">`
- **Line 253**: `            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"`

## `./packages/vetra/editors/app-editor/editor.tsx`

- **Line 10**: `    <div className="bg-gray-50 p-6">`
