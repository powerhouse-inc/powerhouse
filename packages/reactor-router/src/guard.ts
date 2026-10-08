import type { RouterBackend } from "./backend.js";
import { WrongBackendError } from "./errors.js";
import { BoundedMap } from "./table.js";

export type Ownership = "yes" | "no" | "unknown";

/** Answers whether a backend holds an identifier; never throws. */
export type OwnershipProbe = (
  backend: RouterBackend,
  identifier: string,
) => Promise<Ownership>;

/** Router-side misroute refusal for backends that do not refuse themselves. */
export class OwnershipGuard {
  private readonly owned: BoundedMap;

  /** `probe` asks one backend; `others` asks every backend but the given one. */
  constructor(
    private readonly probe: OwnershipProbe,
    private readonly others: (
      backend: RouterBackend,
      identifier: string,
    ) => Promise<readonly Ownership[]>,
    cacheSize: number,
  ) {
    this.owned = new BoundedMap(cacheSize);
  }

  async assertOwned(
    backend: RouterBackend,
    identifier: string,
    operation: string,
  ): Promise<void> {
    if (backend.refusesMisroutes || identifier === "") {
      return;
    }
    const key = `${backend.name}\u0000${identifier}`;
    if (this.owned.get(key) !== "") {
      return;
    }
    const answer = await this.probe(backend, identifier);
    if (answer === "yes") {
      this.owned.set(key, backend.name);
      return;
    }
    if (answer === "no" && (await this.heldElsewhere(backend, identifier))) {
      throw new WrongBackendError({
        documentId: identifier,
        rejectedBy: backend.name,
        operation,
      });
    }
  }

  /** When no backend holds it, the backend itself reports not-found. */
  private async heldElsewhere(
    backend: RouterBackend,
    identifier: string,
  ): Promise<boolean> {
    const answers = await this.others(backend, identifier);
    return answers.some((answer) => answer !== "no");
  }

  forget(backend: RouterBackend, identifier: string): void {
    this.owned.delete(`${backend.name}\u0000${identifier}`);
  }
}
