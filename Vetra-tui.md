# Vetra TUI - Design Document

## UI States & Examples

### 1. Initial State - System Starting

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

⚙️  Initializing Switchboard...
⚙️  Starting Codegen Processor...
⚙️  Launching Connect Studio...

┌─ System Status ──────────────────────────────────────────────────────────┐
│ Switchboard:  ⏳ Starting...                                             │
│ Drive URL:    http://localhost:4001/d/vetra-xxxx                         │
│ Connect:      ⏳ Starting...                                             │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help
```

### 2. Running State - Waiting for Changes

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
✓ Codegen:      Watching for changes...

┌─ Document Modules ───────────────────────────────────────────────────────┐
│                                                                           │
│  No modules in queue. Waiting for document changes...                   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────────────────────────────────┐
│ 14:23:45  ℹ  System ready                                                │
│ 14:23:44  ✓  Connect Studio started                                      │
│ 14:23:42  ✓  Switchboard initialized                                     │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'c' to clear activity
```

### 3. Modules Queued - Debounce Timer Active

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
⏳ Codegen:     2 modules queued (generating in 0.8s...)

┌─ Document Modules ───────────────────────────────────────────────────────┐
│                                                                           │
│  ⏳ document-model: user-profile                                          │
│     Type: powerhouse/document-model                                      │
│     Status: Queued (debounce: 0.8s)                                      │
│                                                                           │
│  ⏳ document-editor: user-profile-editor                                  │
│     Type: powerhouse/document-editor                                     │
│     Status: Queued (debounce: 0.8s)                                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────────────────────────────────┐
│ 14:25:12  ⏳ Queued: user-profile-editor                                  │
│ 14:25:11  ⏳ Queued: user-profile                                         │
│ 14:25:10  ℹ  Document change detected                                    │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'c' to clear activity
```

### 4. Interactive Mode - Awaiting Confirmation

```
╔══════════════════════════════════════════════════════════════════════════╗
║                      VETRA DEVELOPMENT MODE (INTERACTIVE)                ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
⏸  Codegen:     Awaiting user confirmation

┌─ Pending Code Generation ───────────────────────────────────────────────┐
│                                                                           │
│  📝 document-model: user-profile                                          │
│     Changes: Updated schema with new fields                              │
│                                                                           │
│  📝 document-editor: user-profile-editor                                  │
│     Changes: Regenerate based on model changes                           │
│                                                                           │
│  📝 package: auth-package                                                 │
│     Changes: Updated package metadata                                    │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════╗
║  🔔 Code generation ready for 3 module(s)                                ║
║                                                                           ║
║  Do you want to proceed with code generation?                            ║
║                                                                           ║
║  Press 'y' to proceed  |  Press 'n' to cancel                            ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 5. Active Code Generation - With Live Logs

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
⚡ Codegen:     Generating code... (2/3 modules)

┌─ Document Modules ───────────────────────────────────────────────────────┐
│                                                                           │
│  ✓ document-model: user-profile                            [1.2s]        │
│                                                                           │
│  ⚡ document-editor: user-profile-editor                    [0.5s]        │
│  ┌─ Generation Logs ─────────────────────────────────────────────────┐   │
│  │ [Vetra] Generating editor files...                                │   │
│  │ [Vetra] ✓ Generated src/index.tsx                                 │   │
│  │ [Vetra] ✓ Generated src/Editor.tsx                                │   │
│  │ [Vetra] ⚡ Generating types...                                     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ⏳ package: auth-package                                                 │
│     Status: Waiting...                                                   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────────────────────────────────┐
│ 14:26:34  ⚡ Generating: user-profile-editor                              │
│ 14:26:33  ✓ Completed: user-profile (1.2s)                               │
│ 14:26:32  ⚡ Generating: user-profile                                     │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'c' to clear activity
```

### 6. Completed State - All Successful

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
✓ Codegen:      Last generation: 3 modules in 3.4s

┌─ Document Modules ───────────────────────────────────────────────────────┐
│                                                                           │
│  ✓ document-model: user-profile                            [1.2s]        │
│     Generated: 12 files in document-models/user-profile                  │
│                                                                           │
│  ✓ document-editor: user-profile-editor                    [1.8s]        │
│     Generated: 8 files in editors/user-profile-editor                    │
│                                                                           │
│  ✓ package: auth-package                                   [0.4s]        │
│     Generated: 3 files in packages/auth-package                          │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────────────────────────────────┐
│ 14:26:36  ✓ All modules generated successfully (3.4s)                    │
│ 14:26:36  ✓ Completed: auth-package (0.4s)                               │
│ 14:26:35  ✓ Completed: user-profile-editor (1.8s)                        │
│ 14:26:33  ✓ Completed: user-profile (1.2s)                               │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'c' to clear activity
```

