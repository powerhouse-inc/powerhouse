// @vitest-environment happy-dom

import type { IReactorClient } from "@powerhousedao/reactor";
import {
  addBackendAuthEventHandler,
  addDrivesEventHandler,
  addFullReactorClientEventHandler,
  addLocalSignInEventHandler,
  getPHStore,
  setBackendAuth,
  setFullReactorClient,
  setLocalSignIn,
} from "@powerhousedao/reactor-browser";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getAppDrives,
  refreshAppDrives,
  relistAppDrives,
  useBackendAuthGate,
} from "../src/runtime/index.js";
import { BackendAuthGate } from "../src/views/backend-auth-gate.js";

const DRIVE_TYPE = "powerhouse/document-drive";

beforeAll(() => {
  window.ph = {};
  addDrivesEventHandler();
  addBackendAuthEventHandler();
  addLocalSignInEventHandler();
  addFullReactorClientEventHandler();
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

  it("the boot refresh of a remote-only client refused with 401 sets no drives and records it, instead of throwing", async () => {
    const client = clientThat(refused401);
    await expect(refreshAppDrives(client, client)).resolves.toBeUndefined();
    expect(getPHStore()?.drives).toEqual([]);
    expect(getPHStore()?.backendAuth?.status).toBe(401);
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

describe("useBackendAuthGate", () => {
  function Probe() {
    return <output>{String(useBackendAuthGate())}</output>;
  }

  it("keeps a refusal recorded before the root mounted, under StrictMode's double mount", () => {
    setBackendAuth({ requiresAuth: true, status: 401, at: "t" });
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByRole("status").textContent).toBe("login");
    expect(getPHStore()?.backendAuth?.status).toBe(401);
  });

  it("answers null without a refusal", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("null");
  });
});

describe("relistAppDrives", () => {
  afterEach(() => setFullReactorClient(undefined));

  it("does nothing before boot set a client", async () => {
    await expect(relistAppDrives()).resolves.toBeUndefined();
    expect(getPHStore()?.drives).toBeUndefined();
  });

  it("lists through the store's client and records what it answers", async () => {
    const client = clientThat(refused401);
    setFullReactorClient(client);
    await relistAppDrives();
    expect(getPHStore()?.drives).toEqual([]);
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

describe("the gate for a sign-in by link", () => {
  afterEach(() => setLocalSignIn(undefined));

  function Probe() {
    return <output>{String(useBackendAuthGate())}</output>;
  }

  it("says how to get a fresh link once this computer's sign-in ended", () => {
    setLocalSignIn({ status: "ended", reason: "withdrawn-here" });
    setBackendAuth({ requiresAuth: true, status: 401, at: "t" });
    render(<BackendAuthGate mode="login" />);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Your sign-in to this computer's identity has ended. Run `ph dev` (or `ph vetra`) in the project again: it prints a fresh link.",
    );
  });

  it("asks the password the key is locked with, even before a refusal", async () => {
    const submit = vi.fn(() => Promise.resolve());
    setLocalSignIn({ status: "password", submit, dismiss: vi.fn() });
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("local-sign-in");

    render(<BackendAuthGate mode="local-sign-in" />);
    const input = screen.getByLabelText("Password");
    fireEvent.change(input, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("secret"));
  });

  it("says a link was used, and lets the person go on without it", () => {
    const dismiss = vi.fn();
    setLocalSignIn({ status: "failed", reason: "used-code", dismiss });
    render(<BackendAuthGate mode="local-sign-in" />);
    expect(screen.getByRole("dialog").textContent).toContain(
      "This sign-in link was used already.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Continue without signing in" }),
    );
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("points a Renown login on this computer to Renown", () => {
    setLocalSignIn({
      status: "failed",
      reason: "renown-login",
      label: "alice.eth",
      dismiss: vi.fn(),
    });
    render(<BackendAuthGate mode="local-sign-in" />);
    expect(screen.getByRole("dialog").textContent).toContain(
      "logged in with Renown as alice.eth",
    );
    expect(
      screen.getByRole("button", { name: "Sign in with Renown" }),
    ).toBeTruthy();
  });

  it("leaves an ended sign-in to the backend's answer", () => {
    setLocalSignIn({ status: "ended", reason: "expired" });
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("null");
  });
});
