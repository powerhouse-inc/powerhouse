// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Row, Rows } from "../src/components/rows.js";
import { plural } from "../src/lib/plural.js";
import { highlight, type CodeLang } from "../src/lib/highlight.js";
import { Section, Subsection } from "../src/components/section.js";
import { Segmented } from "../src/components/segmented.js";
import { StatusDot, type Tone } from "../src/components/status.js";
import { Checkbox } from "../src/ui/checkbox.js";
import { DevtoolsPortalProvider } from "../src/ui/portal.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src/ui/select.js";
import { Switch } from "../src/ui/switch.js";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("Select", () => {
  const items = [
    { value: "bottom", label: "Bottom" },
    { value: "right", label: "Right" },
  ];

  it("opens inside the DevTools portal container and reports the chosen item", async () => {
    const container = document.createElement("div");
    container.className = "ph-devtools";
    document.body.appendChild(container);
    const onValueChange = vi.fn();
    render(
      <DevtoolsPortalProvider container={container}>
        <Select
          items={items}
          defaultValue="bottom"
          onValueChange={onValueChange}
        >
          <SelectTrigger aria-label="Dock">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DevtoolsPortalProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByLabelText("Dock"));
    });

    const popup = await screen.findByRole("listbox");
    const content = popup.closest('[data-slot="select-content"]');
    expect(content).not.toBeNull();
    expect(container.contains(content)).toBe(true);
    expect(content?.parentElement).not.toBe(document.body);

    // Base UI takes a mouse click only from a press that started on the item.
    const right = screen.getByRole("option", { name: "Right" });
    act(() => {
      fireEvent.pointerDown(right, { pointerType: "mouse", button: 0 });
      fireEvent.mouseDown(right, { button: 0 });
      fireEvent.pointerUp(right, { pointerType: "mouse", button: 0 });
      fireEvent.mouseUp(right, { button: 0 });
      fireEvent.click(right, { button: 0 });
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0][0]).toBe("right");
  });
});

describe.each([
  ["Checkbox", Checkbox],
  ["Switch", Switch],
] as const)("%s", (_name, Control) => {
  it("toggles on click and reports the new state", () => {
    const onCheckedChange = vi.fn();
    render(<Control aria-label="Watch" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole(
      _name === "Checkbox" ? "checkbox" : "switch",
    );
    expect(control.getAttribute("aria-checked")).toBe("false");

    act(() => {
      fireEvent.click(control);
    });

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange.mock.calls[0][0]).toBe(true);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("ignores clicks when disabled", () => {
    const onCheckedChange = vi.fn();
    render(
      <Control aria-label="Watch" disabled onCheckedChange={onCheckedChange} />,
    );
    const control = screen.getByRole(
      _name === "Checkbox" ? "checkbox" : "switch",
    );

    act(() => {
      fireEvent.click(control);
    });

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(control.getAttribute("aria-checked")).toBe("false");
  });
});

describe("Rows", () => {
  const NAMES = ["invoice", "credit-note", "receipt"];

  function List({ onSelect }: { onSelect: (name: string) => void }) {
    const [selected, setSelected] = useState(NAMES[0]);
    return (
      <Rows label="Document models">
        {NAMES.map((name) => (
          <Row
            key={name}
            label={name}
            selected={selected === name}
            onSelect={() => {
              setSelected(name);
              onSelect(name);
            }}
          >
            {name}
          </Row>
        ))}
      </Rows>
    );
  }

  const selectedName = () =>
    screen
      .getAllByRole("option")
      .filter((o) => o.getAttribute("aria-selected") === "true")
      .map((o) => o.getAttribute("aria-label"));

  it("is a listbox of options with one selected", () => {
    render(<List onSelect={() => {}} />);
    expect(screen.getByRole("listbox").getAttribute("aria-label")).toBe(
      "Document models",
    );
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(selectedName()).toEqual(["invoice"]);
  });

  it("moves the selection with the arrow keys", () => {
    const onSelect = vi.fn<(name: string) => void>();
    render(<List onSelect={onSelect} />);
    const first = screen.getByRole("option", { name: "invoice" });

    act(() => {
      fireEvent.keyDown(first, { key: "ArrowDown" });
    });
    expect(selectedName()).toEqual(["credit-note"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "credit-note",
    );

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    });
    expect(selectedName()).toEqual(["receipt"]);

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    });
    expect(selectedName()).toEqual(["receipt"]);

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    });
    expect(selectedName()).toEqual(["credit-note"]);
    expect(onSelect.mock.calls.map(([n]) => n)).toEqual([
      "credit-note",
      "receipt",
      "credit-note",
    ]);
  });

  it("selects a row on click and on Enter", () => {
    const onSelect = vi.fn();
    render(<List onSelect={onSelect} />);

    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "receipt" }));
    });
    expect(onSelect).toHaveBeenLastCalledWith("receipt");
    expect(selectedName()).toEqual(["receipt"]);

    act(() => {
      fireEvent.keyDown(screen.getByRole("option", { name: "invoice" }), {
        key: "Enter",
      });
    });
    expect(onSelect).toHaveBeenLastCalledWith("invoice");
    expect(selectedName()).toEqual(["invoice"]);
  });
});

describe("StatusDot", () => {
  it.each<[Tone, string]>([
    ["ok", "bg-success"],
    ["warn", "bg-warning"],
    ["error", "bg-destructive"],
    ["info", "bg-info"],
    ["idle", "bg-muted-foreground/50"],
  ])("draws the %s tone with %s", (tone, dotClass) => {
    for (const pulse of [false, true]) {
      const { container, unmount } = render(
        <StatusDot tone={tone} pulse={pulse} />,
      );
      const dots = container.querySelectorAll(".rounded-full");
      expect(dots.length).toBeGreaterThan(0);
      for (const dot of dots) expect(dot.classList).toContain(dotClass);
      unmount();
    }
  });
});