### 7. Error State - Generation Failed

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard:  Running on port 4001
✓ Connect:      Running on http://localhost:3000
❌ Codegen:     Last generation: 1 failed, 2 succeeded

┌─ Document Modules ───────────────────────────────────────────────────────┐
│                                                                           │
│  ✓ document-model: user-profile                            [1.2s]        │
│                                                                           │
│  ❌ document-editor: user-profile-editor                   [FAILED]       │
│  ┌─ Error Details ───────────────────────────────────────────────────┐   │
│  │ Error: Failed to generate editor files                            │   │
│  │                                                                    │   │
│  │ TypeError: Cannot read property 'name' of undefined               │   │
│  │   at PackageGenerator.generate (package-generator.ts:45)          │   │
│  │                                                                    │   │
│  │ [Vetra] ✓ Generated src/index.tsx                                 │   │
│  │ [Vetra] ❌ Failed to generate src/Editor.tsx                       │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ⏭  package: auth-package                                  [SKIPPED]      │
│     Skipped due to previous error                                        │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Recent Activity ────────────────────────────────────────────────────────┐
│ 14:27:45  ❌ Generation failed: user-profile-editor                       │
│ 14:27:44  ⚡ Generating: user-profile-editor                              │
│ 14:27:43  ✓ Completed: user-profile (1.2s)                               │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'r' to retry failed
```

### 8. Help Screen

```
╔══════════════════════════════════════════════════════════════════════════╗
║                              VETRA TUI - HELP                            ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─ Keyboard Shortcuts ─────────────────────────────────────────────────────┐
│                                                                           │
│  q          Quit Vetra (stops all services)                              │
│  h          Show/hide this help screen                                   │
│  c          Clear recent activity log                                    │
│  r          Retry failed generations                                     │
│  d          Toggle debug mode (show verbose logs)                        │
│  l          Toggle log level (info/debug/error)                          │
│  ↑/↓        Scroll through activity log                                  │
│  Space      Pause/Resume auto-scroll                                     │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Status Icons ───────────────────────────────────────────────────────────┐
│                                                                           │
│  ⏳         Queued - Waiting to start                                     │
│  ⚡         Processing - Currently generating code                        │
│  ✓          Completed - Successfully generated                           │
│  ❌         Failed - Generation error occurred                            │
│  ⏭          Skipped - Skipped due to previous error                      │
│  ⏸          Paused - Waiting for user confirmation (interactive mode)    │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌─ About ──────────────────────────────────────────────────────────────────┐
│                                                                           │
│  Vetra TUI provides real-time visibility into the code generation        │
│  process. Watch as your document models, editors, and packages are       │
│  automatically generated from your Powerhouse documents.                 │
│                                                                           │
│  For more information, visit: https://docs.powerhouse.io/vetra           │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

