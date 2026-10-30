// @vitest-environment happy-dom
import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DraftRequest } from "../../controller/api.js";
import { FULL, stack } from "../../host-rules/__fixtures__/hosts.js";
import { fakeBuilderClient } from "../__fixtures__/fakes.js";
import { renderStep } from "../__fixtures__/steps.js";
import { NO_CONTROLLER } from "../copy.js";
import { requestOf } from "../draft.js";
import { ReviewStep } from "./ReviewStep.js";

describe("ReviewStep", () => {
  it("links each issue to the step that fixes it", () => {
    const { view, onStep, engine } = renderStep(ReviewStep, {
      envelope: stack(),
      env: { NODE_OPTIONS: "x" },
      context: FULL,
      extra: {},
    });
    expect(engine.issues.map((issue) => issue.path)).toEqual([
      "env.NODE_OPTIONS",
    ]);
    expect(view.getByText("1 issue")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Go to Environment" }));
    expect(onStep).toHaveBeenCalledWith("environment");
  });

  it("runs the controller's check on the draft's request", async () => {
    const seen: DraftRequest[] = [];
    const { client } = fakeBuilderClient({
      checkDraft: (request) => {
        seen.push(request);
        return Promise.resolve({
          ruleIssues: [],
          issues: [
            {
              stage: "boot",
              file: "hosts/stack/host.js",
              path: "",
              message: "The switchboard would not boot.",
            },
          ],
        });
      },
    });
    const { view, draft } = renderStep(ReviewStep, {
      envelope: stack(),
      context: FULL,
      extra: { client },
    });
    expect(view.getByText("No issues")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Check now" }));
    await waitFor(() =>
      expect(view.getByText("The switchboard would not boot.")).toBeTruthy(),
    );
    expect(seen).toEqual([requestOf(draft)]);
  });

  it("can't check without a controller", () => {
    const { view } = renderStep(ReviewStep, {
      envelope: stack(),
      context: FULL,
      extra: {},
    });
    expect(view.getByRole("button", { name: "Check now" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(view.getByText(NO_CONTROLLER)).toBeTruthy();
  });
});
