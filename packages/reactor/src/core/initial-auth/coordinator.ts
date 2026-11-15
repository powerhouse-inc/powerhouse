import {
  AuthBootstrapError,
  groupDocumentType,
  creationActions,
  deriveDocumentId,
  initialAuthDigest,
  initializeAuth,
  parseInitialAuthCommitment,
  type Action,
  type ISigner,
  type PHDocument,
  type PHAuthState,
  type ResolvedInitialAuthBindings,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import type { Kysely } from "kysely";
import type { IWriteCache } from "../../cache/write/interfaces.js";
import type { IDocumentModelRegistry } from "../../registry/interfaces.js";
import type { IOperationStore } from "../../storage/interfaces.js";
import type { Database } from "../../storage/kysely/types.js";
import { authConditionsDecisionModel } from "../../decision/auth-decision-model.js";
import { buildDecisionModel } from "../../decision/build-decision-model.js";
import { domainScopesOf } from "../../decision/read-gate.js";
import {
  KyselyInitialAuthStore,
  type InitialAuthFact,
} from "../../storage/kysely/initial-auth-store.js";
import { findPurged } from "../../storage/kysely/document-purges.js";
import { signActions } from "../utils.js";
import { freezeInitialAuthValue } from "./provider.js";
import type {
  InitialAuthConfiguration,
  InitialAuthCreationRequest,
  InitialAuthProviderContext,
} from "./provider.js";

export class InitialAuthCoordinator {
  private readonly store: KyselyInitialAuthStore;
  constructor(
    private readonly configuration: InitialAuthConfiguration,
    private readonly registry: IDocumentModelRegistry,
    private readonly database: Kysely<Database>,
    private readonly operations: IOperationStore,
    private readonly cache: IWriteCache,
  ) {
    this.store = new KyselyInitialAuthStore(database);
    const configured = new Set<string>();
    for (const provider of configuration.providers) {
      const key = `${provider.model.documentModel.global.id}@${provider.model.version ?? 1}`;
      if (configured.has(key))
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          `Duplicate initial authorization provider for ${key}.`,
        );
      configured.add(key);
      const selected = registry.getModule(
        provider.model.documentModel.global.id,
        provider.model.version ?? 1,
      );
      if (
        !selected.initialAuth ||
        selected.initialAuth.template.digest !== provider.templateDigest
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "The provider does not match the registered model's initial authorization template.",
        );
    }
  }

  protectedModel(document: PHDocument): boolean {
    return (
      this.registry.getModule(
        document.header.documentType,
        document.state.document.version,
      ).initialAuth !== undefined
    );
  }

  async resumeCopy(
    request: InitialAuthCreationRequest,
    copyRequest: {
      sourceIdentifier: string;
      options?: { name?: string; protocolVersions?: Record<string, number> };
    },
  ) {
    const intentKey = initialAuthDigest({ ...request, kind: "copy" });
    const stored = await this.store.intent(intentKey);
    if (!stored) return undefined;
    if (stored.requestDigest !== initialAuthDigest(copyRequest))
      throw new AuthBootstrapError(
        "intent-conflict",
        "This copy intent was already used with a different request.",
      );
    if (
      (await findPurged(this.database, [stored.documentId])).has(
        stored.documentId,
      )
    )
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "The copy identity has been purged.",
      );
    const { branch } = z
      .object({ branch: z.string() })
      .parse(stored.envelope[0]?.input);
    return { documentId: stored.documentId, branch, actions: stored.envelope };
  }

  async prepare(
    document: PHDocument,
    request: InitialAuthCreationRequest,
    signer: ISigner,
    signal?: AbortSignal,
    copySource?: PHDocument,
    copyRequest?: {
      sourceIdentifier: string;
      options?: { name?: string; protocolVersions?: Record<string, number> };
    },
  ): Promise<{ document: PHDocument; actions: Action[] }> {
    signal?.throwIfAborted();
    z.object({
      requester: z
        .object({ address: z.string().optional(), key: z.string().optional() })
        .strict(),
      idempotencyKey: z.string().min(1),
      context: z.string().min(1),
    })
      .strict()
      .parse(request);
    const draft = structuredClone(document);
    const bootstrapVersion = draft.header.protocolVersions?.["auth-bootstrap"];
    if (
      bootstrapVersion !== undefined &&
      (!copySource || bootstrapVersion !== 1)
    )
      throw new AuthBootstrapError(
        "unsupported-bootstrap",
        "An uninitialized draft cannot select or override its bootstrap commitment protocol.",
      );
    const signatureVersion = draft.header.protocolVersions?.signature;
    if (signatureVersion !== undefined && signatureVersion !== 2)
      throw new AuthBootstrapError(
        "unsupported-bootstrap",
        "Protected creation requires signature protocol 2.",
      );
    const modelVersion = draft.state.document.version;
    const model = this.registry.getModule(
      draft.header.documentType,
      modelVersion,
    );
    const provider = this.configuration.providers.find(
      (candidate) =>
        candidate.model.documentModel.global.id === draft.header.documentType &&
        (candidate.model.version ?? 1) === modelVersion,
    );
    if (
      !signer.app?.key ||
      (copySource
        ? !provider && !this.configuration.authorizeCopy
        : !model.initialAuth ||
          !provider ||
          provider.templateDigest !== model.initialAuth.template.digest)
    )
      throw new AuthBootstrapError(
        "unsupported-bootstrap",
        "Protected creation requires its model provider and a signing initializer.",
      );
    const carriesHistory = Object.entries(draft.operations).some(
      ([scope, operations]) =>
        scope === "document"
          ? operations.length > 2 ||
            operations.some(
              (operation, index) =>
                operation.action.type !==
                  (index === 0 ? "CREATE_DOCUMENT" : "UPGRADE_DOCUMENT") ||
                operation.action.context?.signer !== undefined,
            )
          : operations.length > 0,
    );
    if (
      draft.header.initialAuth ||
      Object.keys(draft.header.sig.publicKey).length !== 0 ||
      draft.state.auth.version !== 0 ||
      draft.state.auth.grants.length !== 0 ||
      draft.state.auth.creator !== undefined ||
      carriesHistory
    )
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "Protected creation requires an uninitialized draft, without supplied authorization or history.",
      );
    if (!model.utils.isStateOfType(draft.state))
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "The requested initial state does not satisfy the document model.",
      );
    const intentKey = copyRequest
      ? initialAuthDigest({ ...request, kind: "copy" })
      : initialAuthDigest({
          requester: request.requester,
          context: request.context,
          idempotencyKey: request.idempotencyKey,
          documentType: draft.header.documentType,
        });
    const copy = copySource
      ? {
          source: {
            documentId: copySource.header.id,
            branch: copySource.header.branch,
            revision: copySource.header.revision,
          },
          policy: copySource.state.auth,
        }
      : undefined;
    const requestDigest = initialAuthDigest(
      copyRequest ?? {
        modelVersion,
        state: draft.state,
        name: draft.header.name,
        slug: draft.header.slug,
        meta: draft.header.meta ?? {},
        branch: draft.header.branch,
        protocolVersions: draft.header.protocolVersions ?? {},
        ...(copy ? { copy } : {}),
      },
    );
    const previous = await this.store.intent(intentKey);
    if (previous) {
      if (previous.requestDigest !== requestDigest)
        throw new AuthBootstrapError(
          "intent-conflict",
          "This creation intent was already used with a different request.",
        );
      if (
        (await findPurged(this.database, [previous.documentId])).has(
          previous.documentId,
        )
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "The creation identity has been purged.",
        );
      return this.prepared(draft, previous.documentId, previous.envelope);
    }
    const facts: InitialAuthFact[] = [];
    const readSnapshot = async (
      documentId: string,
      branch = "main",
    ): Promise<PHDocument> => {
      const before = await this.operations.getRevisions(
        documentId,
        branch,
        signal,
      );
      const snapshot = structuredClone(
        await this.cache.getState(
          documentId,
          "document",
          branch,
          (before.revision.document ?? 0) - 1,
          signal,
        ),
      );
      for (const scope of ["global", "local", "auth"] as const) {
        const scoped = await this.cache.getState(
          documentId,
          scope,
          branch,
          (before.revision[scope] ?? 0) - 1,
          signal,
        );
        const entry = Object.entries(scoped.state).find(
          ([name]) => name === scope,
        );
        if (entry) Object.assign(snapshot.state, Object.fromEntries([entry]));
      }
      const after = await this.operations.getRevisions(
        documentId,
        branch,
        signal,
      );
      if (
        initialAuthDigest(before.revision) !== initialAuthDigest(after.revision)
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "A creation authorization fact changed while it was being read; retry creation.",
        );
      facts.push({ documentId, branch, revision: after.revision });
      return snapshot;
    };
    const context: InitialAuthProviderContext = {
      requester: freezeInitialAuthValue(structuredClone(request.requester)),
      initialState: freezeInitialAuthValue(structuredClone(draft.state)),
      context: request.context,
      read: async (documentId, branch = "main") =>
        freezeInitialAuthValue(await readSnapshot(documentId, branch)),
    };
    let resolved:
      | {
          kind: "template";
          templateDigest: string;
          bindings: ResolvedInitialAuthBindings;
          policy: PHAuthState;
        }
      | {
          kind: "copy";
          source: NonNullable<typeof copy>["source"];
          policy: PHAuthState;
        };
    if (copy && copySource) {
      const current = await this.operations.getRevisions(
        copy.source.documentId,
        copy.source.branch,
        signal,
      );
      if (
        [
          ...new Set([
            ...Object.keys(current.revision),
            ...Object.keys(copy.source.revision),
          ]),
        ].some(
          (scope) =>
            (current.revision[scope] ?? 0) !==
            (copy.source.revision[scope] ?? 0),
        )
      )
        throw new AuthBootstrapError(
          "intent-conflict",
          "The copy source changed; reread it before copying.",
        );
      facts.push({ ...copy.source, revision: current.revision });
      const target = {
        documentId: copy.source.documentId,
        branch: copy.source.branch,
      };
      const definition = authConditionsDecisionModel(this.registry);
      const built = await buildDecisionModel(
        {
          getState: (documentId, _scope, branch) =>
            documentId === target.documentId && branch === target.branch
              ? Promise.resolve(copySource)
              : readSnapshot(documentId, branch),
        },
        definition,
        target,
        signal,
      );
      const scopeStates = new Map(Object.entries(copySource.state));
      if (
        !domainScopesOf(copySource).every(
          (scope) =>
            definition(target).decide(
              built.model,
              request.requester,
              { verb: "read", scope },
              { scopeState: scopeStates.get(scope) },
            ).decision === "allow",
        )
      )
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "Copying requires access to every source domain scope.",
        );
      if (provider) await provider.authorizeCreation(context);
      else if (this.configuration.authorizeCopy)
        await this.configuration.authorizeCopy({
          ...context,
          source: freezeInitialAuthValue(structuredClone(copySource)),
        });
      resolved = {
        kind: "copy",
        source: copy.source,
        policy: structuredClone(copy.policy),
      };
    } else {
      if (!provider || !model.initialAuth)
        throw new AuthBootstrapError(
          "unsupported-bootstrap",
          "The selected model has no configured initial authorization provider.",
        );
      resolved = {
        kind: "template",
        templateDigest: model.initialAuth.template.digest,
        ...(await provider.prepare(context)),
      };
    }
    const requiredGroups = resolved.policy.grants.flatMap((grant) =>
      "group" in grant.principal ? [grant.principal.group] : [],
    );
    if ("bindings" in resolved && model.initialAuth)
      for (const [key, declaration] of Object.entries(
        model.initialAuth.template.bindings,
      )) {
        if (declaration.kind === "group")
          requiredGroups.push(resolved.bindings[declaration.source][key]);
      }
    for (const groupId of new Set(requiredGroups)) {
      const group = await context.read(groupId);
      if (group.header.documentType !== groupDocumentType)
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "An initial authorization group must reference a valid group document.",
        );
      const groupModel = this.registry.getModule(
        groupDocumentType,
        group.state.document.version,
      );
      if (!groupModel.utils.isStateOfType(group.state))
        throw new AuthBootstrapError(
          "invalid-bootstrap",
          "An initial authorization group must reference a valid group document.",
        );
    }
    const protocols = {
      ...draft.header.protocolVersions,
      signature: 2,
      "auth-bootstrap": 1,
    };
    const actions = [
      ...creationActions(draft, protocols),
      initializeAuth({ version: 1, grants: resolved.policy.grants }),
    ];
    const intent = {
      ...(resolved.kind === "copy"
        ? { kind: resolved.kind, source: resolved.source }
        : {
            kind: resolved.kind,
            templateDigest: resolved.templateDigest,
            bindings: resolved.bindings,
          }),
      version: 1,
      initializerKey: signer.app.key,
      origin: signer.app.key,
      modelVersion,
      stateDigest: initialAuthDigest(draft.state),
      policyDigest: initialAuthDigest(resolved.policy),
      actionIds: actions.map((action) => action.id),
    };
    const commitment = parseInitialAuthCommitment({
      ...intent,
      intentDigest: initialAuthDigest(intent),
    });
    draft.header.protocolVersions = protocols;
    draft.header.initialAuth = commitment;
    draft.header.id = deriveDocumentId({
      documentType: draft.header.documentType,
      createdAtUtcIso: draft.header.createdAtUtcIso,
      nonce: draft.header.sig.nonce,
      protocolVersions: protocols,
      initialAuth: commitment,
    });
    const committedCreation = creationActions(draft, protocols);
    const envelope = await signActions(
      actions.map((action, index) => ({
        ...action,
        input: index < 2 ? committedCreation[index].input : action.input,
        context: { ...action.context, initialAuth: commitment.intentDigest },
      })),
      signer,
      { documentId: draft.header.id, branch: draft.header.branch },
      signal,
    );
    const stored = await this.store.prepare({
      intentKey,
      requestDigest,
      documentId: draft.header.id,
      envelope,
      facts,
    });
    return this.prepared(draft, stored.documentId, stored.envelope);
  }

  private prepared(draft: PHDocument, documentId: string, actions: Action[]) {
    const input = z
      .object({
        initialAuth: z.unknown(),
        protocolVersions: z.record(z.string(), z.number()),
      })
      .parse(actions[0]?.input);
    draft.header.id = documentId;
    draft.header.initialAuth = parseInitialAuthCommitment(input.initialAuth);
    draft.header.protocolVersions = input.protocolVersions;
    return { document: draft, actions };
  }
}
