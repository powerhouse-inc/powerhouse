export class SimpleSigner {
  private secretKey: string;

  constructor(secretKey: string = "test-secret-key") {
    this.secretKey = secretKey;
  }

  async sign(data: Uint8Array): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      data.buffer as ArrayBuffer,
    );
    return this.ab2hex(signature);
  }

  async verify(data: Uint8Array, signatureHex: string): Promise<boolean> {
    const expected = await this.sign(data);
    return expected === signatureHex;
  }

  getPublicKey(): string {
    return `0x${this.ab2hex(new TextEncoder().encode(this.secretKey))}`;
  }

  private ab2hex(ab: ArrayBuffer | Uint8Array): string {
    const view = ab instanceof Uint8Array ? ab : new Uint8Array(ab);
    return Array.from(view)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
}
