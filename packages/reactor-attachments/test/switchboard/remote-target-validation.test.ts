import { describe, expect, it, vi } from "vitest";
import { RemoteReservationStore } from "../../src/switchboard/remote-reservation-store.js";

const BASE_RESPONSE = {
  reservationId: "r-target",
  expiresAtUtc: "2026-07-21T12:00:00.000Z",
};

describe("RemoteReservationStore transfer target boundary", () => {
  it("parses and preserves a valid upload target from the reserve response", async () => {
    const url = "https://s3.example.test/key?X-Amz-Signature=opaque%2Bvalue";
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...BASE_RESPONSE,
          uploadTarget: {
            kind: "presigned-put",
            method: "PUT",
            url,
            headers: { "x-amz-checksum-sha256": "checksum=" },
            expiresAtUtc: BASE_RESPONSE.expiresAtUtc,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    const store = new RemoteReservationStore({
      remoteUrl: "https://switchboard.test",
      fetchFn,
    });

    const reservation = await store.create({
      mimeType: "application/pdf",
      fileName: "statement.pdf",
    });

    expect(reservation.uploadTarget).toEqual({
      kind: "presigned-put",
      method: "PUT",
      url,
      headers: { "x-amz-checksum-sha256": "checksum=" },
      expiresAtUtc: BASE_RESPONSE.expiresAtUtc,
    });
  });

  it("rejects a malformed target instead of trusting reserve JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...BASE_RESPONSE,
          uploadTarget: {
            kind: "presigned-put",
            method: "POST",
            url: "https://s3.example.test/key",
            headers: {},
            expiresAtUtc: BASE_RESPONSE.expiresAtUtc,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    const store = new RemoteReservationStore({
      remoteUrl: "https://switchboard.test",
      fetchFn,
    });

    await expect(
      store.create({ mimeType: "text/plain", fileName: "x.txt" }),
    ).rejects.toThrow(/method must be PUT/);
  });
});
