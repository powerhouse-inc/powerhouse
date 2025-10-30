---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/DriveContents.tsx"
unless_exists: true
---
import { CreateDocument } from "./CreateDocument.js";
import { EmptyState } from "./EmptyState.js";
import { Files } from "./Files.js";
import { Folders } from "./Folders.js";
import { NavigationBreadcrumbs } from "./NavigationBreadcrumbs.js";

/** Shows the documents and folders in the selected drive */
export function DriveContents() {
  return (
    <div className="space-y-6 px-6">
      <NavigationBreadcrumbs />
      <Folders />
      <Files />
      <EmptyState />
      <CreateDocument />
    </div>
  );
}

