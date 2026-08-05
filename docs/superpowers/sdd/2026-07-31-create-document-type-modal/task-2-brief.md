### Task 2: Footer rewrite in the generic drive explorer

**Files:**
- Modify: `packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx` (full rewrite, final content below)

**Interfaces:**
- Consumes: `CreateDocumentWithTypeModal`, `DocumentTypeOption` from `@powerhousedao/design-system/connect` (Task 1); `addDocument`, `setSelectedNode`, `useSelectedDriveSafe`, `useSelectedFolder`, `useParentFolderForSelectedNode`, `preloadEditorModule`, and the existing hooks from `@powerhousedao/reactor-browser`.
- Produces: the `CreateDocument` footer component (same export name; consumed unchanged by `../editor.tsx`).

No unit test in this package: it has no DOM test infrastructure (no happy-dom,
no @testing-library — its tests are node-env document-model tests), and adding
that infra for one component is out of scope. Behavioral coverage lives in the
Task 1 component tests and the Task 3 e2e specs.

- [ ] **Step 1: Replace the file content**

The file currently contains the button-grid version plus temporary fake-model
scaffolding (`__fake-document-models.ts` import and spread) — the scaffolding
MUST survive the rewrite. Replace the entire file with:

```tsx
import { PowerhouseButton } from "@powerhousedao/design-system";
import type { DocumentTypeOption } from "@powerhousedao/design-system/connect";
import { CreateDocumentWithTypeModal } from "@powerhousedao/design-system/connect";
import {
  addDocument,
  preloadEditorModule,
  setSelectedNode,
  useAllowedDocumentModelModules,
  useDisabledEditors,
  useEditorModules,
  useParentFolderForSelectedNode,
  useSelectedDriveSafe,
  useSelectedFolder,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { useState } from "react";
// TEMP(dev): remove together with __fake-document-models.ts.
import {
  fakeDocumentModelModules,
  isFakeDocumentModelsEnabled,
} from "./__fake-document-models.js";

function toDocumentTypeOption(doc: DocumentModelModule): DocumentTypeOption {
  const spec = doc.documentModel.global;
  return {
    documentType: spec.id,
    name: spec.name,
    version: doc.version,
    description: spec.description,
  };
}

export function CreateDocument() {
  const [showModal, setShowModal] = useState(false);
  const { isAllowedToCreateDocuments } = useUserPermissions();
  // Respect Connect config: allowedDocumentTypes (allowlist) via the hook,
  // disabledEditors (denylist) subtracted below.
  const allowedDocumentModelModules = useAllowedDocumentModelModules();
  const editorModules = useEditorModules();
  const disabledEditors = useDisabledEditors() ?? [];
  const [selectedDrive] = useSelectedDriveSafe();
  const selectedFolder = useSelectedFolder();
  const parentFolder = useParentFolderForSelectedNode();
  // Drive containers are never documents-in-a-drive; hide them structurally so
  // this shared editor can't fail open when disabledEditors is unset.
  const DRIVE_CONTAINER_TYPES = [
    "powerhouse/document-drive",
    "powerhouse/reactor-drive",
  ];
  const filteredDocumentModelModules = allowedDocumentModelModules?.filter(
    (module) => {
      const id = module.documentModel.global.id;
      return (
        !DRIVE_CONTAINER_TYPES.includes(id) && !disabledEditors.includes(id)
      );
    },
  );
  // TEMP(dev): remove together with __fake-document-models.ts. Off unless
  // localStorage["ph:fakeDocModels"] === "1", so default behaviour is unchanged.
  const visibleDocumentModelModules = isFakeDocumentModelsEnabled()
    ? [...(filteredDocumentModelModules ?? []), ...fakeDocumentModelModules]
    : filteredDocumentModelModules;
  const preloadEditorsForType = (documentType: string) =>
    editorModules
      ?.filter((editorModule) =>
        editorModule.documentTypes.includes(documentType),
      )
      .forEach((editorModule) => {
        void preloadEditorModule(editorModule);
      });
  const handleCreate = async ({
    name,
    documentType,
  }: {
    name: string;
    documentType: string;
    version?: number;
  }) => {
    // version is display-only for now: addDocument has no version parameter,
    // the reactor resolves the latest module for the type (spec section 5).
    setShowModal(false);
    if (!selectedDrive) return;
    try {
      const node = await addDocument(
        selectedDrive.header.id,
        name,
        documentType,
        selectedFolder?.id ?? parentFolder?.id,
      );
      setSelectedNode(node);
    } catch (error) {
      console.error("Failed to create document:", error);
    }
  };
  if (!isAllowedToCreateDocuments) return null;
  if (!visibleDocumentModelModules?.length) return null;
  return (
    <div className="px-6 py-4">
      <PowerhouseButton onClick={() => setShowModal(true)}>
        Create New Document
      </PowerhouseButton>
      <CreateDocumentWithTypeModal
        documentTypes={visibleDocumentModelModules.map(toDocumentTypeOption)}
        onCreate={(input) => void handleCreate(input)}
        onOpenChange={setShowModal}
        onTypeSelected={preloadEditorsForType}
        open={showModal}
      />
    </div>
  );
}
```

Behavioral notes locked by the spec:

- The `"New document"` heading is gone; empty filtered list now renders
  `null` (previously an orphaned heading).
- Editor preloading moved from button-hover to select-change via
  `onTypeSelected`.
- `showCreateDocumentModal` (PHModal flow) is no longer imported here; the
  other callers of that flow are untouched.

- [ ] **Step 2: Typecheck both packages**

```bash
cd /home/p/Powerhouse/powerhouse && npx tsc --build packages/powerhouse-vetra-packages
```

Expected: exit 0.

- [ ] **Step 3: Run the package's existing tests (regression only)**

```bash
cd /home/p/Powerhouse/powerhouse && pnpm --filter @powerhousedao/powerhouse-vetra-packages test
```

Expected: PASS (document-model tests; nothing here touches them, this is a regression gate).

- [ ] **Step 4: Commit**

```bash
cd /home/p/Powerhouse/powerhouse
git add packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/create-document.tsx
git commit -m "feat(powerhouse-vetra-packages): replace document-type button grid with Create New Document modal"
```

---

