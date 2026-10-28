import { parseAttachmentStorageConfig } from "@powerhousedao/reactor-attachments";
import { describe, expect, it, vi } from "vitest";
import { createStartupAttachmentBackend } from "../src/attachment-backend.js";

const S3 = parseAttachmentStorageConfig({
  PH_ATTACHMENT_STORAGE: "s3",
  PH_ATTACHMENT_S3_ENDPOINT: "https://s3.example.test",
  PH_ATTACHMENT_S3_REGION: "eu-central",
  PH_ATTACHMENT_S3_BUCKET: "attachments",
  PH_ATTACHMENT_S3_ACCESS_KEY_ID: "test-key",
  PH_ATTACHMENT_S3_SECRET_ACCESS_KEY: "test-secret",
});
const db = { withSchema: vi.fn().mockReturnValue({}) };

describe("createStartupAttachmentBackend", () => {
  it("keeps filesystem as default without S3 activity", async () => {
    const send = vi.fn();
    await expect(
      createStartupAttachmentBackend({
        db: db as never,
        s3Dependencies: { client: { send } },
      }),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("selects ready S3", async () => {
    const send = vi.fn().mockResolvedValue({});
    const backend = await createStartupAttachmentBackend({
      db: db as never,
      storage: S3,
      s3Dependencies: { client: { send } },
    });
    expect(backend?.kind).toBe("s3");
    expect(send).toHaveBeenCalledOnce();
  });

  it.each([
    ["AccessDenied", 403],
    ["ServiceUnavailable", 503],
  ])("fails closed for readiness %s", async (name, status) => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error("provider error"), {
        name,
        $metadata: { httpStatusCode: status },
      }),
    );
    await expect(
      createStartupAttachmentBackend({
        db: db as never,
        storage: S3,
        s3Dependencies: { client: { send } },
      }),
    ).rejects.toThrow("S3 attachment backend readiness check failed");
  });
});
