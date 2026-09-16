// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStateSnapshot } from "@powerhousedao/reactor-browser";

const mocks = vi.hoisted(() => ({
  user: undefined as { address: string } | undefined,
  selectedDriveId: undefined as string | undefined,
  connectionStates: new Map<string, unknown>(),
  remotes: [] as Array<{
    meta: { name: string; collectionId: { driveId: string } };
  }>,
  drives: [] as Array<{ header: { id: string } }>,
  setSelectedDrive: vi.fn(),
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  setSelectedDrive: mocks.setSelectedDrive,
  useConnectionStates: () => mocks.connectionStates,
  useDrives: () => mocks.drives,
  useSelectedDriveId: () => mocks.selectedDriveId,
  useSync: () => ({ list: () => mocks.remotes }),
  useUser: () => mocks.user,
}));

import {
  clearHiddenDrives,
  computeAuthGate,
  hideDriveForSession,
  useDriveAuthGate,
  useVisibleDrives,
} from "./use-drive-auth-gate.js";

// `state` + `requiresAuth` drive the decision; the rest are neutral.
function snap(
  state: ConnectionStateSnapshot["state"],
  requiresAuth = false,
): ConnectionStateSnapshot {
  return {
    state,
    failureCount: 0,
    lastSuccessUtcMs: 0,
    lastFailureUtcMs: 0,
    pushBlocked: false,
    pushFailureCount: 0,
    receivingPages: false,
    requiresAuth,
  };
}

// Remotes are named with a random uuid, so the drive a snapshot belongs to is
// only reachable through the remote -> collection mapping.
const REFUSED_REMOTE = "e1f0a0d2-refused";
const HEALTHY_REMOTE = "b7c3d9a4-healthy";
const REFUSED_DRIVE = "drive-refused";
const HEALTHY_DRIVE = "drive-healthy";

const remotes = [
  { name: REFUSED_REMOTE, driveId: REFUSED_DRIVE },
  { name: HEALTHY_REMOTE, driveId: HEALTHY_DRIVE },
];

const states = new Map([
  [REFUSED_REMOTE, snap("error", true)],
  [HEALTHY_REMOTE, snap("connected")],
]);

describe("computeAuthGate", () => {
  it("returns 'unauthorized' when the selected drive is refused and the user is signed in", () => {
    expect(
      computeAuthGate(true, states, {
        selectedDriveId: REFUSED_DRIVE,
        remotes,
      }),
    ).toBe("unauthorized");
  });

  it("returns 'login' when the selected drive is refused and the user is anonymous", () => {
    expect(
      computeAuthGate(false, states, {
        selectedDriveId: REFUSED_DRIVE,
        remotes,
      }),
    ).toBe("login");
  });

  // The discriminator: one refused drive must not gate a different drive.
  it("does not gate when a drive other than the refused one is selected", () => {
    expect(
      computeAuthGate(false, states, {
        selectedDriveId: HEALTHY_DRIVE,
        remotes,
      }),
    ).toBeNull();
  });

  it("does not gate when no drive is selected", () => {
    expect(
      computeAuthGate(false, states, {
        selectedDriveId: undefined,
        remotes,
      }),
    ).toBeNull();
  });

  it("does not gate on a non-auth error for the selected drive", () => {
    expect(
      computeAuthGate(
        false,
        new Map([[REFUSED_REMOTE, snap("error", false)]]),
        {
          selectedDriveId: REFUSED_DRIVE,
          remotes,
        },
      ),
    ).toBeNull();
  });

  it("does not gate when the selected drive's channels are healthy", () => {
    expect(
      computeAuthGate(false, states, {
        selectedDriveId: HEALTHY_DRIVE,
        remotes,
      }),
    ).toBeNull();
  });

  it("does not gate when the selected drive has no remote at all", () => {
    expect(
      computeAuthGate(false, states, {
        selectedDriveId: "local-only-drive",
        remotes,
      }),
    ).toBeNull();
  });

  it("does not gate with no channels", () => {
    expect(
      computeAuthGate(false, new Map(), {
        selectedDriveId: REFUSED_DRIVE,
        remotes,
      }),
    ).toBeNull();
  });

  it("gates when any of the selected drive's several remotes is refused", () => {
    const second = "c2d4e6f8-second";
    expect(
      computeAuthGate(
        false,
        new Map([
          [REFUSED_REMOTE, snap("connected")],
          [second, snap("error", true)],
        ]),
        {
          selectedDriveId: REFUSED_DRIVE,
          remotes: [
            { name: REFUSED_REMOTE, driveId: REFUSED_DRIVE },
            { name: second, driveId: REFUSED_DRIVE },
          ],
        },
      ),
    ).toBe("login");
  });
});

