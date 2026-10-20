import type { ReactNode } from "react";

/** `YYYY-MM-DD HH:mm` in UTC, as a server index lists it; "-" when unknown. */
export function formatModified(iso: string | undefined) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

/** An "Index of" page: a title above a name / type / last modified table. */
export function IndexTable(props: {
  title: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="p-6 font-mono text-sm text-core-fg">
      <h1 className="mb-4 text-xl font-semibold">{props.title}</h1>
      <table aria-label={props.label} className="w-full border-collapse">
        <thead>
          <tr className="border-b border-core-border text-left text-core-muted">
            <th className="py-1 pr-6 font-normal">Name</th>
            <th className="py-1 pr-6 font-normal">Type</th>
            <th className="py-1 font-normal">Last modified</th>
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

export function IndexRow(props: {
  name: ReactNode;
  type: ReactNode;
  modified: ReactNode;
}) {
  return (
    <tr className="border-b border-core-border/50 hover:bg-core-hover">
      <td className="py-1 pr-6">{props.name}</td>
      <td className="py-1 pr-6 text-core-muted">{props.type}</td>
      <td className="py-1 whitespace-nowrap text-core-muted">
        {props.modified}
      </td>
    </tr>
  );
}

export const linkClass = "text-core-link underline-offset-2 hover:underline";
