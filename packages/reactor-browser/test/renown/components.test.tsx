import type {
  PowerhouseVerifiableCredential,
  RenownProfile,
} from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { addRenownEventHandler, setRenown } from "../../src/hooks/renown.js";
import { RenownAuthButton } from "../../src/renown/components/RenownAuthButton.js";
import { RenownLoginButton } from "../../src/renown/components/RenownLoginButton.js";
import { RenownUserButton } from "../../src/renown/components/RenownUserButton.js";
import { RenownProvider } from "../../src/renown/RenownProvider.js";

const TEST_BASE_URL = "https://test.renown.id";
const TEST_ADDRESS = "0x9aDdcBbaA28F7eB5f75E023F7C1Fcb13C9DFD8F7" as const;
const TEST_USER_DID = `did:pkh:eip155:1:${TEST_ADDRESS}`;

function createMockCredential(
  userDid: string,
  appDid: string,
): PowerhouseVerifiableCredential {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "test-credential-id",
    type: ["VerifiableCredential"],
    issuer: {
      id: userDid,
      ethereumAddress: TEST_ADDRESS,
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: appDid,
      app: "test-app",
    },
    credentialSchema: {
      id: "https://schema.org",
      type: "JsonSchemaValidator2018",
    },
    proof: {
      verificationMethod: "test",
      ethereumAddress: TEST_ADDRESS,
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      type: "EthereumEip712Signature2021",
      proofValue: "0xtest",
      eip712: {
        domain: {
          name: "Renown",
          version: "1",
          chainId: 1,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: {} as PowerhouseVerifiableCredential["proof"]["eip712"]["types"],
        primaryType: "VerifiableCredential",
      },
    },
  };
}

const MOCK_PROFILE: RenownProfile = {
  documentId: "doc-123",
  username: "testuser",
  ethAddress: TEST_ADDRESS,
  userImage: "https://example.com/avatar.png",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

/**
 * Intercept fetch calls to mock the credential and profile APIs.
 * Captures the app DID from the credential request so the mock
 * credential can match it.
 */
function mockFetchForLogin(options?: { profile?: RenownProfile | null }) {
  const { profile = MOCK_PROFILE } = options ?? {};
  let capturedAppDid: string | undefined;

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof URL ? input.toString() : String(input);

    if (url.includes("/api/auth/credential")) {
      const params = new URL(url).searchParams;
      capturedAppDid = params.get("connectId") ?? undefined;
      const credential = createMockCredential(
        TEST_USER_DID,
        capturedAppDid ?? "",
      );
      return Response.json({ credential });
    }

    if (url.includes("/api/profile")) {
      if (profile === null) {
        return new Response(null, { status: 404 });
      }
      return Response.json({ profile });
    }

    return new Response(null, { status: 404 });
  });
}

beforeEach(() => {
  if (!window.ph) {
    window.ph = {};
  }
  addRenownEventHandler();
});

afterEach(() => {
  setRenown(undefined);
  vi.restoreAllMocks();

  // Clean up any ?user= param to prevent test pollution
  const url = new URL(window.location.href);
  if (url.searchParams.has("user")) {
    url.searchParams.delete("user");
    window.history.replaceState({}, "", url.toString());
  }
});