function remote(name: string, driveId: string) {
  return { meta: { name, collectionId: { driveId } } };
}

describe("useDriveAuthGate", () => {
  beforeEach(() => {
    mocks.user = undefined;
    mocks.selectedDriveId = undefined;
    mocks.connectionStates = new Map(states);
    mocks.remotes = [
      remote(REFUSED_REMOTE, REFUSED_DRIVE),
      remote(HEALTHY_REMOTE, HEALTHY_DRIVE),
    ];
    mocks.drives = [
      { header: { id: REFUSED_DRIVE } },
      { header: { id: HEALTHY_DRIVE } },
    ];
    mocks.setSelectedDrive.mockClear();
    clearHiddenDrives();
  });

  afterEach(() => {
    clearHiddenDrives();
  });

  // The discriminator, end to end: the refusal is on one drive only, and the
  // remote it belongs to is named with a uuid, not the drive id.
  it("does not gate while a healthy drive is selected, even with a refused drive present", () => {
    mocks.selectedDriveId = HEALTHY_DRIVE;
    const { result } = renderHook(() => useDriveAuthGate());
    expect(result.current.gate).toBeNull();
  });

  it("gates once the refused drive is selected", () => {
    mocks.selectedDriveId = REFUSED_DRIVE;
    const { result } = renderHook(() => useDriveAuthGate());
    expect(result.current.gate).toBe("login");
  });

  it("gates as 'unauthorized' for a signed-in user on the refused drive", () => {
    mocks.user = { address: "0xabc" };
    mocks.selectedDriveId = REFUSED_DRIVE;
    const { result } = renderHook(() => useDriveAuthGate());
    expect(result.current.gate).toBe("unauthorized");
  });

  it("dismiss hides the selected drive and deselects it", () => {
    mocks.selectedDriveId = REFUSED_DRIVE;
    const gate = renderHook(() => useDriveAuthGate());
    const drives = renderHook(() => useVisibleDrives());
    expect(drives.result.current).toHaveLength(2);

    act(() => {
      gate.result.current.dismiss();
    });

    expect(mocks.setSelectedDrive).toHaveBeenCalledWith(undefined);
    expect(drives.result.current?.map((d) => d.header.id)).toEqual([
      HEALTHY_DRIVE,
    ]);
  });

  it("keeps Connect usable after a dismissal: no gate once nothing is selected", () => {
    mocks.selectedDriveId = REFUSED_DRIVE;
    const { result, rerender } = renderHook(() => useDriveAuthGate());
    act(() => {
      result.current.dismiss();
    });
    mocks.selectedDriveId = undefined;
    rerender();
    expect(result.current.gate).toBeNull();
  });

  it("restores hidden drives when the signed-in identity changes", () => {
    mocks.selectedDriveId = REFUSED_DRIVE;
    const gate = renderHook(() => useDriveAuthGate());
    const drives = renderHook(() => useVisibleDrives());
    act(() => {
      gate.result.current.dismiss();
    });
    expect(drives.result.current).toHaveLength(1);

    mocks.user = { address: "0xabc" };
    gate.rerender();
    expect(drives.result.current).toHaveLength(2);
  });
});

describe("useVisibleDrives", () => {
  beforeEach(() => {
    mocks.drives = [
      { header: { id: REFUSED_DRIVE } },
      { header: { id: HEALTHY_DRIVE } },
    ];
    clearHiddenDrives();
  });

  afterEach(() => {
    clearHiddenDrives();
  });

  it("returns every drive when nothing is hidden", () => {
    const { result } = renderHook(() => useVisibleDrives());
    expect(result.current).toHaveLength(2);
  });

  it("drops a hidden drive and re-renders subscribers", () => {
    const { result } = renderHook(() => useVisibleDrives());
    act(() => {
      hideDriveForSession(REFUSED_DRIVE);
    });
    expect(result.current?.map((d) => d.header.id)).toEqual([HEALTHY_DRIVE]);
  });
});
