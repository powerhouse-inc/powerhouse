// Where a Connect keeps its drives: in the browser or on a switchboard. Browser-safe.
import { switchboardOfDrive } from "@powerhousedao/host-core/schema";
import {
  freshKey,
  isRecord,
  valueAt,
  type Member,
  type MemberBackend,
} from "./members.js";
import type { Setter } from "./schema.js";

export const REACH_REASONS = {
  compound:
    "Only a host with several reactors can link Connect to a switchboard. Make it a host with several reactors first.",
  noSwitchboard: "This host has no switchboard to link to. Add one first.",
  oneLocal:
    "Connect runs one reactor in the browser. Remove the other one first.",
  lastOne:
    "Connect needs somewhere to keep drives: in this browser or on a switchboard.",
  notDrive:
    "Connect opens a switchboard through one of its drives. Pick a drive.",
  sameSwitchboard:
    "Both links open drives on the same switchboard. Add the second drive to the first link instead.",
  remoteOnly:
    "This app keeps no reactor in the browser, so every drive opens on the switchboard.",
  mapped:
    "This drive list comes from the switchboard when it starts. Place its drives in Router after starting.",
  switchboardMapped:
    "This switchboard's drives are only known once it starts, so a drive can't be added here.",
  noName: "Give the drive a name.",
  nameLetters: "Use at least one letter or digit in the drive's name.",
  nameTaken: (name: string) =>
    `This host already has a drive called ${name}. Choose another name.`,
  addressTaken: (name: string) =>
    `${name} would get the same address as another drive in this host. Choose another name.`,
  clash: (slug: string) =>
    `This app already has its own drive called ${slug}. Remove it, or link a drive with another name.`,
  noBackend: (backend: string) =>
    `This app no longer has ${backend}. Start it again to route its reactors.`,
  localDrive: "Only a drive on a switchboard can open there without a copy.",
  otherSwitchboard: (slug: string, switchboard: string) =>
    `${slug} is a drive on ${switchboard}. It can open there, or be copied into this browser.`,
} as const;

/** The drive a switchboard serves when it declares none. */
const DEFAULT_DRIVE = "powerhouse";
const DEFAULT_DRIVE_NAME = "Powerhouse";

const LOCAL_KINDS = new Set(["in-process", "worker"]);

/** The browser reactor "Keep drives in this browser" adds. */
export const BROWSER_BACKEND = {
  kind: "worker",
  storage: { kind: "idb" },
} as const;

type Target = {
  /** A member key or a literal switchboard base: one per switchboard. */
  id?: string;
  /** The switchboard member's key, when the link names one. */
  member?: string;
  /** The member key, else the folder or base the link names. */
  label: string;
  /** The drive, when the link names one. */
  slug?: string;
  /** Known before the host runs: a literal url or an `$output`. */
  knowable: boolean;
};

/** The member a `$output` names: by key, else the one child running the folder. */
function producer(
  ref: Record<string, unknown>,
  members: readonly Member[],
): Member | undefined {
  if (typeof ref.member === "string") {
    return members.find((member) => member.key === ref.member);
  }
  const running = members.filter((member) => member.folder === ref.host);
  return running.length === 1 ? running[0] : undefined;
}

/** What a remote url opens; `slug` is undefined unless it names a drive. */
export function targetOf(url: unknown, members: readonly Member[]): Target {
  if (typeof url === "string") {
    const drive = switchboardOfDrive(url);
    return drive
      ? {
          id: `base:${drive.base}`,
          label: drive.base,
          slug: drive.slug,
          knowable: true,
        }
      : { label: url, knowable: true };
  }
  const ref = isRecord(url) && isRecord(url.$output) ? url.$output : undefined;
  if (!ref) return { label: "another server", knowable: false };
  const member = producer(ref, members);
  const path = Array.isArray(ref.path) ? (ref.path as unknown[]) : [];
  const slug =
    path.length === 3 &&
    path[0] === "drives" &&
    typeof path[1] === "string" &&
    path[2] === "url"
      ? path[1]
      : undefined;
  return {
    ...(member ? { id: `member:${member.key}`, member: member.key } : {}),
    label: member?.key ?? String(ref.host),
    ...(slug === undefined ? {} : { slug }),
    knowable: true,
  };
}

