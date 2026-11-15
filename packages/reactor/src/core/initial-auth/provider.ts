import type {
  Actions,
  AuthSubject,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  PHAuthState,
  ResolvedInitialAuthBindings,
} from "@powerhousedao/shared/document-model";
import { AuthBootstrapError } from "@powerhousedao/shared/document-model";
import type {
  AuthBindings,
  CodeFirstDocumentModelModule,
  InitialAuthBindingValues,
} from "document-model";

export type InitialAuthReadonly<T> = T extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  ? T
  : T extends object
    ? { readonly [K in keyof T]: InitialAuthReadonly<T[K]> }
    : T;

export function freezeInitialAuthValue<T>(value: T): InitialAuthReadonly<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeInitialAuthValue(child);
    Object.freeze(value);
  }
  return value as InitialAuthReadonly<T>;
}

/** Supplied by trusted host code after authenticating the requester. */
export type InitialAuthCreationRequest = {
  readonly requester: AuthSubject;
  readonly idempotencyKey: string;
  readonly context: string;
};

export type InitialAuthProviderContext<
  TState extends PHBaseState = PHBaseState,
> = {
  readonly requester: Readonly<AuthSubject>;
  readonly initialState: InitialAuthReadonly<TState>;
  readonly context: string;
  /** A host-side fact read, recorded for optimistic validation at commit. */
  read(
    documentId: string,
    branch?: string,
  ): Promise<InitialAuthReadonly<PHDocument>>;
};

export type InitialAuthProvider = {
  readonly templateDigest: string;
  readonly model: Pick<DocumentModelModule, "documentModel" | "version">;
  authorizeCreation(context: InitialAuthProviderContext): Promise<void>;
  prepare(context: InitialAuthProviderContext): Promise<{
    bindings: ResolvedInitialAuthBindings;
    policy: PHAuthState;
  }>;
};

export function defineInitialAuthProvider<
  TState extends PHBaseState,
  TActions extends Actions,
  TBindings extends AuthBindings,
>(
  model: CodeFirstDocumentModelModule<TState, TActions, TBindings>,
  config: {
    readonly deployment: InitialAuthBindingValues<
      NoInfer<TBindings>
    >["deployment"];
    authorizeCreation(
      context: InitialAuthProviderContext<NoInfer<TState>>,
    ): void | Promise<void>;
    resolveInstance(
      context: InitialAuthProviderContext<NoInfer<TState>>,
    ):
      | InitialAuthBindingValues<NoInfer<TBindings>>["instance"]
      | Promise<InitialAuthBindingValues<NoInfer<TBindings>>["instance"]>;
  },
): InitialAuthProvider {
  const declaration: unknown = model.initialAuth;
  if (declaration === undefined)
    throw new AuthBootstrapError(
      "unsupported-bootstrap",
      "A provider requires a code-first model with an initial authorization declaration.",
    );
  const deployment = freezeInitialAuthValue(structuredClone(config.deployment));
  function typedContext(
    context: InitialAuthProviderContext,
  ): InitialAuthProviderContext<TState> {
    const initialState = structuredClone(context.initialState);
    if (!model.utils.isStateOfType(initialState))
      throw new AuthBootstrapError(
        "invalid-bootstrap",
        "The requested initial state does not satisfy the document model.",
      );
    return { ...context, initialState: freezeInitialAuthValue(initialState) };
  }
  return {
    model,
    templateDigest: model.initialAuth.template.digest,
    async authorizeCreation(context) {
      await config.authorizeCreation(typedContext(context));
    },
    async prepare(context) {
      const typed = typedContext(context);
      await config.authorizeCreation(typed);
      const bindings = {
        deployment: structuredClone(deployment),
        instance: structuredClone(await config.resolveInstance(typed)),
      };
      const policy = model.initialAuth.resolve(bindings);
      return { bindings, policy };
    },
  };
}

export type InitialAuthOrigin = {
  readonly documentType: string;
  readonly modelVersion: number;
  readonly initializerKey: string;
  readonly origin: string;
};
export type InitialAuthConfiguration = {
  readonly providers: readonly InitialAuthProvider[];
  trustOrigin(origin: InitialAuthOrigin): boolean | Promise<boolean>;
  /** Creation authority for copies whose current model version no longer declares defaults. */
  authorizeCopy?(
    context: InitialAuthProviderContext & {
      readonly source: InitialAuthReadonly<PHDocument>;
    },
  ): void | Promise<void>;
};