Press 'h' to close help | Press 'q' to quit
```

### 9. Compact Mode - Multiple Modules Processing

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

✓ Switchboard: :4001  ✓ Connect: :3000  ⚡ Codegen: 3/8 modules

┌─ Active Generations ─────────────────────────────────────────────────────┐
│ ⚡ user-profile              [2.1s] ████████████░░░░░░░░  60%            │
│ ⚡ auth-module               [1.5s] ██████░░░░░░░░░░░░░░  30%            │
│ ⚡ data-processor            [0.8s] ████░░░░░░░░░░░░░░░░  20%            │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Completed (5) ──────────────────────────────────────────────────────────┐
│ ✓ document-model:user [1.2s]   ✓ editor:profile [0.9s]                  │
│ ✓ package:auth [0.5s]          ✓ subgraph:users [1.8s]                  │
│ ✓ processor:data [0.7s]                                                  │
└──────────────────────────────────────────────────────────────────────────┘

Last: 14:28:45 | Total: 8 | Success: 5 | Processing: 3 | Failed: 0
```

## UI Design Principles

### 1. **Real-time Updates**

- All status changes appear immediately
- Smooth transitions between states
- No manual refresh needed

### 2. **Progressive Disclosure**

- Show compact view by default
- Expand details only for active/failed modules
- Logs appear only during active generation
- Details disappear when complete (unless error)

### 3. **Visual Hierarchy**

- System status at top (Switchboard, Connect, Codegen)
- Active modules in main panel with prominence
- Completed modules shown compactly
- Recent activity at bottom

### 4. **Color Coding** (when supported)

- 🟢 Green: Success (✓)
- 🔵 Blue: Processing (⚡)
- 🟡 Yellow: Queued (⏳)
- 🔴 Red: Error (❌)
- ⚪ Gray: Skipped (⏭)

### 5. **Animations**

- Spinner for processing states
- Progress bars for long operations
- Smooth fade-in/out for completed items
- Debounce countdown timer

### 6. **Information Density**

- Balanced - not too sparse, not too crowded
- Key info always visible
- Details on demand (expandable)
- Automatic cleanup of old entries

## Technical Implementation Details

### Components Breakdown

#### VetraTUI.tsx (Main Container)

```typescript
interface VetraTUIProps {
  statusTracker: VetraStatusTracker;
  switchboardUrl: string;
  connectUrl: string;
}

// Manages overall layout and state
// Coordinates between all sub-components
// Handles keyboard shortcuts
```

#### SystemStatus.tsx

```typescript
// Displays Switchboard, Connect, and Codegen status
// Shows URLs and connection state
// Updates in real-time
```

#### ModuleList.tsx

```typescript
// Lists all document modules
// Filters by state (queued, processing, completed)
// Handles expansion/collapse of details
```

#### ModuleItem.tsx

```typescript
interface ModuleItemProps {
  module: ModuleStatus;
  expanded: boolean;
  onToggle: () => void;
}

// Single module with status icon, name, timing
// Expandable to show logs or errors
// Loading animation when processing
```

#### LogStream.tsx

```typescript
// Real-time log display below active module
// Auto-scroll with pause option
// Filters by log level
// Temporary - clears when module completes
```

#### ActivityLog.tsx

```typescript
// Shows recent activity feed
// Time-stamped entries
// Scrollable history
// Clear button
```

#### HelpScreen.tsx

```typescript
// Keyboard shortcuts
// Status icon legend
// About information
// Toggle with 'h' key
```

### Status Tracker Events

```typescript
interface VetraStatusEvents {
  "module:queued": (module: ModuleInfo) => void;
  "module:processing": (module: ModuleInfo) => void;
  "module:completed": (module: ModuleInfo, duration: number) => void;
  "module:failed": (module: ModuleInfo, error: Error) => void;
  "module:log": (module: ModuleInfo, message: string, level: LogLevel) => void;
  "system:ready": () => void;
  "system:error": (error: Error) => void;
  "debounce:start": (timeMs: number) => void;
  "debounce:tick": (remainingMs: number) => void;
  "interactive:prompt": (modules: ModuleInfo[]) => void;
  "interactive:confirmed": (approved: boolean) => void;
}
```

### Module Status Interface

```typescript
interface ModuleStatus {
  id: string;
  name: string;
  type: DocumentType;
  state: "queued" | "processing" | "completed" | "failed" | "skipped";
  startTime?: number;
  endTime?: number;
  duration?: number;
  error?: Error;
  logs: LogEntry[];
  filesGenerated?: number;
  outputPath?: string;
}

interface LogEntry {
  timestamp: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}
```