describe("RenownLoginButton", () => {
  it("should render login button", async () => {
    const onLogin = vi.fn();
    const screen = render(<RenownLoginButton onLogin={onLogin} />);

    await expect
      .element(screen.getByRole("button", { name: "Login with Renown" }))
      .toBeVisible();
  });

  it("should call onLogin when clicked", async () => {
    const onLogin = vi.fn();
    const screen = render(<RenownLoginButton onLogin={onLogin} />);

    await screen.getByRole("button", { name: "Login with Renown" }).click();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("should show popover on hover when showPopover is true", async () => {
    const onLogin = vi.fn();
    const screen = render(<RenownLoginButton onLogin={onLogin} showPopover />);

    const button = screen.getByRole("button", { name: "Open Renown Login" });
    await button.hover();

    await expect
      .element(screen.getByRole("button", { name: "Connect" }))
      .toBeVisible();
  });
});

describe("RenownUserButton", () => {
  it("should render avatar placeholder when no avatarUrl", async () => {
    const screen = render(
      <RenownUserButton address={TEST_ADDRESS} onDisconnect={vi.fn()} />,
    );

    await expect
      .element(screen.getByRole("button", { name: "Open account menu" }))
      .toBeVisible();
  });

  it("should show popover with address on hover", async () => {
    const screen = render(
      <RenownUserButton
        address={TEST_ADDRESS}
        username="testuser"
        onDisconnect={vi.fn()}
      />,
    );

    await screen.getByRole("button", { name: "Open account menu" }).hover();

    await expect.element(screen.getByText("testuser")).toBeVisible();
    // Address should be truncated
    await expect.element(screen.getByText("0x9aDdc...FD8F7")).toBeVisible();
  });

  it("should show 'View on Renown' when userId is provided", async () => {
    const screen = render(
      <RenownUserButton
        address={TEST_ADDRESS}
        userId="doc-123"
        onDisconnect={vi.fn()}
      />,
    );

    await screen.getByRole("button", { name: "Open account menu" }).hover();

    await expect.element(screen.getByText("View on Renown")).toBeVisible();
  });

  it("should call onDisconnect when disconnect is clicked", async () => {
    const onDisconnect = vi.fn();
    const screen = render(
      <RenownUserButton address={TEST_ADDRESS} onDisconnect={onDisconnect} />,
    );

    await screen.getByRole("button", { name: "Open account menu" }).hover();
    await screen.getByText("Disconnect").click();

    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});

describe("RenownAuthButton", () => {
  it("should show login button when no renown instance is set", async () => {
    const screen = render(<RenownAuthButton />);

    await expect
      .element(screen.getByRole("button", { name: "Login with Renown" }))
      .toBeVisible();
  });

  it("should show user button after full login flow via RenownProvider", async () => {
    mockFetchForLogin();

    // Simulate the ?user= URL param that triggers auto-login
    const url = new URL(window.location.href);
    url.searchParams.set("user", encodeURIComponent(TEST_USER_DID));
    window.history.replaceState({}, "", url.toString());

    const screen = render(
      <RenownProvider appName="test" baseUrl={TEST_BASE_URL}>
        <RenownAuthButton />
      </RenownProvider>,
    );

    // After login resolves, should show user button
    await expect
      .element(screen.getByRole("button", { name: "Open account menu" }))
      .toBeVisible();
  });

  it("should show profile data after profile fetch completes", async () => {
    mockFetchForLogin();

    const url = new URL(window.location.href);
    url.searchParams.set("user", encodeURIComponent(TEST_USER_DID));
    window.history.replaceState({}, "", url.toString());

    const screen = render(
      <RenownProvider appName="test" baseUrl={TEST_BASE_URL}>
        <RenownAuthButton />
      </RenownProvider>,
    );

    // Wait for user button to appear
    await expect
      .element(screen.getByRole("button", { name: "Open account menu" }))
      .toBeVisible();

    // Hover to open popover and check profile data
    await screen.getByRole("button", { name: "Open account menu" }).hover();

    await expect.element(screen.getByText("testuser")).toBeVisible();
  });

  it("should use custom renderAuthenticated when provided", async () => {
    mockFetchForLogin();

    const url = new URL(window.location.href);
    url.searchParams.set("user", encodeURIComponent(TEST_USER_DID));
    window.history.replaceState({}, "", url.toString());

    const screen = render(
      <RenownProvider appName="test" baseUrl={TEST_BASE_URL}>
        <RenownAuthButton
          renderAuthenticated={({ user }) => (
            <span data-testid="custom-auth">Hello {user.address}</span>
          )}
        />
      </RenownProvider>,
    );

    await expect.element(screen.getByTestId("custom-auth")).toBeVisible();
  });

  it("should use custom renderUnauthenticated when provided", async () => {
    const screen = render(
      <RenownAuthButton
        renderUnauthenticated={({ openRenown }) => (
          <button data-testid="custom-login" onClick={openRenown}>
            Custom Login
          </button>
        )}
      />,
    );

    await expect.element(screen.getByTestId("custom-login")).toBeVisible();
  });
});