export type DriveLink = {
  slug: string;
  /** The switchboard, by member key or address. */
  switchboard: string;
  /** The switchboard member, when the link names one. */
  member?: string;
  /** The remote backend the drive opens through, if there is one. */
  backend?: MemberBackend;
  /** The backend's own link, or a `reactor.drives` entry. */
  source: { kind: "backend" } | { kind: "drive"; index: number };
  /** Opens on the switchboard with no copy in this browser. */
  remoteOnly: boolean;
  /** Envelope path of the link's url. */
  at: string;
};

export type ConnectReach = {
  member: Member;
  /** In-browser reactors. */
  local: MemberBackend[];
  /** No backends declared: Connect keeps its own default reactor. */
  implicitLocal: boolean;
  links: DriveLink[];
  /** The drive list is filled in when the host starts. */
  mappedDrives: boolean;
  /** Drives this Connect keeps itself, by slug. */
  ownDrives: string[];
  /** Drives can be copied into this browser. */
  keepsCopy: boolean;
  /** Switchboards of this host a drive can be added to. */
  switchboards: { path: string; key: string }[];
  /** Plain-language notes about the whole card. */
  notes: string[];
};

function driveList(member: Member): unknown[] | undefined {
  const drives = member.reactor?.drives;
  return Array.isArray(drives) ? drives : undefined;
}

function placedDrives(member: Member): Record<string, unknown> {
  const drives = valueAt(member.reactor, ["placement", "drives"]);
  return isRecord(drives) ? drives : {};
}

/** The card for one Connect member. */
export function connectReach(
  member: Member,
  members: readonly Member[],
): ConnectReach {
  const local = member.backends.filter(
    (backend) => backend.kind !== undefined && LOCAL_KINDS.has(backend.kind),
  );
  const remotes = member.backends.filter(
    (backend) => backend.kind === "remote",
  );
  const implicitLocal = !isRecord(member.reactor?.backends);
  const placed = placedDrives(member);
  const keepsCopy = local.length > 0 || implicitLocal;
  const links: DriveLink[] = [];
  const homes = new Map<string, MemberBackend>();
  for (const backend of remotes) {
    const target = targetOf(valueAt(backend.body, ["remote", "url"]), members);
    if (target.id !== undefined && !homes.has(target.id)) {
      homes.set(target.id, backend);
    }
    if (target.slug === undefined) continue;
    links.push({
      slug: target.slug,
      switchboard: target.label,
      ...(target.member ? { member: target.member } : {}),
      backend,
      source: { kind: "backend" },
      remoteOnly: !keepsCopy || placed[target.slug] === backend.name,
      at: `${backend.at}.remote.url`,
    });
  }
  const ownDrives: string[] = [];
  const list = driveList(member);
  list?.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.slug !== "string") return;
    if (!isRecord(entry.remote)) {
      ownDrives.push(entry.slug);
      return;
    }
    const target = targetOf(entry.remote.url, members);
    const backend = target.id === undefined ? undefined : homes.get(target.id);
    links.push({
      slug: entry.slug,
      switchboard: target.label,
      ...(target.member ? { member: target.member } : {}),
      ...(backend ? { backend } : {}),
      source: { kind: "drive", index },
      remoteOnly:
        backend !== undefined &&
        (!keepsCopy || placed[entry.slug] === backend.name),
      at: `${member.reactorAt}.drives.${index}.remote.url`,
    });
  });
  const mappedDrives = member.reactor?.drives !== undefined && !list;
  const notes: string[] = [];
  if (!keepsCopy && remotes.length > 0) notes.push(REACH_REASONS.remoteOnly);
  if (mappedDrives) notes.push(REACH_REASONS.mapped);
  return {
    member,
    local,
    implicitLocal,
    links,
    mappedDrives,
    ownDrives,
    keepsCopy,
    switchboards: members
      .filter((other) => other.role === "switchboard")
      .map(({ path, key }) => ({ path, key })),
    notes,
  };
}

/** Every Connect member's card. */
export function connectReaches(members: readonly Member[]): ConnectReach[] {
  return members
    .filter((member) => member.role === "connect")
    .map((member) => connectReach(member, members));
}

/** The drives a switchboard serves, as the builder can know them. */
export function switchboardDrives(member: Member): string[] | undefined {
  const drives = member.reactor?.drives;
  if (drives === undefined) return [DEFAULT_DRIVE];
  if (!Array.isArray(drives)) return undefined;
  const slugs = drives.flatMap((entry) =>
    isRecord(entry) && typeof entry.slug === "string" && !isRecord(entry.remote)
      ? [entry.slug]
      : [],
  );
  return slugs;
}