## Session Logging for Debugging

### Overview

All Vetra TUI sessions are automatically logged to `.ph/vetra/logs/` directory for debugging and troubleshooting. This provides a complete audit trail of every session without cluttering the TUI display.

### Log File Structure

```
.ph/
└── vetra/
    └── logs/
        ├── session-2025-01-22-143045.log          # Complete session log
        ├── session-2025-01-22-143045-errors.log   # Errors only
        ├── session-2025-01-22-151230.log
        └── latest.log                              # Symlink to most recent
```

### Log File Format

```
[2025-01-22 14:30:45.123] [SYSTEM] Vetra TUI session started
[2025-01-22 14:30:45.234] [SYSTEM] Switchboard initializing on port 4001
[2025-01-22 14:30:46.456] [SYSTEM] Connect Studio starting on port 3000
[2025-01-22 14:30:47.789] [INFO] System ready
[2025-01-22 14:31:15.234] [MODULE] user-profile [queued] type=powerhouse/document-model
[2025-01-22 14:31:16.345] [DEBOUNCE] Starting debounce timer: 1000ms
[2025-01-22 14:31:17.456] [MODULE] user-profile [processing] started
[2025-01-22 14:31:17.567] [LOG] [Vetra] Generating base operations...
[2025-01-22 14:31:17.678] [LOG] [Vetra] ✓ Generated src/operations/index.ts
[2025-01-22 14:31:18.789] [MODULE] user-profile [completed] duration=1332ms files=12
[2025-01-22 14:31:20.123] [ERROR] user-profile-editor [failed] TypeError: Cannot read property 'name'
[2025-01-22 14:31:20.124] [STACK] at PackageGenerator.generate (package-generator.ts:45:12)
[2025-01-22 14:32:00.000] [SYSTEM] User pressed 'q', shutting down
[2025-01-22 14:32:00.100] [SYSTEM] Vetra TUI session ended
```

### What Gets Logged

#### 1. System Events

- Session start/end timestamps
- Switchboard initialization and URLs
- Connect Studio startup
- Configuration loaded
- Shutdown events

#### 2. Module Lifecycle

- Module queued with document type and ID
- State transitions (queued → processing → completed/failed)
- Duration and performance metrics
- Files generated count and paths
- Error messages with full stack traces

#### 3. User Interactions

- Interactive mode confirmations (y/n)
- Keyboard shortcuts pressed
- Help screen viewed
- Activity log cleared

#### 4. Codegen Events

- Debounce timer events
- Queue status changes
- Generator selection and routing
- File write operations
- Validation failures

#### 5. Performance Metrics

- Module generation times
- Total session duration
- Peak queue size
- Success/failure rates

### Session Logger Implementation

