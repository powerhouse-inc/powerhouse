import { describe, expect, it, vi } from "vitest";
import { createForwardingLogger } from "../../../../src/executor/worker/forwarding-logger.js";
import type { LogMessage } from "../../../../src/executor/worker/protocol.js";

function captureMessages(): {
  post: (msg: LogMessage) => void;
  messages: LogMessage[];
} {
  const messages: LogMessage[] = [];
  return { post: (msg) => messages.push(msg), messages };
}

describe("createForwardingLogger", () => {
  describe("log level methods", () => {
    it("debug posts level: 'debug'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.debug("test message", "arg1");
      expect(messages).toHaveLength(1);
      expect(messages[0]!.level).toBe("debug");
      expect(messages[0]!.message).toBe("test message");
      expect(messages[0]!.args).toEqual(["arg1"]);
    });

    it("info posts level: 'info'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.info("hello");
      expect(messages[0]!.level).toBe("info");
    });

    it("warn posts level: 'warn'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.warn("warning");
      expect(messages[0]!.level).toBe("warn");
    });

    it("error posts level: 'error'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.error("something failed");
      expect(messages[0]!.level).toBe("error");
    });

    it("verbose maps to level: 'debug' on the wire", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.verbose("verbose message");
      expect(messages[0]!.level).toBe("debug");
    });

    it("errorHandler posts level: 'error'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.errorHandler("error handler message", "extra");
      expect(messages[0]!.level).toBe("error");
      expect(messages[0]!.message).toBe("error handler message");
      expect(messages[0]!.args).toEqual(["extra"]);
    });
  });

  describe("message shape", () => {
    it("includes type: 'log'", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      logger.info("msg");
      expect(messages[0]!.type).toBe("log");
    });

    it("includes a numeric timestamp", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      const before = Date.now();
      logger.info("msg");
      const after = Date.now();
      expect(messages[0]!.timestamp).toBeGreaterThanOrEqual(before);
      expect(messages[0]!.timestamp).toBeLessThanOrEqual(after);
    });

    it("sanitizes non-cloneable args", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      const err = new Error("oops");
      logger.info("with error", err);
      expect(() => structuredClone(messages[0])).not.toThrow();
    });

    it("sanitizes circular ref in args", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      const obj: Record<string, unknown> = { x: 1 };
      obj["self"] = obj;
      logger.info("circular", obj);
      expect(() => structuredClone(messages[0])).not.toThrow();
    });

    it("sanitizes class instance in args", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      class Foo {
        value = 42;
      }
      logger.info("class", new Foo());
      expect(() => structuredClone(messages[0])).not.toThrow();
    });

    it("sanitizes Error.cause chain in args", () => {
      const { post, messages } = captureMessages();
      const logger = createForwardingLogger(post);
      const cause = new TypeError("inner");
      const err = new Error("outer", { cause });
      logger.error("err arg", err);
      expect(() => structuredClone(messages[0])).not.toThrow();
    });
  });

  describe("child(tags)", () => {
    it("prepends a tags object to every message", () => {
      const { post, messages } = captureMessages();
      const parent = createForwardingLogger(post);
      const child = parent.child(["svc", "worker"]);
      child.info("child message");
      expect(messages[0]!.args[0]).toEqual({ tags: ["svc", "worker"] });
      expect(messages[0]!.message).toBe("child message");
    });

    it("accumulates tags across nested child() calls", () => {
      const { post, messages } = captureMessages();
      const root = createForwardingLogger(post);
      const child = root.child(["a"]);
      const grandchild = child.child(["b"]);
      grandchild.info("deep");
      expect(messages[0]!.args[0]).toEqual({ tags: ["a", "b"] });
    });

    it("parent messages are not affected by child tags", () => {
      const { post, messages } = captureMessages();
      const parent = createForwardingLogger(post);
      const _child = parent.child(["tag"]);
      parent.info("parent msg");
      expect(messages[0]!.args).toEqual([]);
    });
  });

  describe("post failure isolation", () => {
    it("does not throw when post throws", () => {
      const throwingPost = () => {
        throw new Error("postMessage failed");
      };
      const logger = createForwardingLogger(throwingPost);
      expect(() => logger.info("test")).not.toThrow();
    });

    it("writes to stderr when post throws", () => {
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      const throwingPost = () => {
        throw new Error("postMessage failed");
      };
      const logger = createForwardingLogger(throwingPost);
      logger.error("failed msg");
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });
  });

  describe("level field", () => {
    it("defaults to 'info'", () => {
      const { post } = captureMessages();
      const logger = createForwardingLogger(post);
      expect(logger.level).toBe("info");
    });

    it("respects custom level parameter", () => {
      const { post } = captureMessages();
      const logger = createForwardingLogger(post, "debug");
      expect(logger.level).toBe("debug");
    });
  });
});