type Report = (path: string, message: string) => void;

/** Connect's links: drives on one switchboard, through one backend each. */
export function reachRule(members: readonly Member[], report: Report): void {
  for (const reach of connectReaches(members)) {
    const { member } = reach;
    if (reach.local.length > 1) {
      for (const backend of reach.local.slice(1)) {
        report(backend.at, REACH_REASONS.oneLocal);
      }
    }
    if (!reach.implicitLocal && member.backends.length === 0) {
      report(`${member.reactorAt}.backends`, REACH_REASONS.lastOne);
    }
    const seen = new Map<string, string>();
    for (const backend of member.backends) {
      if (backend.kind !== "remote") continue;
      const at = `${backend.at}.remote.url`;
      const target = targetOf(
        valueAt(backend.body, ["remote", "url"]),
        members,
      );
      if (target.knowable && target.slug === undefined) {
        report(at, REACH_REASONS.notDrive);
      }
      if (target.id === undefined) continue;
      if (seen.has(target.id)) {
        report(at, REACH_REASONS.sameSwitchboard);
        continue;
      }
      seen.set(target.id, backend.name);
    }
    driveList(member)?.forEach((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.remote)) return;
      const target = targetOf(entry.remote.url, members);
      if (target.knowable && target.slug === undefined) {
        report(
          `${member.reactorAt}.drives.${index}.remote.url`,
          REACH_REASONS.notDrive,
        );
      }
    });
    for (const link of reach.links) {
      if (reach.ownDrives.includes(link.slug)) {
        report(link.at, REACH_REASONS.clash(link.slug));
      }
    }
  }
}

const DELETE = { $delete: true } as const;

/** Reach is written in the wrapper, copied from the folder first. */
function blockOf(member: Member): { at: string; copy: Setter[] } {
  const own = `${member.path}.reactor`;
  if (!member.path.startsWith("host.children.") || member.reactorAt === own) {
    return { at: member.reactorAt, copy: [] };
  }
  return {
    at: own,
    copy: member.reactor
      ? [{ path: own, value: structuredClone(member.reactor) as never }]
      : [],
  };
}

function driveToken(switchboard: Member, slug: string) {
  return {
    $output: {
      host: switchboard.folder,
      member: switchboard.key,
      path: ["drives", slug, "url"],
    },
  };
}

/** Drops placement entries that name a backend that is going away. */
function forgetBackend(member: Member, at: string, name: string): Setter[] {
  const setters: Setter[] = [];
  if (valueAt(member.reactor, ["placement", "primary"]) === name) {
    setters.push({ path: `${at}.placement.primary`, value: DELETE });
  }
  for (const [slug, backend] of Object.entries(placedDrives(member))) {
    if (backend === name) {
      setters.push({ path: `${at}.placement.drives.${slug}`, value: DELETE });
    }
  }
  return setters;
}

export type ReachOption = {
  id: string;
  group: "reach" | "placement";
  value: string;
  label: string;
  member: string;
  backend?: string;
  drive?: string;
  setters: Setter[];
  blocked?: string;
};