```typescript
// File: packages/vetra/processors/codegen/session-logger.ts

import { mkdir, writeFile, appendFile, symlink } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export class SessionLogger {
  private sessionId: string;
  private logFilePath: string;
  private errorLogPath: string;
  private logBuffer: string[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(workingDir: string) {
    this.sessionId = this.generateSessionId();
    const logDir = join(workingDir, ".ph", "vetra", "logs");
    this.logFilePath = join(logDir, `session-${this.sessionId}.log`);
    this.errorLogPath = join(logDir, `session-${this.sessionId}-errors.log`);

    // Initialize log directory and files
    this.initialize(logDir);

    // Flush buffer every 100ms for performance
    this.flushInterval = setInterval(() => this.flush(), 100);
  }

  private async initialize(logDir: string): Promise<void> {
    await mkdir(logDir, { recursive: true });

    // Create session header
    const header = [
      "=".repeat(80),
      `Vetra TUI Session Log`,
      `Session ID: ${this.sessionId}`,
      `Started: ${new Date().toISOString()}`,
      `Working Directory: ${process.cwd()}`,
      `Node Version: ${process.version}`,
      "=".repeat(80),
      "",
    ].join("\n");

    await writeFile(this.logFilePath, header);

    // Create/update 'latest.log' symlink
    const latestLink = join(logDir, "latest.log");
    try {
      await symlink(this.logFilePath, latestLink);
    } catch {
      // Symlink exists, ignore
    }

    this.log("SYSTEM", "Vetra TUI session started");
  }

  private generateSessionId(): string {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "-");
  }

  private formatLogEntry(
    level: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): string {
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 23);
    const meta = metadata ? ` ${JSON.stringify(metadata)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${meta}`;
  }

  public log(
    level: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    const entry = this.formatLogEntry(level, message, metadata);
    this.logBuffer.push(entry);

    // Also write errors to separate error log
    if (level === "ERROR" || level === "STACK") {
      appendFile(this.errorLogPath, entry + "\n").catch(console.error);
    }
  }

  public logModuleEvent(
    module: string,
    state: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log("MODULE", `${module} [${state}]`, metadata);
  }

  public logSystemEvent(
    event: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log("SYSTEM", event, metadata);
  }

  public logError(error: Error, context?: string): void {
    const prefix = context ? `${context}: ` : "";
    this.log("ERROR", `${prefix}${error.message}`);
    if (error.stack) {
      this.log("STACK", error.stack);
    }
  }

  public logUserAction(
    action: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log("USER", action, metadata);
  }

  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const entries = this.logBuffer.splice(0, this.logBuffer.length);
    const content = entries.join("\n") + "\n";

    try {
      await appendFile(this.logFilePath, content);
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  public async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flush();

    this.log("SYSTEM", "Vetra TUI session ended");
    await this.flush();

    // Write session summary
    const footer = [
      "",
      "=".repeat(80),
      `Session ended: ${new Date().toISOString()}`,
      "=".repeat(80),
    ].join("\n");

    await appendFile(this.logFilePath, footer);
  }
}
```

### Status Tracker Integration

```typescript
// File: packages/vetra/processors/codegen/status-tracker.ts

import { EventEmitter } from "events";
import { SessionLogger } from "./session-logger.js";

export class VetraStatusTracker extends EventEmitter {
  private sessionLogger: SessionLogger;
  private modules = new Map<string, ModuleStatus>();

  constructor(workingDir: string) {
    super();
    this.sessionLogger = new SessionLogger(workingDir);

    // Log all events for debugging
    this.on("module:queued", (module) => {
      this.sessionLogger.logModuleEvent(module.name, "queued", {
        type: module.type,
        id: module.id,
      });
    });

    this.on("module:processing", (module) => {
      this.sessionLogger.logModuleEvent(module.name, "processing", {
        startTime: module.startTime,
      });
    });

    this.on("module:completed", (module, duration) => {
      this.sessionLogger.logModuleEvent(module.name, "completed", {
        duration,
        filesGenerated: module.filesGenerated,
      });
    });

    this.on("module:failed", (module, error) => {
      this.sessionLogger.logModuleEvent(module.name, "failed");
      this.sessionLogger.logError(error, `Module: ${module.name}`);
    });

    this.on("module:log", (module, message, level) => {
      this.sessionLogger.log(level.toUpperCase(), message);
    });

    this.on("system:ready", () => {
      this.sessionLogger.logSystemEvent("System ready");
    });

    this.on("system:error", (error) => {
      this.sessionLogger.logError(error);
    });

    this.on("interactive:prompt", (modules) => {
      this.sessionLogger.logUserAction("Interactive prompt shown", {
        moduleCount: modules.length,
      });
    });

    this.on("interactive:confirmed", (approved) => {
      this.sessionLogger.logUserAction(
        approved ? "User approved generation" : "User cancelled generation",
      );
    });
  }

  public async shutdown(): Promise<void> {
    await this.sessionLogger.close();
  }
}
```

### Accessing Session Logs

#### Via TUI (New Help Command)

```
Press 'l' to show log file path in footer
Press 'L' to open log file in default editor
```

#### Footer Display (when 'l' pressed)

```
Log: .ph/vetra/logs/session-2025-01-22-143045.log | Press 'L' to open
```

#### Via CLI

```bash
# View latest session
cat .ph/vetra/logs/latest.log

# View errors only
cat .ph/vetra/logs/session-*-errors.log | tail -n 50

# View all sessions
ls -lt .ph/vetra/logs/

# Follow live logs (during session)
tail -f .ph/vetra/logs/latest.log
```

### Log Rotation

```typescript
// Automatic cleanup of old log files
// File: packages/vetra/processors/codegen/log-rotation.ts

export async function rotateLogFiles(
  logDir: string,
  maxAge = 7,
): Promise<void> {
  const files = await readdir(logDir);
  const now = Date.now();
  const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

  for (const file of files) {
    if (!file.startsWith("session-")) continue;

    const filePath = join(logDir, file);
    const stats = await stat(filePath);

    if (now - stats.mtimeMs > maxAgeMs) {
      await unlink(filePath);
    }
  }
}
```

### Configuration

```json
{
  "vetra": {
    "tui": {
      "logging": {
        "enabled": true,
        "directory": ".ph/vetra/logs",
        "maxAge": 7,
        "separateErrorLog": true,
        "includeStackTraces": true,
        "logLevel": "debug"
      }
    }
  }
}
```

### Benefits

1. **Complete Audit Trail**: Every session fully logged
2. **Debugging**: Full context when issues occur
3. **Performance Analysis**: Timing data for optimization
4. **User Support**: Logs can be shared for troubleshooting
5. **Non-Intrusive**: Doesn't clutter TUI display
6. **Searchable**: Text format, easy to grep/search
7. **Automatic**: No user action required
8. **Efficient**: Buffered writes, minimal overhead

### Updated Initial State UI (showing log path)

```
╔══════════════════════════════════════════════════════════════════════════╗
║                           VETRA DEVELOPMENT MODE                         ║
╚══════════════════════════════════════════════════════════════════════════╝

⚙️  Initializing Switchboard...
⚙️  Starting Codegen Processor...
⚙️  Launching Connect Studio...

┌─ System Status ──────────────────────────────────────────────────────────┐
│ Switchboard:  ⏳ Starting...                                             │
│ Drive URL:    http://localhost:4001/d/vetra-xxxx                         │
│ Connect:      ⏳ Starting...                                             │
│ Session Log:  .ph/vetra/logs/session-2025-01-22-143045.log              │
└──────────────────────────────────────────────────────────────────────────┘

Press 'q' to quit | 'h' for help | 'l' to view log
```

## Configuration Options

### Command Line Flags

```bash
# Enable TUI (default)
ph vetra --tui

# Disable TUI (use legacy logging)
ph vetra --no-tui

# TUI with interactive mode
ph vetra --tui --interactive

# Compact TUI mode (minimal UI)
ph vetra --tui --compact

# Debug mode with verbose logs
ph vetra --tui --logs
```

### Config File (powerhouse.config.json)

```json
{
  "vetra": {
    "tui": {
      "enabled": true,
      "theme": "default",
      "compact": false,
      "logLevel": "info",
      "maxActivityEntries": 50,
      "clearLogsOnComplete": true,
      "showTimings": true,
      "showFileCount": true
    }
  }
}
```

## Accessibility Considerations

1. **Non-TTY Support**: Fallback to simple logging
2. **Screen Readers**: Provide text-only mode option
3. **Terminal Compatibility**: Works in all major terminals
4. **Color Blindness**: Use icons + colors (not colors alone)
5. **Low Contrast**: Support high-contrast theme

## Future Enhancements

1. **Split View**: Show code diff preview
2. **Graph View**: Visualize module dependencies
3. **Stats Dashboard**: Generation metrics over time
4. **Export Logs**: Save session logs to file
5. **Remote Monitoring**: View TUI over SSH/web
6. **Notifications**: Desktop notifications for completion
7. **Custom Themes**: User-configurable color schemes
