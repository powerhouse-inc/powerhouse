import type { RouterBackend } from "./backend.js";
import { WrongBackendError } from "./errors.js";
import { BoundedMap } from "./table.js";

export type Ownership = "yes" | "no" | "unknown";

/** Answers whether a backend holds an identifier; never throws. */
export type OwnershipProbe = (
  backend: RouterBackend,
  identifier: string,
) => Promise<Ownership>;

/** One other backend's answer. */
export type OtherOwnership = {
  readonly backend: string;
  readonly answer: Ownership;
};

/** Router-side misroute refusal for backends that do not refuse themselves. */
export class OwnershipGuard {
  private readonly owned: BoundedMap;

  /** `probe` asks one backend; `others` asks every backend but the given one. */
  constructor(
    private readonly probe: OwnershipProbe,
    private readonly others: (
      backend: RouterBackend,
      identifier: string,
    ) => Promise<readonly OtherOwnership[]>,
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
    if ((await this.ownership(backend, identifier)) !== "no") {
      return;
    }
    const answers = await this.others(backend, identifier);
    if (answers.some(({ answer }) => answer !== "no")) {
      throw new WrongBackendError({
        documentId: identifier,
        rejectedBy: backend.name,
        operation,
      });
    }
  }

  /**
   * For an id the operation creates: refuses only when another backend holds
   * it, naming that backend. A refusing backend is checked too, since it
   * cannot know a create duplicates an id held elsewhere.
   */
  async assertNotHeldElsewhere(
    backend: RouterBackend,
    identifier: string,
    operation: string,
  ): Promise<void> {
    if (identifier === "") {
      return;
    }
    if ((await this.ownership(backend, identifier)) === "yes") {
      return;
    }
    const answers = await this.others(backend, identifier);
    const holder = answers.find(({ answer }) => answer === "yes");
    if (holder !== undefined) {
      throw new WrongBackendError({
        documentId: identifier,
        ownerHint: holder.backend,
        rejectedBy: backend.name,
        operation,
      });
    }
  }

  forget(backend: RouterBackend, identifier: string): void {
    this.owned.delete(`${backend.name}\u0000${identifier}`);
  }

  private async ownership(
    backend: RouterBackend,
    identifier: string,
  ): Promise<Ownership> {
    const key = `${backend.name}\u0000${identifier}`;
    if (this.owned.get(key) !== "") {
      return "yes";
    }
    const answer = await this.probe(backend, identifier);
    if (answer === "yes") {
      this.owned.set(key, backend.name);
    }
    return answer;
  }
}
