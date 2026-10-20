import {
  DRIVE_DOCUMENT_TYPES,
  useVetraPackageManager,
  useVetraPackages,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentModelLib,
  EditorModule,
} from "@powerhousedao/shared/document-model";
import type { ReactNode } from "react";

const SOURCE_LABELS: Record<string, string> = {
  common: "built-in",
  project: "project",
  "local-install": "local",
  "registry-install": "registry",
};

const isDriveApp = (editor: EditorModule) =>
  editor.documentTypes.some((type) =>
    (DRIVE_DOCUMENT_TYPES as readonly string[]).includes(type),
  );

/** A package's document models by type, with every version it ships. */
function modelsOf(pkg: DocumentModelLib) {
  const byType = new Map<string, { name: string; versions: number[] }>();
  for (const model of pkg.documentModels) {
    const { id, name } = model.documentModel.global;
    const entry = byType.get(id) ?? { name, versions: [] };
    entry.versions.push(model.version ?? 1);
    byType.set(id, entry);
  }
  return [...byType].map(([type, { name, versions }]) => ({
    type,
    name,
    versions: versions.sort((a, b) => a - b),
  }));
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-core-muted uppercase">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

const cell = "py-1 pr-4 align-top break-words";

function EditorTable(props: { label: string; editors: EditorModule[] }) {
  return (
    <table
      aria-label={props.label}
      className="w-full table-fixed border-collapse text-sm"
    >
      <tbody>
        {props.editors.map((editor) => (
          <tr key={editor.config.id} className="border-t border-core-border/50">
            <td className={`${cell} w-1/3`}>{editor.config.name}</td>
            <td className={`${cell} w-1/3 font-mono text-core-muted`}>
              {editor.config.id}
            </td>
            <td className={`${cell} font-mono`}>
              {editor.documentTypes.join(", ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PackageEntry({ pkg }: { pkg: DocumentModelLib }) {
  const manager = useVetraPackageManager();
  const name = pkg.manifest.name;
  const version = manager?.getPackageVersion(name);
  const source = manager?.getPackageSource(name);
  const models = modelsOf(pkg);
  const apps = pkg.editors.filter(isDriveApp);
  const editors = pkg.editors.filter((editor) => !isDriveApp(editor));
  return (
    <li
      aria-label={name}
      className="rounded border border-core-border px-4 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-semibold">{name}</h2>
        {version && (
          <span className="font-mono text-sm text-core-muted">{version}</span>
        )}
        {source && (
          <span className="rounded border border-core-border px-1.5 text-xs text-core-muted">
            {SOURCE_LABELS[source] ?? source}
          </span>
        )}
      </div>
      {models.length > 0 && (
        <Section title="Document models">
          <table
            aria-label={`${name} document models`}
            className="w-full table-fixed border-collapse text-sm"
          >
            <tbody>
              {models.map((model) => (
                <tr key={model.type} className="border-t border-core-border/50">
                  <td className={`${cell} w-1/3`}>{model.name}</td>
                  <td className={`${cell} w-1/3 font-mono`}>{model.type}</td>
                  <td className={`${cell} text-core-muted`}>
                    {model.versions.map((v) => `v${v}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {editors.length > 0 && (
        <Section title="Editors">
          <EditorTable label={`${name} editors`} editors={editors} />
        </Section>
      )}
      {apps.length > 0 && (
        <Section title="Drive apps">
          <EditorTable label={`${name} drive apps`} editors={apps} />
        </Section>
      )}
    </li>
  );
}

/** Core's Packages tab: the loaded packages, their document models, editors and drive apps. */
export function PackagesTab() {
  const packages = useVetraPackages();
  return (
    <div className="w-full max-w-3xl">
      {packages.length === 0 ? (
        <p className="text-core-muted">No packages are loaded.</p>
      ) : (
        <ul aria-label="Packages" className="flex flex-col gap-3">
          {packages.map((pkg, index) => (
            <PackageEntry key={`${pkg.manifest.name}:${index}`} pkg={pkg} />
          ))}
        </ul>
      )}
    </div>
  );
}
