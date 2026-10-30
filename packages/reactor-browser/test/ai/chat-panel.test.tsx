// The embeddable panel in a real browser: attachments by the picker, by paste
// and by drop reach `send` as images, and the composer holds nothing afterwards.
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ChatPanel } from "../../src/ai/components/chat-panel.js";
import type { ChatImage, ChatMessage } from "../../src/ai/types.js";
import type { UseReactorChatResult } from "../../src/ai/use-reactor-chat.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A one-pixel PNG.
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const receipt = () => new File([PIXEL], "receipt.png", { type: "image/png" });

function fakeChat(
  overrides: Partial<UseReactorChatResult> = {},
): UseReactorChatResult {
  return {
    messages: [],
    isStreaming: false,
    pendingApprovals: [],
    error: null,
    settings: {
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      autoApproveWrites: false,
    },
    configured: true,
    send: vi.fn(),
    stop: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}

function withFiles(file: File) {
  const data = new DataTransfer();
  data.items.add(file);
  return data;
}

const sentImages = (chat: UseReactorChatResult) =>
  (chat.send as ReturnType<typeof vi.fn>).mock.calls[0] as [
    string,
    ChatImage[],
  ];

describe("ChatPanel", () => {
  it("offers no attachment unless the host allows it", async () => {
    const screen = await render(<ChatPanel chat={fakeChat()} />);
    await expect
      .element(screen.getByRole("button", { name: "Attach an image" }))
      .not.toBeInTheDocument();
  });

  it("sends a picked image with the text, then clears the composer", async () => {
    const chat = fakeChat();
    const screen = await render(<ChatPanel chat={chat} allowImages />);
    const picker = screen.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    picker.files = withFiles(receipt()).files;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    await expect
      .element(screen.getByRole("img", { name: "receipt.png" }))
      .toBeVisible();

    await screen.getByRole("textbox").fill("What is this?");
    await screen.getByRole("button", { name: "Send message" }).click();

    const [text, images] = sentImages(chat);
    expect(text).toBe("What is this?");
    expect(images).toHaveLength(1);
    expect(images[0].mediaType).toBe("image/png");
    expect(images[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    await expect
      .element(screen.getByRole("img", { name: "receipt.png" }))
      .not.toBeInTheDocument();
  });

  it("sends an image on its own", async () => {
    const chat = fakeChat();
    const screen = await render(<ChatPanel chat={chat} allowImages />);
    screen
      .getByRole("textbox")
      .element()
      .dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: withFiles(receipt()),
        }),
      );
    await expect
      .element(screen.getByRole("img", { name: "receipt.png" }))
      .toBeVisible();
    await screen.getByRole("button", { name: "Send message" }).click();
    expect(sentImages(chat)[1]).toHaveLength(1);
  });

  it("takes a dropped image, and says when a file is not one", async () => {
    const screen = await render(<ChatPanel chat={fakeChat()} allowImages />);
    const panel = screen.container.querySelector(".ph-chat") as HTMLElement;
    panel.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: withFiles(receipt()),
      }),
    );
    await expect
      .element(screen.getByRole("img", { name: "receipt.png" }))
      .toBeVisible();

    panel.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: withFiles(
          new File(["%PDF"], "invoice.pdf", { type: "application/pdf" }),
        ),
      }),
    );
    await expect
      .element(
        screen.getByText("invoice.pdf is not a PNG, JPEG, WebP or GIF image."),
      )
      .toBeVisible();
  });

  it("shows a sent image in the user's message", async () => {
    const message: ChatMessage = {
      id: "1",
      role: "user",
      parts: [
        { type: "text", text: "Here" },
        {
          type: "image",
          dataUrl: "data:image/png;base64,AAAA",
          name: "receipt.png",
        },
      ],
    };
    const screen = await render(
      <ChatPanel chat={fakeChat({ messages: [message] })} />,
    );
    await expect.element(screen.getByText("Here")).toBeVisible();
    await expect
      .element(screen.getByRole("img", { name: "receipt.png" }))
      .toBeInTheDocument();
  });

  it("sends a suggestion on click", async () => {
    const chat = fakeChat();
    const screen = await render(
      <ChatPanel chat={chat} suggestions={["List my drives"]} />,
    );
    await screen.getByRole("button", { name: "List my drives" }).click();
    expect(chat.send).toHaveBeenCalledWith("List my drives");
  });
});
