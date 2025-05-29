# Reactor Package

## File Organization

This package follows a consistent file organization structure for each system. Each system directory should contain the following files:

### Standard File Structure

Each system (e.g., `events`, `queue`, `executor`, etc) should follow this organization:

```
system-name/
├── types.ts           # Type definitions specific to the system
├── interfaces.ts      # Interface definitions and contracts
└── [implementation].ts # Main implementation file(s)
```

### Example System

- **`events/`** - Event handling system
  - `types.ts` - Event types, status enums, etc.
  - `interfaces.ts` - EventBus interface, EventHandler interface, etc.
  - `event-bus.ts` - Main EventBus implementation

### File Responsibilities

- **`types.ts`**: Contains type definitions, enums, and type aliases specific to the system
- **`interfaces.ts`**: Contains interface definitions that define contracts and API shapes
- **`[implementation].ts`**: Contains the main implementation logic for the system

This structure ensures consistency across all systems and makes it easy to locate specific functionality within each system.