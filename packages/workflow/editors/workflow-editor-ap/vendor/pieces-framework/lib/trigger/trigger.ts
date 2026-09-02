import * as z from "zod/mini";
import { type OnStartContext, type TestOrRunHookContext, type TriggerHookContext } from '../context/index.js';
import type { OutputSchema } from '../output-schema.js';
import { ActionClassification, AiMetadata, PropertyGroup, TriggerBase } from '../piece-metadata.js';
import { InputPropertyMap } from '../property/index.js';
import { type ExtractPieceAuthPropertyTypeForMethods, PieceAuthProperty } from '../property/authentication/index.js';
import { isNil } from '../../../core-utils/index.js';
import { TriggerStrategy, TriggerTestStrategy, WebhookHandshakeConfiguration, WebhookHandshakeStrategy } from '../../../piece-types/index.js';
export { TriggerStrategy }

export const DEDUPE_KEY_PROPERTY = '_dedupe_key'



// ph: declared in piece-metadata.ts to break a value import cycle.
import { WebhookRenewConfiguration, WebhookRenewStrategy } from '../piece-metadata.js';
export { WebhookRenewConfiguration, WebhookRenewStrategy };

type OnStartRunner<PieceAuth extends PieceAuthProperty | undefined, TriggerProps extends InputPropertyMap> = (ctx: OnStartContext<PieceAuth, TriggerProps>) => Promise<unknown | void>




export interface WebhookResponse {
  status: number,
  body?: unknown,
  headers?: Record<string, string>
}

type BaseTriggerParams<
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  TS extends TriggerStrategy,
> = {
  name: string
  displayName: string
  description: string
  requireAuth?: boolean
  auth?: PieceAuth
  props: TriggerProps
  propertyGroups?: PropertyGroup[]
  type: TS
  onEnable: (context: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<void>
  onDisable: (context: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<void>
  run: (context: TestOrRunHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<unknown[]>
  test?: (context: TestOrRunHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<unknown[]>,
  onStart?: OnStartRunner<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps>,
  sampleData: unknown
  outputSchema?: OutputSchema
  aiMetadata?: AiMetadata
  classification?: ActionClassification
}

type WebhookTriggerParams<
PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined,
TriggerProps extends InputPropertyMap,
TS extends TriggerStrategy,
> = BaseTriggerParams<PieceAuth, TriggerProps, TS> & {
  handshakeConfiguration?: WebhookHandshakeConfiguration
  onHandshake?: (context: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
  renewConfiguration?: WebhookRenewConfiguration
  onRenew?(context: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>): Promise<void>,
}

type CreateTriggerParams<
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
  TS extends TriggerStrategy,
> = TS extends TriggerStrategy.WEBHOOK
    ? WebhookTriggerParams<PieceAuth, TriggerProps, TS>
    : BaseTriggerParams<PieceAuth, TriggerProps, TS>

export class ITrigger<
  TS extends TriggerStrategy,
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined,
  TriggerProps extends InputPropertyMap,
> implements TriggerBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly requireAuth: boolean,
    public readonly props: TriggerProps,
    public readonly type: TS,
    public readonly handshakeConfiguration: WebhookHandshakeConfiguration,
    public readonly onHandshake: (ctx: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
    public readonly renewConfiguration: WebhookRenewConfiguration,
    public readonly onRenew: (ctx: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onEnable: (ctx: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onDisable: (ctx: TriggerHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onStart: OnStartRunner<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps>,
    public readonly run: (ctx: TestOrRunHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly test: (ctx: TestOrRunHookContext<ExtractPieceAuthPropertyTypeForMethods<PieceAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly sampleData: unknown,
    public readonly testStrategy: TriggerTestStrategy,
    public readonly outputSchema?: OutputSchema,
    public readonly aiMetadata?: AiMetadata,
    public readonly classification?: ActionClassification,
    public readonly propertyGroups?: PropertyGroup[],
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Trigger<
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined = any,
  TriggerProps extends InputPropertyMap = any,
  S extends TriggerStrategy = any,
> = ITrigger<S, PieceAuth, TriggerProps>

// TODO refactor and extract common logic
export const createTrigger = <
  TS extends TriggerStrategy,
  PieceAuth extends PieceAuthProperty | PieceAuthProperty[] | undefined ,
  TriggerProps extends InputPropertyMap,
>(params: CreateTriggerParams<PieceAuth, TriggerProps, TS>) => {
  switch (params.type) {
    case TriggerStrategy.WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        params.handshakeConfiguration ?? { strategy: WebhookHandshakeStrategy.NONE },
        params.onHandshake ?? (async () => ({ status: 200 })),
        params.renewConfiguration ?? { strategy: WebhookRenewStrategy.NONE },
        params.onRenew ?? (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        params.test ? TriggerTestStrategy.TEST_FUNCTION : TriggerTestStrategy.SIMULATION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.POLLING:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.MANUAL:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
    case TriggerStrategy.APP_WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        (isNil(params.sampleData) && isNil(params.test)) ? TriggerTestStrategy.SIMULATION : TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
        params.classification,
        params.propertyGroups,
      )
  }
}
