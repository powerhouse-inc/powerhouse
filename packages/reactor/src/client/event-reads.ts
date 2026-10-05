import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { IReactor } from "../core/types.js";
import type {
  IReadGate,
  SubjectScopePredicate,
} from "../decision/read-gate.js";
import type { ViewFilter } from "../shared/types.js";
import type {
  DocumentExistence,
  IDocumentView,
} from "../storage/interfaces.js";

/** One change event's reads, shared by every subscription it reaches. */
export class EventReads {
  private readonly documents = new Map<string, Promise<PHDocument>>();
  private readonly existence = new Map<string, Promise<boolean[]>>();
  private readonly prepared = new WeakMap<
    PHDocument,
    Map<string, Promise<SubjectScopePredicate>>
  >();

  constructor(
    private readonly reactor: IReactor,
    private readonly documentView: IDocumentView,
    private readonly readGate: IReadGate,
  ) {}

  get(id: string, view: ViewFilter | undefined): Promise<PHDocument> {
    const key = JSON.stringify([id, view?.branch, view?.scopes]);
    let read = this.documents.get(key);
    if (!read) {
      read = this.reactor.get(id, view);
      this.documents.set(key, read);
    }
    return read;
  }

  exists(ids: string[], existence: DocumentExistence): Promise<boolean[]> {
    const key = JSON.stringify([ids, existence]);
    let read = this.existence.get(key);
    if (!read) {
      read = this.documentView.exists(ids, existence);
      this.existence.set(key, read);
    }
    return read;
  }

  async scopePredicate(
    document: PHDocument,
    subject: AuthSubject,
    branch: string,
  ): Promise<(scope: string) => boolean> {
    if (!this.readGate.prepare) {
      return this.readGate.scopePredicate(document, subject, branch);
    }

    let byBranch = this.prepared.get(document);
    if (!byBranch) {
      byBranch = new Map();
      this.prepared.set(document, byBranch);
    }
    let prepared = byBranch.get(branch);
    if (!prepared) {
      prepared = this.readGate.prepare(document, branch);
      byBranch.set(branch, prepared);
    }
    return (await prepared)(subject);
  }
}

// The subscription manager notifies every subscription in one synchronous pass.
export class EventReadsSource {
  private current: EventReads | undefined;

  constructor(
    private readonly reactor: IReactor,
    private readonly documentView: IDocumentView,
    private readonly readGate: IReadGate,
  ) {}

  forEvent(): EventReads {
    if (!this.current) {
      this.current = new EventReads(
        this.reactor,
        this.documentView,
        this.readGate,
      );
      queueMicrotask(() => {
        this.current = undefined;
      });
    }
    return this.current;
  }
}
