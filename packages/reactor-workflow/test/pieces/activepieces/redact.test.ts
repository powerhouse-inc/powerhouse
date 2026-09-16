// Credential redaction: what a journaled error or output may still contain.
import {
  collectSecretValues,
  containsRedactedMarker,
  isRedactableValue,
  isSensitiveName,
  redact,
  redactError,
  redactMessage,
} from "../../../src/pieces/activepieces/worker/redact.js";

const TOKEN = "ghp_9fA3kQ2xZ7rT1nP0bV6mL4sD8wJ5cH";

describe("redactMessage", () => {
  it("replaces a secret value the run resolved", () => {
    expect(
      redactMessage(`POST failed, sent token ${TOKEN} to the API`, {
        values: [TOKEN],
      }),
    ).toBe("POST failed, sent token [redacted:secret] to the API");
  });

  it("replaces the URI-encoded form of a known secret", () => {
    const secret = "p@ssw0rd/with+chars";
    expect(
      redactMessage(`https://api.example.com/x?t=${encodeURIComponent(secret)}`, {
        values: [secret],
      }),
    ).toBe("https://api.example.com/x?t=[redacted:secret]");
  });

  it("redacts a bearer token nobody declared", () => {
    expect(
      redactMessage("Request failed: header was Bearer eyJhbGciOiJIUzI1NiJ9"),
    ).toBe("Request failed: header was Bearer [redacted:bearer]");
  });

  it("redacts an api key in a URL query string", () => {
    expect(
      redactMessage(
        "GET https://api.example.com/v1/items?page=2&api_key=abcd1234efgh failed with 401",
      ),
    ).toBe(
      "GET https://api.example.com/v1/items?page=2&api_key=[redacted:api_key] failed with 401",
    );
  });

  it("redacts a named header quoted inside a message", () => {
    expect(redactMessage('sent {"authorization": "Token abcdefgh12345"}')).toBe(
      'sent {"authorization": "[redacted:authorization]"}',
    );
  });

  it("redacts a webhook signature header written as free text", () => {
    expect(redactMessage("x-hub-signature-256: sha256=deadbeefcafe")).toBe(
      "x-hub-signature-256: [redacted:x-hub-signature-256]",
    );
    expect(redactMessage("Rejected: stripe-signature=t=1,v1=abc")).toContain(
      "stripe-signature=[redacted:stripe-signature]",
    );
  });

  it("leaves an error with no credentials intact", () => {
    const message =
      "Request to https://api.example.com/v1/items?page=2 failed with 500: upstream unavailable";
    expect(redactMessage(message, { values: [TOKEN] })).toBe(message);
  });
});

describe("key-based redaction", () => {
  it("matches a sensitive name whatever its separators or case", () => {
    for (const name of [
      "Authorization",
      "x-api-key",
      "X_API_KEY",
      "apiKey",
      "set-cookie",
      "client_secret",
      "refreshToken",
      "githubToken",
    ]) {
      expect(isSensitiveName(name), name).toBe(true);
    }
  });

  it("leaves names that merely look similar alone", () => {
    for (const name of ["tokens", "maxTokens", "author", "statusCode", "url"]) {
      expect(isSensitiveName(name), name).toBe(false);
    }
  });

  it("redacts a nested header object the run never saw", () => {
    const error = {
      config: {
        url: "https://api.example.com/v1/items",
        headers: {
          Authorization: "Bearer piece-fetched-token-1234",
          "X-Api-Key": "hardcoded-key",
          "content-type": "application/json",
        },
      },
      response: { status: 401, data: { message: "unauthorized" } },
    };

    expect(redact(error)).toEqual({
      config: {
        url: "https://api.example.com/v1/items",
        headers: {
          Authorization: "[redacted:authorization]",
          "X-Api-Key": "[redacted:x-api-key]",
          "content-type": "application/json",
        },
      },
      response: { status: 401, data: { message: "unauthorized" } },
    });
  });

  it("walks arrays", () => {
    expect(redact({ tries: [{ password: "a" }, { ok: true }] })).toEqual({
      tries: [{ password: "[redacted:password]" }, { ok: true }],
    });
  });
});