function openOptions(
  reach: ConnectReach,
  switchboards: readonly Member[],
  compound: boolean,
): ReachOption[] {
  const { member } = reach;
  const prefix = `${member.path}:reach`;
  if (switchboards.length === 0) {
    return [
      {
        id: `${prefix}:open`,
        group: "reach",
        value: "open",
        label: "Open a drive on a switchboard",
        member: member.path,
        setters: [],
        blocked: compound
          ? REACH_REASONS.noSwitchboard
          : REACH_REASONS.compound,
      },
    ];
  }
  const { at, copy } = blockOf(member);
  const taken = member.backends.map((backend) => backend.name);
  const options: ReachOption[] = [];
  for (const switchboard of switchboards) {
    const home = reach.links.find(
      (link) =>
        link.source.kind === "backend" && link.member === switchboard.key,
    )?.backend;
    for (const slug of switchboardDrives(switchboard) ?? []) {
      if (
        reach.links.some(
          (link) => link.member === switchboard.key && link.slug === slug,
        )
      ) {
        continue;
      }
      const option: ReachOption = {
        id: `${prefix}:open:${switchboard.key}:${slug}`,
        group: "reach",
        value: "open",
        label: `Open ${slug} on ${switchboard.key}`,
        member: member.path,
        drive: slug,
        setters: [...copy],
      };
      options.push(option);
      const link = { url: driveToken(switchboard, slug) };
      if (home) {
        if (reach.mappedDrives) {
          option.setters = [];
          option.blocked = REACH_REASONS.mapped;
          continue;
        }
        option.setters.push(
          {
            path: `${at}.drives`,
            value: [
              ...(driveList(member) ?? []),
              { slug, remote: link },
            ] as never,
          },
          { path: `${at}.placement.drives.${slug}`, value: home.name },
        );
        continue;
      }
      if (reach.implicitLocal) {
        option.setters.push({
          path: `${at}.backends.main`,
          value: BROWSER_BACKEND as never,
        });
      }
      const name = freshKey(taken, switchboard.key);
      option.setters.push(
        {
          path: `${at}.backends.${name}`,
          value: { kind: "remote", remote: link } as never,
        },
        { path: `${at}.placement.drives.${slug}`, value: name },
      );
    }
  }
  return options;
}

function removeOptions(reach: ConnectReach): ReachOption[] {
  const { member } = reach;
  const { at, copy } = blockOf(member);
  const options: ReachOption[] = reach.local.map((backend) => ({
    id: `${member.path}:reach:remove:${backend.name}`,
    group: "reach",
    value: "remove",
    label: "Remove",
    member: member.path,
    backend: backend.at,
    setters: [
      ...copy,
      { path: `${at}.backends.${backend.name}`, value: DELETE },
      ...forgetBackend(member, at, backend.name),
    ],
  }));
  const list = driveList(member);
  for (const link of reach.links) {
    const setters: Setter[] = [...copy];
    if (link.source.kind === "drive") {
      const { index } = link.source;
      setters.push({
        path: `${at}.drives`,
        value: (list ?? []).filter((_, other) => other !== index) as never,
      });
    } else if (link.backend) {
      // Another drive on the same switchboard becomes the backend's link.
      const next = reach.links.find(
        (other) =>
          other.source.kind === "drive" && other.backend === link.backend,
      );
      if (next && next.source.kind === "drive" && list) {
        const { index } = next.source;
        setters.push(
          {
            path: `${at}.backends.${link.backend.name}.remote.url`,
            value: valueAt(list[index] as Record<string, unknown>, [
              "remote",
              "url",
            ]) as never,
          },
          {
            path: `${at}.drives`,
            value: list.filter((_, other) => other !== index) as never,
          },
        );
      } else {
        setters.push(
          { path: `${at}.backends.${link.backend.name}`, value: DELETE },
          ...forgetBackend(member, at, link.backend.name),
        );
      }
    }
    if (Object.hasOwn(placedDrives(member), link.slug)) {
      setters.push({
        path: `${at}.placement.drives.${link.slug}`,
        value: DELETE,
      });
    }
    options.push({
      id: `${member.path}:reach:unlink:${link.slug}`,
      group: "reach",
      value: "remove",
      label: "Remove",
      member: member.path,
      drive: link.slug,
      setters: dedupe(setters),
    });
  }
  return options;
}

/** The last write to a path wins; earlier ones to it are dropped. */
function dedupe(setters: Setter[]): Setter[] {
  return setters.filter(
    (setter, index) =>
      !setters.slice(index + 1).some((later) => later.path === setter.path),
  );
}

function placementOptions(reach: ConnectReach): ReachOption[] {
  const { member } = reach;
  const { at, copy } = blockOf(member);
  const keepsCopy = reach.local.length > 0 || reach.implicitLocal;
  return reach.links.flatMap((link): ReachOption[] => {
    if (!link.backend) return [];
    const id = `${member.path}:placement:${link.slug}`;
    return [
      {
        id: `${id}:copy`,
        group: "placement",
        value: "copy",
        label: "Copy in this browser",
        member: member.path,
        backend: link.backend.at,
        drive: link.slug,
        setters: [
          ...copy,
          { path: `${at}.placement.drives.${link.slug}`, value: DELETE },
        ],
        ...(keepsCopy ? {} : { blocked: REACH_REASONS.remoteOnly }),
      },
      {
        id: `${id}:remote`,
        group: "placement",
        value: "remote",
        label: `On ${link.switchboard} only`,
        member: member.path,
        backend: link.backend.at,
        drive: link.slug,
        setters: [
          ...copy,
          {
            path: `${at}.placement.drives.${link.slug}`,
            value: link.backend.name,
          },
        ],
      },
    ];
  });
}

