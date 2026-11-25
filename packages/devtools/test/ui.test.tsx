// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../src/ui/dropdown-menu.js";
import { DevtoolsPortalProvider } from "../src/ui/portal.js";
import {
  ResizeHandle,
  storedWidth,
  useStoredWidth,
} from "../src/ui/resize-handle.js";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../src/ui/tooltip.js";

function setup() {
  const container = document.createElement("div");
  container.className = "ph-devtools";
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("portalled primitives", () => {
  it("mounts an open dropdown menu inside the DevTools portal container", async () => {
    const container = setup();
    render(
      <DevtoolsPortalProvider container={container}>
        <DropdownMenu>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Reload</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DevtoolsPortalProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByText("Open"));
    });

    const popup = await screen.findByRole("menu");
    expect(popup.getAttribute("data-slot")).toBe("dropdown-menu-content");
    expect(container.contains(popup)).toBe(true);
    expect(popup.parentElement).not.toBe(document.body);
  });

  it("mounts an open tooltip inside the DevTools portal container", async () => {
    const container = setup();
    render(
      <DevtoolsPortalProvider container={container}>
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger>Hover</TooltipTrigger>
            <TooltipContent>Reload the reactor</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </DevtoolsPortalProvider>,
    );

    const text = await screen.findByText("Reload the reactor");
    const popup = text.closest('[data-slot="tooltip-content"]');
    expect(popup).not.toBeNull();
    expect(container.contains(popup)).toBe(true);
    expect(popup?.parentElement).not.toBe(document.body);
  });

  it("renders no popup while the portal container is unresolved", async () => {
    render(
      <DevtoolsPortalProvider container={null}>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Reload</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DevtoolsPortalProvider>,
    );

    await act(() => Promise.resolve());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

const LIMITS = { initial: 200, min: 120, max: 300 };
const WIDTH = storedWidth("test-width", LIMITS);

function Resizable() {
  const [width, setWidth] = useStoredWidth(WIDTH, LIMITS);
  return (
    <ResizeHandle
      label="Resize"
      width={width}
      limits={LIMITS}
      onWidth={setWidth}
    />
  );
}

describe("ResizeHandle", () => {
  afterEach(() => localStorage.clear());

  const handle = () => screen.getByRole("separator", { name: "Resize" });
  const width = () => Number(handle().getAttribute("aria-valuenow"));

  it("changes the width from the keyboard within its limits and keeps it", () => {
    const { unmount } = render(<Resizable />);
    expect(width()).toBe(200);
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(width()).toBe(216);
    fireEvent.keyDown(handle(), { key: "End" });
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    expect(width()).toBe(300);
    unmount();

    render(<Resizable />);
    expect(width()).toBe(300);
    fireEvent.doubleClick(handle());
    expect(width()).toBe(200);
  });

  it("shows a drag as it moves and saves where it ends", () => {
    render(<Resizable />);
    handle().setPointerCapture = () => {};

    fireEvent.pointerDown(handle(), { button: 0, clientX: 100 });
    fireEvent.pointerMove(handle(), { clientX: 140 });
    expect(width()).toBe(240);
    expect(localStorage.getItem("ph-devtools:test-width")).toBeNull();

    fireEvent.pointerUp(handle(), { clientX: 140 });
    expect(localStorage.getItem("ph-devtools:test-width")).toBe("240");
  });

  it("ignores a saved width outside its limits", () => {
    localStorage.setItem("ph-devtools:test-width", "9000");
    render(<Resizable />);
    expect(width()).toBe(200);
  });
});
