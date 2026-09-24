// The @ts-expect-error lines are the type half of this suite; tsc checks them.
import { describe, expect, it } from "vitest";
import { PieceAuth, Property } from "../src/index.js";

const server = { apiUrl: "http://api", publicUrl: "http://public" };

describe("getConnectionIdentifier", () => {
  it("is handed a custom auth's props flat, not the { type, props } envelope", async () => {
    const auth = PieceAuth.CustomAuth({
      displayName: "CRM",
      required: true,
      props: {
        base_url: Property.ShortText({
          displayName: "Base URL",
          required: true,
        }),
        token: PieceAuth.SecretText({ displayName: "Token", required: true }),
      },
      getConnectionIdentifier: ({ auth }) => {
        // @ts-expect-error the props are the value itself
        void auth.props;
        return Promise.resolve(`crm @ ${auth.base_url}`);
      },
    });
    await expect(
      auth.getConnectionIdentifier?.({
        auth: { base_url: "https://crm.example", token: "t" },
        server,
      }),
    ).resolves.toBe("crm @ https://crm.example");
  });

  it("is handed a secret-text auth's token as a string", async () => {
    const auth = PieceAuth.SecretText({
      displayName: "Token",
      required: true,
      getConnectionIdentifier: ({ auth }) => {
        // @ts-expect-error the token is the value itself
        void auth.secret_text;
        return Promise.resolve(auth.slice(0, 3));
      },
    });
    await expect(
      auth.getConnectionIdentifier?.({ auth: "tok_123", server }),
    ).resolves.toBe("tok");
  });

  it("returns a string label or nothing", () => {
    PieceAuth.SecretText({
      displayName: "Token",
      required: true,
      getConnectionIdentifier: () => Promise.resolve(undefined),
    });
    PieceAuth.SecretText({
      displayName: "Token",
      required: true,
      // @ts-expect-error a label is a string
      getConnectionIdentifier: () => Promise.resolve({ name: "crm" }),
    });
  });
});