/** The drive the switchboard's workflows plugin seeds unless told otherwise. */
const WORKFLOWS_DRIVE = { slug: "workflows", name: "Workflows" } as const;

/** Switchboard plugins known to add no drive. */
const DRIVELESS_PLUGINS = [
  "/plugins/mcp",
  "/plugins/attachments",
  "/plugins/privacy",
];

/**
 * Drives a switchboard's plugins add; a declared drive with the same slug
 * replaces one. Where the export can't tell, the known defaults count.
 */
function pluginDrives(plugins: unknown): { slug: string; name: string }[] {
  if (plugins === undefined) return [];
  if (!Array.isArray(plugins)) return [WORKFLOWS_DRIVE];
  return (plugins as unknown[]).flatMap((entry) => {
    const module: unknown = isRecord(entry) ? entry.module : entry;
    if (typeof module !== "string") return [WORKFLOWS_DRIVE];
    if (DRIVELESS_PLUGINS.some((suffix) => module.endsWith(suffix))) return [];
    if (!module.endsWith("/plugins/workflows")) return [WORKFLOWS_DRIVE];
    const config = isRecord(entry) ? entry.config : undefined;
    if (!isRecord(config)) return [WORKFLOWS_DRIVE];
    if (config.drive === false) return [];
    const drive = isRecord(config.drive) ? config.drive : {};
    const known = [
      {
        slug:
          typeof drive.slug === "string" ? drive.slug : WORKFLOWS_DRIVE.slug,
        name:
          typeof drive.name === "string" ? drive.name : WORKFLOWS_DRIVE.name,
      },
    ];
    // A token or a token field: the default may still be what it seeds.
    const unsure =
      (config.drive !== undefined && !isRecord(config.drive)) ||
      (drive.slug !== undefined && typeof drive.slug !== "string") ||
      (drive.name !== undefined && typeof drive.name !== "string");
    return unsure ? [...known, WORKFLOWS_DRIVE] : known;
  });
}

/** Every drive slug and name in the host, the default drive's included. */
function drivesInHost(members: readonly Member[]): {
  slugs: Set<string>;
  names: Set<string>;
} {
  const slugs = new Set<string>([DEFAULT_DRIVE]);
  const names = new Set<string>([DEFAULT_DRIVE_NAME.toLowerCase()]);
  for (const member of members) {
    if (member.role === "switchboard") {
      for (const drive of pluginDrives(member.runner.plugins)) {
        slugs.add(drive.slug);
        names.add(drive.name.toLowerCase());
      }
    }
    for (const entry of driveList(member) ?? []) {
      if (!isRecord(entry)) continue;
      if (typeof entry.slug === "string") slugs.add(entry.slug);
      if (typeof entry.name === "string") names.add(entry.name.toLowerCase());
    }
    for (const backend of member.backends) {
      const { slug } = targetOf(
        valueAt(backend.body, ["remote", "url"]),
        members,
      );
      if (slug !== undefined) slugs.add(slug);
    }
  }
  return { slugs, names };
}

