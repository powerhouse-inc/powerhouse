// @vitest-environment happy-dom
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FULL, stack } from "../../host-rules/__fixtures__/hosts.js";
import { checkEnvKey } from "../../host-rules/index.js";
import { renderStep } from "../__fixtures__/steps.js";
import { EnvironmentStep } from "./EnvironmentStep.js";

function reasonOf(key: string): string {
  const verdict = checkEnvKey(key);
  if (verdict.ok) throw new Error(`${key} is accepted`);
  return verdict.reason;
}

describe("EnvironmentStep", () => {
  it("shows why a key is refused", () => {
    const { view } = renderStep(EnvironmentStep, {
      envelope: stack(),
      env: {
        NODE_OPTIONS: "--inspect",
        PH_REACTOR_DATABASE_URL: "postgres://x",
        LOG_LEVEL: "debug",
      },
      context: FULL,
    });
    expect(view.getByText(reasonOf("NODE_OPTIONS"))).toBeTruthy();
    expect(view.getByText(reasonOf("PH_REACTOR_DATABASE_URL"))).toBeTruthy();
    expect(view.getAllByRole("button", { name: /^Remove/ })).toHaveLength(3);
  });

  it("writes the rows to the draft's env", () => {
    const { view, onDraft, draft } = renderStep(EnvironmentStep, {
      envelope: stack(),
      context: FULL,
    });
    fireEvent.click(view.getByRole("button", { name: "Add a variable" }));
    const name = view.getByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "LOG_LEVEL" } });
    fireEvent.blur(name);
    expect(onDraft).toHaveBeenLastCalledWith({
      ...draft,
      env: { LOG_LEVEL: "" },
    });
    fireEvent.change(
      view.getByRole("textbox", { name: "Value of LOG_LEVEL" }),
      {
        target: { value: "debug" },
      },
    );
    expect(onDraft).toHaveBeenLastCalledWith({
      ...draft,
      env: { LOG_LEVEL: "debug" },
    });
    fireEvent.click(view.getByRole("button", { name: "Remove LOG_LEVEL" }));
    expect(onDraft).toHaveBeenLastCalledWith({ ...draft, env: {} });
  });
});
