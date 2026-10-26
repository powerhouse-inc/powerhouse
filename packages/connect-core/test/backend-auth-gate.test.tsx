// @vitest-environment happy-dom

import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addBackendAuthEventHandler,
  addDrivesEventHandler,
  getPHStore,
  setBackendAuth,
} from "@powerhousedao/reactor-browser";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getAppDrives } from "../src/runtime/index.js";
import { BackendAuthGate } from "../src/views/backend-auth-gate.js";

const DRIVE_TYPE = "powerhouse/document-drive";

beforeAll(() => {
  window.ph = {};
  addDrivesEventHandler();
  addBackendAuthEventHandler();
});

afterEach(() => {
  setBackendAuth(undefined);
  window.ph = {};
});

/** A client whose drive listing has the given outcome; other types list nothing. */
function clientThat(outcome: () => Promise<unknown>): IReactorClient {
  return {
    find: vi.fn((search: { type?: string }) =>
      search.type === DRIVE_TYPE
        ? outcome()
        : Promise.resolve({ results: [], options: { cursor: "", limit: 0 } }),
    ),
  } as unknown as IReactorClient;
}

const refused401 = () =>
  Promise.reject(
    Object.assign(new Error("find could not be answered by every backend"), {
      failures: [
        { backend: "switchboard-remote", error: { response: { status: 401 } } },
      ],
    }),
  );

describe("getAppDrives with a refusing backend", () => {
  it("a remote-only client refused with 401 records the refusal and lists no drives", async () => {
    const client = clientThat(refused401);
    await expect(getAppDrives(client, client)).resolves.toEqual([]);
    expect(getPHStore()?.backendAuth).toMatchObject({
      requiresAuth: true,
      status: 401,
      backend: "switchboard",
    });
  });

  it("a remote-only client that fails for another reason still fails the boot", async () => {
    const client = clientThat(() => Promise.reject(new Error("ECONNREFUSED")));
    await expect(getAppDrives(client, client)).rejects.toThrow(/ECONNREFUSED/);
    expect(getPHStore()?.backendAuth).toBeUndefined();
  });

  it("a successful listing clears an earlier refusal", async () => {
    setBackendAuth({ requiresAuth: true, status: 401, at: "t" });
    const drive = { header: { id: "d", documentType: DRIVE_TYPE } };
    const client = clientThat(() =>
      Promise.resolve({ results: [drive], options: { cursor: "", limit: 0 } }),
    );
    await expect(getAppDrives(client, client)).resolves.toEqual([drive]);
    expect(getPHStore()?.backendAuth).toBeUndefined();
  });

  it("a router whose remote refuses falls back to the local drives and records it", async () => {
    const local = clientThat(() =>
      Promise.resolve({ results: [], options: { cursor: "", limit: 0 } }),
    );
    const routed = clientThat(refused401);
    await expect(getAppDrives(routed, local)).resolves.toEqual([]);
    expect(getPHStore()?.backendAuth?.status).toBe(401);
  });
});

describe("BackendAuthGate", () => {
  it("offers a Renown sign-in for an anonymous caller", () => {
    setBackendAuth({
      requiresAuth: true,
      status: 401,
      backend: "switchboard",
      at: "t",
    });
    render(<BackendAuthGate mode="login" />);
    const dialog = screen.getByRole("dialog").textContent;
    expect(dialog).toContain("Sign in to continue");
    expect(dialog).toContain("(switchboard)");
    expect(
      screen.getByRole("button", { name: /sign in with renown/i }),
    ).toBeTruthy();
  });

  it("tells a signed-in caller the account is not allowed and offers to switch", () => {
    render(<BackendAuthGate mode="unauthorized" />);
    expect(screen.getByRole("dialog").textContent).toContain(
      "not allowed here",
    );
    expect(
      screen.getByRole("button", { name: /switch account/i }),
    ).toBeTruthy();
  });
});
