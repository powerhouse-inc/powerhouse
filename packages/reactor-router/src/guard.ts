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

  constructor(
    private readonly probe: OwnershipProbe,
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
    if (answer === "no") {
      throw new WrongBackendError({
        documentId: identifier,
        rejectedBy: backend.name,
        operation,
      });
    }
  }

  forget(backend: RouterBackend, identifier: string): void {
    this.owned.delete(`${backend.name}\u0000${identifier}`);
  }
}
