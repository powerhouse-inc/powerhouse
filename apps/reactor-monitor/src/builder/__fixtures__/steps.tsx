import type { HostExport } from "@powerhousedao/host-core/schema";
import { render, type RenderResult } from "@testing-library/react";
import type { ComponentType } from "react";
import { vi, type Mock } from "vitest";
import type {
  HostEnv,
  HostRulesContext,
  Setter,
} from "../../host-rules/index.js";
import {
  addEdit,
  newDraft,
  withEnv,
  type BuilderDraft,
  type DraftBase,
} from "../draft.js";
import { builderEngine, type BuilderEngine } from "../engine.js";
import type { StepProps } from "../steps/types.js";
import { PROJECT } from "./fakes.js";

export const DIGEST = "0".repeat(64);

export type RenderedStep = {
  view: RenderResult;
  draft: BuilderDraft;
  engine: BuilderEngine;
  onChoose: Mock;
  onEdit: Mock;
  onDraft: Mock;
  onStep: Mock;
};

/** One step rendered over a draft of `envelope`, with spied callbacks. */
export function renderStep<P extends StepProps>(
  Step: ComponentType<P>,
  {
    envelope,
    setters = [],
    env = {},
    context,
    base,
    extra,
  }: {
    envelope: HostExport;
    setters?: Setter[];
    env?: HostEnv;
    context: HostRulesContext;
    base?: DraftBase;
    extra?: Omit<P, keyof StepProps>;
  },
): RenderedStep {
  const draft = withEnv(
    addEdit(
      newDraft(
        base ?? {
          kind: "project",
          project: PROJECT,
          host: envelope.name,
          export: envelope,
        },
        DIGEST,
      ),
      setters,
    ),
    env,
  );
  const engine = builderEngine(draft, context);
  const props = {
    draft,
    engine,
    onChoose: vi.fn(),
    onEdit: vi.fn(),
    onDraft: vi.fn(),
    onStep: vi.fn(),
  };
  const view = render(<Step {...({ ...props, ...extra } as unknown as P)} />);
  return { view, ...props };
}
