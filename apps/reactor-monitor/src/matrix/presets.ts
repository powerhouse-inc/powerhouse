import { LADDER, STORAGE_KINDS, type FeatureFlag } from "./builtins.js";
import {
  attachMode,
  type Attach,
  type Axis,
  type AxisValue,
  type Setter,
} from "./schema.js";

/** L0 sets no flag; Ln turns on the first n rungs. */
export function ladderFlags(rung: number): Record<FeatureFlag, boolean> {
  return Object.fromEntries(
    LADDER.map((flag, index) => [flag, index < rung]),
  ) as Record<FeatureFlag, boolean>;
}

function value(
  key: string,
  label: string,
  fields: Partial<Omit<AxisValue, "key" | "label">>,
): AxisValue {
  return {
    key,
    label,
    setters: [],
    env: {},
    requires: [],
    expect: {},
    ...fields,
  };
}

/** The auth ladder through `reactor.protocol.featureFlags`, never env. */
export function authLadderAxis(
  options: { subjects?: readonly string[]; rungs?: readonly number[] } = {},
): Axis {
  const subjects = options.subjects ?? ["host"];
  const rungs =
    options.rungs ?? LADDER.map((_, index) => index).concat(LADDER.length);
  return {
    key: "auth",
    label: "Auth ladder",
    values: rungs.map((rung) =>
      value(
        `l${rung}`,
        rung === 0 ? "L0 no flags" : `L${rung} ${LADDER[rung - 1]}`,
        {
          setters: subjects.map((subject) => ({
            path: `${subject}.reactor.protocol.featureFlags`,
            value: ladderFlags(rung),
          })),
        },
      ),
    ),
  };
}

/** The switchboard's executor pool, through REACTOR_WORKERS. */
export function workersAxis(
  options: { counts?: readonly number[] } = {},
): Axis {
  const counts = options.counts ?? [0, 2];
  return {
    key: "workers",
    label: "Workers",
    values: counts.map((count) =>
      value(`w${count}`, `${count} workers`, {
        env: { REACTOR_WORKERS: String(count) },
      }),
    ),
  };
}

const ENGINE: Record<string, "pglite" | "postgres"> = {
  idb: "pglite",
  memory: "pglite",
  path: "pglite",
  postgres: "postgres",
};

/** The kinds the attach mode offers; postgres drops the base's own location. */
export function storageAxis(
  options: {
    attach?: Attach;
    subjects?: readonly string[];
    backend?: string;
  } = {},
): Axis {
  const attach = options.attach ?? "remote";
  const subjects = options.subjects ?? ["host"];
  const backend = options.backend ?? "main";
  const kinds = STORAGE_KINDS[attachMode(attach)];
  // A spawned switchboard stores in-process; a browser cell as it attaches.
  const backendKind = attach === "remote" ? "in-process" : attach;
  return {
    key: "storage",
    label: "Storage",
    values: kinds.map((kind) => {
      const setters: Setter[] = subjects.flatMap((subject) => {
        const at = `${subject}.reactor.backends.${backend}`;
        const drop: Setter[] =
          kind === "path"
            ? [{ path: `${at}.storage.url`, value: { $delete: true } }]
            : [
                { path: `${at}.storage.dataDir`, value: { $delete: true } },
                { path: `${at}.storage.url`, value: { $delete: true } },
              ];
        return [
          { path: `${at}.kind`, value: backendKind },
          { path: `${at}.storage.kind`, value: kind },
          ...drop,
        ];
      });
      return value(kind, kind, {
        setters,
        requires: kind === "postgres" ? ["postgres"] : [],
        expect: { storageEngine: ENGINE[kind] },
      });
    }),
  };
}