/** The address part a drive name gives: lowercase letters, digits and dashes. */
export function driveSlugOf(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

/** A named drive on a switchboard, saved in this host's entry for it. */
export function addDriveOption(
  switchboard: Member,
  members: readonly Member[],
  name: string,
): ReachOption {
  const trimmed = name.trim();
  const slug = driveSlugOf(trimmed);
  const option: ReachOption = {
    id: `${switchboard.path}:reach:addDrive:${slug}`,
    group: "reach",
    value: "addDrive",
    label: `Add ${trimmed || "a drive"} to ${switchboard.key}`,
    member: switchboard.path,
    setters: [],
  };
  const drives = switchboard.reactor?.drives;
  const { slugs, names } = drivesInHost(members);
  if (drives !== undefined && !Array.isArray(drives)) {
    option.blocked = REACH_REASONS.switchboardMapped;
  } else if (trimmed === "") {
    option.blocked = REACH_REASONS.noName;
  } else if (slug === "") {
    option.blocked = REACH_REASONS.nameLetters;
  } else if (names.has(trimmed.toLowerCase())) {
    option.blocked = REACH_REASONS.nameTaken(trimmed);
  } else if (slugs.has(slug)) {
    option.blocked = REACH_REASONS.addressTaken(trimmed);
  }
  if (option.blocked !== undefined) return option;
  const { at, copy } = blockOf(switchboard);
  // A switchboard that declares drives no longer serves its default one.
  const kept: unknown[] = Array.isArray(drives)
    ? drives
    : [{ slug: DEFAULT_DRIVE, name: DEFAULT_DRIVE_NAME }];
  option.drive = slug;
  option.setters = [
    ...copy,
    {
      path: `${at}.drives`,
      value: [...kept, { slug, name: trimmed }] as never,
    },
  ];
  return option;
}

/** Link, unlink and place options for every Connect. */
export function reachOptions(
  members: readonly Member[],
  compound: boolean,
): ReachOption[] {
  const reaches = connectReaches(members);
  if (reaches.length === 0) return [];
  const switchboards = compound
    ? members.filter((member) => member.role === "switchboard")
    : [];
  return [
    ...reaches.flatMap((reach) => [
      ...(reach.local.length === 0 && !reach.implicitLocal
        ? [
            {
              id: `${reach.member.path}:reach:local`,
              group: "reach" as const,
              value: "local",
              label: "Keep drives in this browser",
              member: reach.member.path,
              setters: [
                ...blockOf(reach.member).copy,
                {
                  path: `${blockOf(reach.member).at}.backends.${freshKey(
                    reach.member.backends.map((backend) => backend.name),
                    "main",
                  )}`,
                  value: BROWSER_BACKEND as never,
                },
              ],
            },
          ]
        : []),
      ...openOptions(reach, switchboards, compound),
      ...removeOptions(reach),
      ...placementOptions(reach),
    ]),
  ];
}

/** The backend the config places a drive on, if it places it. */
export function placedOn(member: Member, slug: string): string | undefined {
  const placed = placedDrives(member);
  const backend = Object.hasOwn(placed, slug) ? placed[slug] : undefined;
  return typeof backend === "string" ? backend : undefined;
}

/** A Router move of a drive onto one of the app's backends, as config. */
export function placementSaveOption(
  reach: ConnectReach,
  slug: string,
  backend: string,
): ReachOption {
  const { member } = reach;
  const { at, copy } = blockOf(member);
  const target = member.backends.find(
    (candidate) => candidate.name === backend,
  );
  const link = reach.links.find((candidate) => candidate.slug === slug);
  const local = target?.kind !== undefined && LOCAL_KINDS.has(target.kind);
  const option: ReachOption = {
    id: `${member.path}:placement:${slug}:${local ? "copy" : "remote"}`,
    group: "placement",
    value: local ? "copy" : "remote",
    label: local ? "Copy in this browser" : `On ${backend} only`,
    member: member.path,
    ...(target ? { backend: target.at } : {}),
    drive: slug,
    setters: [],
  };
  if (!target) return { ...option, blocked: REACH_REASONS.noBackend(backend) };
  if (local) {
    return {
      ...option,
      setters: [
        ...copy,
        { path: `${at}.placement.drives.${slug}`, value: DELETE },
      ],
      ...(reach.keepsCopy ? {} : { blocked: REACH_REASONS.remoteOnly }),
    };
  }
  if (link && link.backend?.name !== backend) {
    return {
      ...option,
      blocked: REACH_REASONS.otherSwitchboard(slug, link.switchboard),
    };
  }
  if (!link && !reach.mappedDrives) {
    return { ...option, blocked: REACH_REASONS.localDrive };
  }
  return {
    ...option,
    setters: [
      ...copy,
      { path: `${at}.placement.drives.${slug}`, value: backend },
    ],
  };
}

/** "On <switchboard> only" is chosen when the drive opens with no copy. */
export function placementSelected(
  option: { member?: string; drive?: string; value: string },
  members: readonly Member[],
): boolean {
  const member = members.find((candidate) => candidate.path === option.member);
  if (!member) return false;
  const link = connectReach(member, members).links.find(
    (candidate) => candidate.slug === option.drive,
  );
  if (!link) return false;
  return link.remoteOnly === (option.value === "remote");
}
