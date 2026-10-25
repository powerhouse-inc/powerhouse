import type {
  DocumentChangeEvent,
  IReactorReadClient,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DRIVE_DOCUMENT_TYPES } from "../src/constants.js";
import { addDrivesEventHandler, setDrives } from "../src/hooks/drives.js";
import { getPHStore } from "../src/hooks/ph-store.js";
import { DOCUMENT_CHANGE_TYPE } from "../src/reactor-interop.js";
import {
  createDriveChangeHandler,
  refreshDrive,
  refreshDriveMembership,
} from "../src/reactor.js";

function makeDrive(id: string, nodes = 0): DocumentDriveDocument {
  return {
    header: {
      id,
      slug: id,
      name: id,
      documentType: DRIVE_DOCUMENT_TYPES[0],
      revision: {},
    },
    state: {
      global: {
        name: id,
        icon: null,
        nodes: Array.from({ length: nodes }, (_, i) => ({
          id: `${id}-node-${i}`,
          kind: "file",
          name: `n${i}`,
          parentFolder: null,
        })),
      },
      local: {},
    },
  } as unknown as DocumentDriveDocument;
}

/** A read half whose `find` lists ids and whose `get` answers from `held`. */
function readClient(held: Map<string, DocumentDriveDocument>) {
  const find = vi.fn(
    (search: { type?: string }, view?: { scopes?: string[] }) =>
      Promise.resolve({
        results:
          search.type === DRIVE_DOCUMENT_TYPES[0]
            ? [...held.values()].map((d) =>
                view?.scopes?.length ? { header: d.header } : d,
              )
            : [],
        options: { cursor: "0", limit: 100 },
      }),
  );
  const get = vi.fn((id: string) => {
    const drive = held.get(id);
    return drive
      ? Promise.resolve(drive)
      : Promise.reject(new Error(`Document not found: ${id}`));
  });
  return { client: { find, get } as unknown as IReactorReadClient, find, get };
}

function updated(...drives: DocumentDriveDocument[]): DocumentChangeEvent {
  return { type: DOCUMENT_CHANGE_TYPE.Updated, documents: drives };
}

function drivesInStore(): DocumentDriveDocument[] {
  return getPHStore()?.drives ?? [];
}

describe("drive refresh", () => {
  beforeAll(() => {
    addDrivesEventHandler();
  });

  beforeEach(() => {
    window.ph = {};
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.ph = {};
  });

  it("refreshDrive replaces one drive and fetches nothing else", async () => {
    const mail = makeDrive("mail", 3);
    const sektar = makeDrive("sektar", 1);
    setDrives([mail, sektar]);
    const held = new Map([
      ["mail", makeDrive("mail", 4)],
      ["sektar", sektar],
    ]);
    const { client, find, get } = readClient(held);

    await refreshDrive(client, "mail");

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("mail");
    expect(find).not.toHaveBeenCalled();
    const stored = drivesInStore();
    expect(stored.map((d) => d.header.id)).toEqual(["mail", "sektar"]);
    expect(stored[0].state.global.nodes).toHaveLength(4);
    expect(stored[1]).toBe(sektar);
  });

  it("refreshDrive drops a drive that is gone", async () => {
    setDrives([makeDrive("mail"), makeDrive("sektar")]);
    const { client } = readClient(new Map([["sektar", makeDrive("sektar")]]));

    await refreshDrive(client, "mail");

    expect(drivesInStore().map((d) => d.header.id)).toEqual(["sektar"]);
  });

  it("refreshDriveMembership lists headers only and loads just the new drive", async () => {
    const mail = makeDrive("mail", 3);
    setDrives([mail]);
    const held = new Map([
      ["mail", makeDrive("mail", 99)],
      ["trips", makeDrive("trips", 2)],
    ]);
    const { client, find, get } = readClient(held);

    await refreshDriveMembership(client);

    for (const call of find.mock.calls) {
      expect(call[1]).toEqual({ scopes: ["header"] });
    }
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("trips");
    const stored = drivesInStore();
    expect(stored.map((d) => d.header.id)).toEqual(["mail", "trips"]);
    // The held drive is kept as it was, not re-read.
    expect(stored[0]).toBe(mail);
  });

  it("an update re-reads that drive once per interval while it keeps changing", async () => {
    const mail = makeDrive("mail", 1);
    setDrives([mail, makeDrive("sektar")]);
    const held = new Map([
      ["mail", makeDrive("mail", 2)],
      ["sektar", makeDrive("sektar")],
    ]);
    const { client, find, get } = readClient(held);
    const handle = createDriveChangeHandler(client, { minIntervalMs: 10_000 });

    handle(updated(mail));
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    // Five more changes inside the interval collapse into one re-read at its end.
    for (let i = 0; i < 5; i++) handle(updated(mail));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.every((c) => c[0] === "mail")).toBe(true);
    expect(find).not.toHaveBeenCalled();
  });

  it("a creation or deletion refreshes the membership, not every drive", async () => {
    setDrives([makeDrive("mail")]);
    const held = new Map([
      ["mail", makeDrive("mail")],
      ["new", makeDrive("new")],
    ]);
    const { client, find, get } = readClient(held);
    const handle = createDriveChangeHandler(client);

    handle({
      type: DOCUMENT_CHANGE_TYPE.Created,
      documents: [held.get("new")!],
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(find).toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("new");
    expect(drivesInStore().map((d) => d.header.id)).toEqual(["mail", "new"]);
  });

  it("reports a failed refresh instead of throwing from the subscription", async () => {
    setDrives([makeDrive("mail")]);
    const client = {
      find: vi.fn(() => Promise.reject(new Error("offline"))),
      get: vi.fn(() => Promise.reject(new Error("offline"))),
    } as unknown as IReactorReadClient;
    const onError = vi.fn();
    const handle = createDriveChangeHandler(client, { onError });

    handle({
      type: DOCUMENT_CHANGE_TYPE.Deleted,
      documents: [],
      context: { childId: "x" },
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(drivesInStore().map((d) => d.header.id)).toEqual(["mail"]);
  });
});
