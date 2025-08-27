import { describe, expect, it } from "vitest";
import {
  createShutdownStatus,
  createMutableShutdownStatus,
} from "../src/shared/factories.js";

describe("ShutdownStatus Factory Methods", () => {
  describe("createShutdownStatus", () => {
    it("should create an immutable shutdown status with true", () => {
      const status = createShutdownStatus(true);
      expect(status.isShutdown).toBe(true);
      // Should remain true
      expect(status.isShutdown).toBe(true);
    });

    it("should create an immutable shutdown status with false", () => {
      const status = createShutdownStatus(false);
      expect(status.isShutdown).toBe(false);
      // Should remain false
      expect(status.isShutdown).toBe(false);
    });
  });

  describe("createMutableShutdownStatus", () => {
    it("should create a mutable shutdown status with default false", () => {
      const [status, setShutdown] = createMutableShutdownStatus();
      expect(status.isShutdown).toBe(false);
      
      // Update to true
      setShutdown(true);
      expect(status.isShutdown).toBe(true);
      
      // Update back to false
      setShutdown(false);
      expect(status.isShutdown).toBe(false);
    });

    it("should create a mutable shutdown status with initial true", () => {
      const [status, setShutdown] = createMutableShutdownStatus(true);
      expect(status.isShutdown).toBe(true);
      
      // Update to false
      setShutdown(false);
      expect(status.isShutdown).toBe(false);
    });

    it("should allow multiple reads of the same state", () => {
      const [status, setShutdown] = createMutableShutdownStatus(false);
      
      // Multiple reads should return the same value
      expect(status.isShutdown).toBe(false);
      expect(status.isShutdown).toBe(false);
      expect(status.isShutdown).toBe(false);
      
      setShutdown(true);
      
      // Multiple reads after update should return the new value
      expect(status.isShutdown).toBe(true);
      expect(status.isShutdown).toBe(true);
      expect(status.isShutdown).toBe(true);
    });
  });

  describe("Reactor integration", () => {
    it("should maintain shutdown state across multiple calls", () => {
      const [status, setShutdown] = createMutableShutdownStatus();
      
      // Initial state
      expect(status.isShutdown).toBe(false);
      
      // Simulate kill() being called
      setShutdown(true);
      
      // Status should be persisted
      expect(status.isShutdown).toBe(true);
      
      // Even if we get the status multiple times
      const isShut1 = status.isShutdown;
      const isShut2 = status.isShutdown;
      expect(isShut1).toBe(true);
      expect(isShut2).toBe(true);
    });
  });
});