# Testing Guide

This directory contains tests for the `@powerhousedao/reactor` package using **Vitest**.

## Running Tests

```bash
# Run all tests
pnpm test

# Run in watch mode
pnpm vitest

# Run once
pnpm vitest run

# Run specific test file
pnpm vitest run event-bus.test.ts
```

## Writing Tests

### File Structure
- Test files: `*.test.ts` in this directory
- Import from src: `import { Module } from "../src/module.js"`

### Basic Pattern
```typescript
import { describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";

describe("Module", () => {
  it("should do something", async () => {
    const instance = new EventBus();
    // Test logic here
    expect(result).toBe(expected);
  });
});
```

### Key Guidelines
- Use `async/await` for async operations
- Test both success and error cases
- Group related tests with nested `describe` blocks
- Use TypeScript types for better test safety

## Test Categories
Based on existing tests, organize by:
- Core functionality
- Error handling
- Edge cases
- Performance (if relevant)

See `event-bus.test.ts` for comprehensive examples. 