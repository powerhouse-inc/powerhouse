import type {
  AuthSubject,
  PHAuthState,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  decide,
  groupDocumentType,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { ReactorFeatureFlags } from "../executor/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import type { IDocumentView } from "../storage/interfaces.js";
import { buildDecisionModel } from "./build-decision-model.js";
import type { RegisteredDecisionModel } from "./registered-model.js";
import { selectDecisionModel } from "./registered-model.js";
import type { IStreamStateReader } from "./types.js";

/**
 * Scopes every holder of a document may read, whatever the grants say. Denying
 * the policy itself would let a replica sync a document without it, read the
 * auth scope as uninitialized, and allow every operation it holds, so replicas
 * would diverge permanently. The document scope carries the metadata the same
 * argument covers. Grants gate domain-scope reads only.
 */
export const ALWAYS_READABLE_SCOPES: ReadonlySet<string> = new Set([
  "auth",
  "document",
]);

/**
 * The branch a group is read on. A group's member list lives on its main
 * branch whatever branch the document naming it is on, and the reference
 * relation records no branch of its own.
 */
const GROUP_BRANCH = "main";

/**
 * The scope of a group document that holds its member list. It is the only
 * scope group serving reaches, because it is the only one the audience must
 * fold in order to evaluate auth with the group.
 */
const GROUP_MEMBERSHIP_SCOPE = "global";

/**
 * How many of a group's referencing documents are examined before a read of
 * that group gives up and withholds. Each one costs a model build, and the
 * relation is append-only, so an old and briefly-held reference still counts.
 * Matches the cap a version-1 policy carries on its own grant list.
 */
const MAX_EXAMINED_REFERENCERS = 100;

/**
 * The policy carried on a document, if it carries one. A document handed to the
 * gate with no state at all is not policied, so it is not gated.
 */
function authOf(document: PHDocument): PHAuthState | undefined {
  const state = document.state as { auth?: PHAuthState } | undefined;
  return state?.auth;
}

/** Whether a subject may read each scope of one document. */
export interface IReadGate {
  /**
   * Resolves, for one document, which of its scopes the subject may read.
   *
   * The predicate is resolved up front rather than asked per scope so that the
   * filtering itself stays synchronous, and so that a model backing the answer
   * is built once per document instead of once per scope.
   */
  scopePredicate(
    document: PHDocument,
    subject: AuthSubject,
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean>;
}

/**
 * The model reads enforce. Below `authEnforcement` there is no model to
 * enforce: the document-only model ignores the auth scope entirely, so reading
 * through it would serve every domain scope of a policied document to anyone.
 * Undefined therefore means "evaluate the policy alone", which is what the read
 * surface did before the model existed.
 */
export function readDecisionModel(
  flags: ReactorFeatureFlags,
  registry: IDocumentModelRegistry,
): RegisteredDecisionModel | undefined {
  return flags.authEnforcement
    ? selectDecisionModel(flags, registry)
    : undefined;
}

/**
 * Evaluates the policy on its own, with no groups map and no condition context.
 * A `{ group }` or conditional grant therefore never applies: an allow that
 * does not apply withholds access, so this cannot widen a policy, but a policy
 * relying on a conditional deny is weaker here than it is written.
 */
export class BareReadGate implements IReadGate {
  scopePredicate(
    document: PHDocument,
    subject: AuthSubject,
  ): Promise<(scope: string) => boolean> {
    const auth = authOf(document);
    return Promise.resolve(
      (scope: string) =>
        ALWAYS_READABLE_SCOPES.has(scope) ||
        decide(auth, subject, { verb: "read", scope }) === "allow",
    );
  }
}

/**
 * Answers a stream read from the document already fetched, and anything else
 * through the read side.
 *
 * The seed is why routing reads through a decision model costs no extra I/O for
 * the document being read: its `document` and `auth` scopes are the two static
 * projections, and the caller has both in hand. Only a group stream the grant
 * list names is fetched.
 */
class SeededStateReader implements IStreamStateReader {
  constructor(
    private readonly documentView: IDocumentView,
    private readonly seed: PHDocument,
    private readonly branch: string,
  ) {}

  async getState(
    documentId: string,
    scope: string,
    branch: string,
    targetRevision?: number,
    signal?: AbortSignal,
  ): Promise<PHDocument> {
    if (
      targetRevision === undefined &&
      documentId === this.seed.header.id &&
      branch === this.branch &&
      scope in (this.seed.state as Record<string, unknown>)
    ) {
      return this.seed;
    }

    try {
      return await this.documentView.get(
        documentId,
        { branch, scopes: [scope] },
        undefined,
        signal,
      );
    } catch (error) {
      // A stream this replica does not hold has to reach buildDecisionModel as
      // the absence it recognises, or the whole read fails instead of leaving
      // the group out of the model, where its principal does not match and the
      // policy fails closed. The read side reports absence as a plain Error, so
      // the absence is confirmed rather than inferred from the message: a
      // transient failure must surface, not silently deny.
      await this.assertAbsent(documentId, error, signal);
      throw new DocumentNotFoundError(documentId);
    }
  }

  private async assertAbsent(
    documentId: string,
    error: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    if (DocumentNotFoundError.isError(error)) {
      return;
    }

    let exists: boolean[];
    try {
      exists = await this.documentView.exists([documentId], undefined, signal);
    } catch {
      throw error;
    }

    if (exists[0]) {
      throw error;
    }
  }
}

/**
 * Evaluates a read against the registered decision model, built at the stream
 * heads. This is what makes `{ group }` principals and conditional grants apply
 * to a read: the model supplies the groups map and the scope's own state, the
 * same two things admission supplies.
 *
 * A read has no action, so a condition on `action.input.*` never holds for one.
 *
 * State is read through the read side rather than the write cache. The write
 * cache is invalidated by whichever process runs the executor, so a reactor
 * running its executors in worker processes would answer reads in the parent
 * from state no commit ever invalidates.
 */
export class ModelReadGate implements IReadGate {
  constructor(
    private readonly model: RegisteredDecisionModel,
    private readonly documentView: IDocumentView,
    /**
     * Whether a group a policy names is served to that policy's audience. Only
     * meaningful with `authGroups`, which is what makes a `{ group }` grant
     * match at all; below it the grant fails closed, so serving the roster
     * would publish a member list no read grant can use.
     */
    private readonly servesGroups: boolean,
    private readonly operationIndex?: IOperationIndex,
    private readonly logger?: ILogger,
  ) {}

  async scopePredicate(
    document: PHDocument,
    subject: AuthSubject,
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean> {
    const own = await this.ownPolicyPredicate(
      document,
      subject,
      branch,
      signal,
    );

    // The member list, and only it. What the audience is owed is the state it
    // must fold to evaluate auth with this group; a group's other scopes are
    // its own business and stay behind its own grants.
    if (!this.servesGroup(document) || own(GROUP_MEMBERSHIP_SCOPE)) {
      return own;
    }

    const audience = await this.servesGroupTo(
      document.header.id,
      subject,
      signal,
    );

    return (scope: string) =>
      own(scope) || (audience && scope === GROUP_MEMBERSHIP_SCOPE);
  }

  /**
   * Whether the subject is served this group because a policy names it.
   *
   * A replica must fold a group's membership to evaluate auth with it, so a
   * group a grant names is served to the audience of the document that names
   * it, whatever the group's own read grants say. Naming a group in a policy
   * publishes its roster to that policy's audience; a group whose membership
   * must stay confidential does not belong in a grant.
   *
   * The referencing document's own domain scopes are the test. Its `auth` and
   * `document` scopes are readable by every holder, so testing those would
   * serve every referenced group to everybody.
   *
   * One level only. A referencer that is itself a group is skipped, and a
   * referencer's own readability is decided from its policy alone, so a
   * reference cycle terminates. Cycles are reachable: the reference relation
   * is recorded from an operation's input, including one later stored denied,
   * so a refused grant naming a group from inside another group leaves a row
   * behind that validation never saw.
   */
  private async servesGroupTo(
    groupId: string,
    subject: AuthSubject,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.operationIndex) {
      return false;
    }

    const referencers = await this.operationIndex.getGroupReferencers(
      groupId,
      signal,
    );

    // A group named by an unbounded number of documents would otherwise cost
    // one model build each on every read of it. Truncating denies, which is
    // the direction that withholds.
    const examined = referencers.slice(0, MAX_EXAMINED_REFERENCERS);
    if (examined.length < referencers.length) {
      this.logger?.warn(
        `Group ${groupId} is referenced by ${referencers.length} documents; only the first ${MAX_EXAMINED_REFERENCERS} decide whether it is served`,
      );
    }

    for (const referencerId of examined) {
      if (await this.servesThrough(referencerId, subject, signal)) {
        return true;
      }
    }

    return false;
  }

  /** Whether one referencing document serves the subject any domain scope. */
  private async servesThrough(
    referencerId: string,
    subject: AuthSubject,
    signal?: AbortSignal,
  ): Promise<boolean> {
    let referencer: PHDocument;
    try {
      // The main branch, because the reference relation records no branch: a
      // group's member list lives there whatever branch names it.
      referencer = await this.documentView.get(
        referencerId,
        { branch: GROUP_BRANCH },
        undefined,
        signal,
      );
    } catch {
      // A referencer this replica does not hold serves nothing, which fails
      // closed the same way a group it does not hold does.
      return false;
    }

    if (this.servesGroup(referencer)) {
      return false;
    }

    const readable = await this.ownPolicyPredicate(
      referencer,
      subject,
      GROUP_BRANCH,
      signal,
    );

    return Object.keys((referencer.state ?? {}) as Record<string, unknown>)
      .filter((scope) => !ALWAYS_READABLE_SCOPES.has(scope))
      .some((scope) => readable(scope));
  }

  private servesGroup(document: PHDocument): boolean {
    return (
      this.servesGroups &&
      this.operationIndex !== undefined &&
      document.header.documentType === groupDocumentType
    );
  }

  /** What this document's own policy says, with no group serving applied. */
  private async ownPolicyPredicate(
    document: PHDocument,
    subject: AuthSubject,
    branch: string,
    signal?: AbortSignal,
  ): Promise<(scope: string) => boolean> {
    const auth = authOf(document);

    // An unpoliced document is readable in full, which is the common case and
    // the one worth answering without building anything. The test is the one
    // `evaluate` makes: a legacy `{}` auth scope and version 0 both mean
    // uninitialized, and "no grants" does not, because a policy with a
    // version and an empty grant list denies everything.
    if (!auth || !auth.version) {
      return () => true;
    }

    const target = { documentId: document.header.id, branch };
    const built = await buildDecisionModel(
      new SeededStateReader(this.documentView, document, branch),
      this.model,
      target,
      signal,
    );

    // The read-set the build recorded guards a write, and a read makes none.
    const definition = this.model(target);
    const scopeStates = (document.state ?? {}) as Record<string, unknown>;

    return (scope: string) =>
      ALWAYS_READABLE_SCOPES.has(scope) ||
      definition.decide(
        built.model,
        subject,
        { verb: "read", scope },
        { scopeState: scopeStates[scope], actionInput: undefined },
      ).decision === "allow";
  }
}
