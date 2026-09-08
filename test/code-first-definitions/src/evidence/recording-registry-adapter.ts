import { sha256 } from "./utils.js";

export type RegistryRequestRecord = {
  readonly sequence: number;
  readonly method: "publish";
  readonly packageName: string;
  readonly version: string;
  readonly bodyDigest: `sha256:${string}`;
};

export class RecordingRegistryAdapter {
  readonly #journal: RegistryRequestRecord[] = [];

  get requestCount(): number {
    return this.#journal.length;
  }

  get journal(): readonly RegistryRequestRecord[] {
    return this.#journal.map((entry) => ({ ...entry }));
  }

  publish(request: {
    readonly packageName: string;
    readonly version: string;
    readonly body: Uint8Array;
  }): Promise<{ readonly ok: true }> {
    this.#journal.push({
      sequence: this.#journal.length + 1,
      method: "publish",
      packageName: request.packageName,
      version: request.version,
      bodyDigest: sha256(request.body),
    });
    return Promise.resolve({ ok: true });
  }
}