describe("Section", () => {
  it("is a region named by its title, with its parts one heading level down", () => {
    render(
      <Section title="State" actions={<span>2 scopes</span>}>
        <Subsection title="Schema">
          <p>type State</p>
        </Subsection>
        <Subsection title="Input" as="h5">
          <p>input X</p>
        </Subsection>
      </Section>,
    );
    const region = screen.getByRole("region", { name: "State" });
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("State");
    expect(
      screen.getByRole("heading", { level: 4, name: "Schema" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 5, name: "Input" }),
    ).toBeTruthy();
    expect(region.textContent).toContain("2 scopes");
  });
});

describe("Segmented", () => {
  const ITEMS = [
    { id: "global", label: "Global" },
    { id: "local", label: "Local" },
    { id: "both", label: "Both" },
  ] as const;
  type Id = (typeof ITEMS)[number]["id"];

  function Choice({ kind }: { kind: "tabs" | "toggle" }) {
    const [value, setValue] = useState<Id>("global");
    return (
      <Segmented
        mode={kind === "tabs" ? { kind, panelId: "scope-panel" } : { kind }}
        label="Scope"
        items={ITEMS}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("as tabs, moves the choice and the focus with the arrow keys, Home and End", () => {
    render(<Choice kind="tabs" />);
    const tab = (name: string) => screen.getByRole("tab", { name });
    expect(tab("Global").getAttribute("aria-selected")).toBe("true");
    expect(tab("Local").getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(tab("Global"), { key: "ArrowRight" });
    expect(tab("Local").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Local"));

    fireEvent.keyDown(tab("Local"), { key: "End" });
    expect(document.activeElement).toBe(tab("Both"));
    fireEvent.keyDown(tab("Both"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab("Global"));
    fireEvent.keyDown(tab("Global"), { key: "ArrowLeft" });
    expect(tab("Both").getAttribute("aria-selected")).toBe("true");
  });

  it("as a toggle, presses the button clicked and ignores the arrow keys", () => {
    render(<Choice kind="toggle" />);
    const button = (name: string) => screen.getByRole("button", { name });
    expect(screen.getByRole("group", { name: "Scope" })).toBeTruthy();
    fireEvent.click(button("Local"));
    expect(button("Local").getAttribute("aria-pressed")).toBe("true");
    expect(button("Global").getAttribute("aria-pressed")).toBe("false");
    fireEvent.keyDown(button("Local"), { key: "ArrowRight" });
    expect(button("Local").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("highlight", () => {
  function tokens(code: string, lang: CodeLang) {
    const { container } = render(<pre>{highlight(code, lang)}</pre>);
    return [...container.querySelectorAll("span")].map(
      (s) => [s.textContent, s.className] as const,
    );
  }

  it("colours GraphQL keywords, type names, strings and numbers", () => {
    const t = tokens(
      'type Invoice {\n  total: Float @default(value: 12.5)\n  note: String = "draft"\n}\n',
      "graphql",
    );
    expect(t).toContainEqual(["type", "text-chart-5"]);
    expect(t).toContainEqual(["Invoice", "text-chart-2"]);
    expect(t).toContainEqual(["Float", "text-chart-2"]);
    expect(t).toContainEqual(["total", "text-info"]);
    expect(t).toContainEqual(["12.5", "text-warning"]);
    expect(t).toContainEqual(['"draft"', "text-success"]);
  });

  it("colours JSON keys, strings, numbers and literals", () => {
    const t = tokens(
      '{ "id": "INV-0042", "total": 120, "paid": false }',
      "json",
    );
    expect(t).toContainEqual(['"id"', "text-info"]);
    expect(t).toContainEqual(['"INV-0042"', "text-success"]);
    expect(t).toContainEqual(["120", "text-warning"]);
    expect(t).toContainEqual(["false", "text-chart-5"]);
  });

  it("keeps the text unchanged", () => {
    const code = '{\n  "a": [1, true, null]\n}';
    const { container } = render(<pre>{highlight(code, "json")}</pre>);
    expect(container.textContent).toBe(code);
  });

  it("colours TypeScript keywords, strings, numbers, comments and type names", () => {
    const t = tokens(
      "// add it\nconst item: LineItem = { id: 'a', quantity: 2 };\nreturn null;",
      "typescript",
    );
    expect(t).toContainEqual(["// add it", "text-muted-foreground italic"]);
    expect(t).toContainEqual(["const", "text-chart-5"]);
    expect(t).toContainEqual(["return", "text-chart-5"]);
    expect(t).toContainEqual(["LineItem", "text-chart-2"]);
    expect(t).toContainEqual(["'a'", "text-success"]);
    expect(t).toContainEqual(["2", "text-warning"]);
    expect(t).toContainEqual(["null", "text-warning"]);
  });

  it("keeps TypeScript text unchanged, an unclosed quote and a division included", () => {
    const code =
      'state.total = a / b; // "half\nconst s = `x${a}`; const q = "open';
    const { container } = render(<pre>{highlight(code, "typescript")}</pre>);
    expect(container.textContent).toBe(code);
  });
});

describe("plural", () => {
  it.each<[number, string, string | undefined, string]>([
    [0, "editor", undefined, "0 editors"],
    [1, "editor", undefined, "1 editor"],
    [2, "editor", undefined, "2 editors"],
    [1, "entry", "entries", "1 entry"],
    [3, "entry", "entries", "3 entries"],
  ])("plural(%i, %s, %s) is %s", (n, one, many, expected) => {
    expect(plural(n, one, many)).toBe(expected);
  });
});