describe("bounds", () => {
  it("marks a cycle instead of following it", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;
    expect(redact(node)).toEqual({ name: "root", self: "[circular]" });
  });

  it("keeps a repeated object that is not a cycle", () => {
    const shared = { status: 500 };
    expect(redact({ a: shared, b: shared })).toEqual({
      a: { status: 500 },
      b: { status: 500 },
    });
  });

  it("truncates past the depth bound", () => {
    const deep = { a: { b: { c: { d: "leaf" } } } };
    expect(redact(deep, { maxDepth: 2 })).toEqual({
      a: { b: "[truncated]" },
    });
  });

  it("truncates past the node bound", () => {
    const wide = { items: Array.from({ length: 50 }, (_, i) => ({ i })) };
    const result = redact(wide, { maxNodes: 5 }) as {
      items: unknown[];
    };
    expect(result.items).toContain("[truncated]");
  });
});

describe("the value bar", () => {
  it("guesses a credential-shaped value is one", () => {
    expect(isRedactableValue(TOKEN)).toBe(true);
    expect(isRedactableValue("hunter2-longer-passphrase")).toBe(true);
  });

  it("refuses to guess from a short or repetitive value", () => {
    for (const value of ["admin", "8080", "aaaaaaaa", "abababab", ""]) {
      expect(isRedactableValue(value), value).toBe(false);
    }
  });

  it("redacts a declared value whatever its entropy", () => {
    for (const secret of ["hunter2", "s3cr3t!", "aabbccdd"]) {
      expect(redactMessage(`login with ${secret} failed`, {
        values: [secret],
      })).toBe("login with [redacted:secret] failed");
    }
  });

  it("never lets a guessed low-entropy value reach the matcher", () => {
    const values = collectSecretValues({ props: { password: "admin" } });
    expect([...values]).toEqual([]);
  });

  it("collects only the credential-shaped leaves of a connection", () => {
    const values = collectSecretValues({
      type: "CUSTOM_AUTH",
      props: { base_url: "https://x.example", app_token: TOKEN },
      retries: 3,
    });
    expect([...values]).toEqual([TOKEN]);
  });
});

describe("what survives redaction", () => {
  it("keeps the rest of a query string after a redacted parameter", () => {
    expect(
      redactMessage(
        "GET /v1/items?token=abc123XYZ&user=bob&limit=10 failed with 500",
      ),
    ).toBe(
      "GET /v1/items?token=[redacted:token]&user=bob&limit=10 failed with 500",
    );
  });

  it("keeps the rest of a form body after a redacted field", () => {
    expect(redactMessage("body was client_secret=s3cret&grant_type=code")).toBe(
      "body was client_secret=[redacted:client_secret]&grant_type=code",
    );
  });

  it("redacts the password half of URL userinfo, keeping the user", () => {
    expect(
      redactMessage("401 for https://alice:s3cretpassword@host/api"),
    ).toBe("401 for https://alice:[redacted:password]@host/api");
  });

  it("journals a large output whole, and truncates only errors", () => {
    const wide = { items: Array.from({ length: 2000 }, (_, i) => ({ i })) };
    const journaled = redact(wide) as { items: unknown[] };
    expect(journaled.items).toHaveLength(2000);
    expect(journaled.items).not.toContain("[truncated]");

    const bounded = redactError(wide) as { items: unknown[] };
    expect(bounded.items).toContain("[truncated]");
  });

  it("recognises its own markers anywhere in a value", () => {
    expect(containsRedactedMarker({ a: [{ b: "[redacted:token]" }] })).toBe(
      true,
    );
    expect(containsRedactedMarker({ a: [{ b: "fine" }] })).toBe(false);
  });
});
