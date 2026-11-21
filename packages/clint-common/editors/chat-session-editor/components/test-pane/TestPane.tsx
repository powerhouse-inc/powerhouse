import { useState, useCallback } from "react";
import { generateId } from "document-model";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type { ChatSessionAction } from "document-models/chat-session";
import {
  startSession,
  setAgentInfo,
  setAgentImage,
  setAgentDescription,
  endSession,
  updateUsageSummary,
  addSystemMessage,
  addUserMessage,
  deleteUserMessage,
  abortSession,
  retryTurn,
  resumeSession,
  addAssistantMessage,
  appendAssistantContent,
  updateAssistantContent,
  setMessageUsage,
  addToolResult,
  markMessagePickedUp,
  failTurn,
  clearRetryRequest,
  addToolOutput,
} from "document-models/chat-session";
import { ModuleTabs, type ModuleName } from "./ModuleTabs.js";
import { OperationForm } from "./OperationForm.js";
import { OperationLog, type LogEntry } from "./OperationLog.js";
import { getOperationsForModule, type OperationDef } from "./operations.js";

interface TestPaneProps {
  dispatch: DocumentDispatch<ChatSessionAction>;
}

type ActionCreatorMap = Record<string, (input: any) => ChatSessionAction>;

const actionCreators: ActionCreatorMap = {
  START_SESSION: startSession,
  SET_AGENT_INFO: setAgentInfo,
  SET_AGENT_IMAGE: setAgentImage,
  SET_AGENT_DESCRIPTION: setAgentDescription,
  END_SESSION: endSession,
  UPDATE_USAGE_SUMMARY: updateUsageSummary,
  ADD_SYSTEM_MESSAGE: addSystemMessage,
  ADD_USER_MESSAGE: addUserMessage,
  DELETE_USER_MESSAGE: deleteUserMessage,
  ABORT_SESSION: abortSession,
  RETRY_TURN: retryTurn,
  RESUME_SESSION: resumeSession,
  ADD_ASSISTANT_MESSAGE: addAssistantMessage,
  APPEND_ASSISTANT_CONTENT: (input: Record<string, unknown>) => {
    const parts = input.part as unknown[];
    return appendAssistantContent({
      messageId: input.messageId as string,
      part: (Array.isArray(parts) ? parts[0] : parts) as Parameters<
        typeof appendAssistantContent
      >[0]["part"],
    });
  },
  UPDATE_ASSISTANT_CONTENT: updateAssistantContent,
  SET_MESSAGE_USAGE: setMessageUsage,
  MARK_MESSAGE_PICKED_UP: markMessagePickedUp,
  FAIL_TURN: failTurn,
  CLEAR_RETRY_REQUEST: clearRetryRequest,
  ADD_TOOL_RESULT: addToolResult,
  ADD_TOOL_OUTPUT: addToolOutput,
};

export function TestPane({ dispatch }: TestPaneProps) {
  const [activeModule, setActiveModule] = useState<ModuleName>("system");
  const [selectedOpIndex, setSelectedOpIndex] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  const operations = getOperationsForModule(activeModule);
  const selectedOp = operations[selectedOpIndex] as OperationDef | undefined;

  const handleModuleChange = useCallback((mod: ModuleName) => {
    setActiveModule(mod);
    setSelectedOpIndex(0);
  }, []);

  const handleDispatch = useCallback(
    (input: Record<string, unknown>) => {
      if (!selectedOp) return;

      const creator = actionCreators[selectedOp.name];

      try {
        const action = creator(input);
        dispatch(action);
        setLogEntries((prev) => [
          {
            id: generateId(),
            operation: selectedOp.name,
            timestamp: new Date().toISOString(),
            success: true,
          },
          ...prev,
        ]);
      } catch (err) {
        setLogEntries((prev) => [
          {
            id: generateId(),
            operation: selectedOp.name,
            timestamp: new Date().toISOString(),
            success: false,
            error: err instanceof Error ? err.message : String(err),
          },
          ...prev,
        ]);
      }
    },
    [selectedOp, dispatch],
  );

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Test Pane</h3>
        <p className="text-[10px] text-muted-foreground">
          Dispatch operations to build the conversation
        </p>
      </div>

      <ModuleTabs
        activeModule={activeModule}
        onModuleChange={handleModuleChange}
      />

      {operations.length > 0 && (
        <div className="border-b border-border px-3 py-2">
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
            value={selectedOpIndex}
            onChange={(e) => setSelectedOpIndex(Number(e.target.value))}
          >
            {operations.map((op, i) => (
              <option key={op.name} value={i}>
                {op.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {selectedOp && (
          <OperationForm
            key={`${selectedOp.module}-${selectedOp.name}`}
            operation={selectedOp}
            onDispatch={handleDispatch}
          />
        )}
      </div>

      <div className="border-t border-border">
        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Operation Log
        </div>
        <div className="max-h-40 overflow-y-auto">
          <OperationLog entries={logEntries.slice(0, 20)} />
        </div>
      </div>
    </div>
  );
}
