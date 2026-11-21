import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import { cn } from "../../lib/utils.js";

export interface LogEntry {
  id: string;
  operation: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

interface OperationLogProps {
  entries: LogEntry[];
}

export function OperationLog({ entries }: OperationLogProps) {
  if (entries.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground text-center">
        No operations dispatched yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "flex items-start gap-2 rounded-md px-2 py-1.5 text-xs",
            entry.success
              ? "bg-green-50 dark:bg-green-950/20"
              : "bg-red-50 dark:bg-red-950/20",
          )}
        >
          {entry.success ? (
            <CheckCircleIcon className="mt-0.5 size-3 shrink-0 text-green-600" />
          ) : (
            <XCircleIcon className="mt-0.5 size-3 shrink-0 text-red-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-mono font-medium truncate">
              {entry.operation}
            </div>
            {entry.error && (
              <div className="text-red-600 mt-0.5 break-words">
                {entry.error}
              </div>
            )}
            <div className="text-muted-foreground">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
