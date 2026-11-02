// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BlockFormProp, PropertyGroup } from "./forms.js";
import { essentialNames, PropLayout } from "./prop-layout.js";

afterEach(() => {
  cleanup();
});

const prop = (name: string, extra: Partial<BlockFormProp> = {}) =>
  ({
    name,
    displayName: name,
    type: "SHORT_TEXT",
    required: false,
    ...extra,
  }) as BlockFormProp;

// The custom API call helper's two sections.
const GROUPS: PropertyGroup[] = [
  {
    key: "request",
    display: "section",
    label: "Request",
    description: "Where it goes",
    props: ["url", "method", "headers"],
  },
  {
    key: "payload",
    display: "section",
    label: "Data to send",
    props: ["body_type", "body"],
  },
];

function renderLayout(props: BlockFormProp[], groups?: PropertyGroup[]) {
  return render(
    <PropLayout
      props={props}
      groups={groups}
      values={{}}
      renderField={(field) => <div data-testid="field">{field.name}</div>}
      onCommit={() => {}}
    />,
  );
}

const names = (root: HTMLElement) =>
  within(root)
    .queryAllByTestId("field")
    .map((node) => node.textContent);

describe("PropLayout", () => {
  it("draws each section with its heading, members in the group's order", () => {
    renderLayout(
      ["method", "url", "headers", "body_type", "body", "timeout"].map((name) =>
        prop(name),
      ),
      GROUPS,
    );
    const request = screen.getByRole("region", { name: "Request" });
    expect(within(request).getByText("Where it goes")).toBeTruthy();
    expect(names(request)).toEqual(["url", "method", "headers"]);
    const payload = screen.getByRole("region", { name: "Data to send" });
    expect(names(payload)).toEqual(["body_type", "body"]);
    expect(names(document.body)).toEqual([
      "url",
      "method",
      "headers",
      "body_type",
      "body",
      "timeout",
    ]);
  });

  it("renders a prop named by two groups once, in the first", () => {
    renderLayout(
      [prop("url"), prop("body")],
      [GROUPS[0], { ...GROUPS[1], props: ["url", "body"] }],
    );
    expect(names(document.body)).toEqual(["url", "body"]);
    expect(names(screen.getByRole("region", { name: "Data to send" }))).toEqual(
      ["body"],
    );
  });

  it("pulls a section checkbox's reveals into the section", () => {
    renderLayout(
      [
        prop("url"),
        prop("auth", { type: "CHECKBOX", reveals: ["token"] }),
        prop("token"),
      ],
      [{ ...GROUPS[0], props: ["url", "auth"] }],
    );
    const request = screen.getByRole("region", { name: "Request" });
    // Unchecked, so the reveal stays folded away.
    expect(names(request)).toEqual(["url", "auth"]);
    expect(names(document.body)).toEqual(["url", "auth"]);
  });

  it("leaves a form with no groups as declared", () => {
    renderLayout([prop("b"), prop("a")]);
    expect(screen.queryByRole("region")).toBeNull();
    expect(names(document.body)).toEqual(["b", "a"]);
  });
});

describe("essentialNames", () => {
  const props = [
    prop("url"),
    prop("headers", { advanced: true }),
    prop("toggle", { type: "CHECKBOX", reveals: ["extra"] }),
    prop("extra", { advanced: true }),
    prop("timeout", { advanced: true }),
  ];

  it("keeps section members and reveals, not other advanced props", () => {
    const kept = essentialNames(props, [
      { key: "r", display: "section", props: ["url", "headers"] },
    ]);
    expect([...kept].sort()).toEqual(["extra", "headers", "url"]);
  });

  it("keeps tab members only, with no section", () => {
    const kept = essentialNames(props, [
      { key: "t", display: "tabs", props: ["headers"] },
    ]);
    expect([...kept]).toEqual(["headers"]);
  });

  it("keeps everything in a builder or footer form", () => {
    for (const display of ["builder", "footer"]) {
      const kept = essentialNames(props, [{ key: "b", display, props: [] }]);
      expect(kept.size).toBe(props.length);
    }
  });

  it("keeps nothing without groups", () => {
    expect(essentialNames(props, undefined).size).toBe(0);
  });
});
