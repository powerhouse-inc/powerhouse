import { z } from "zod";

export function formatZodError(err: unknown, commandId?: string): string {
  if (!(err instanceof z.ZodError)) {
    return err instanceof Error ? err.message : String(err);
  }
  const header = commandId
    ? `Invalid arguments for '${commandId}'`
    : "Validation error";
  const lines = err.issues.map((issue) => {
    const path =
      issue.path.length > 0 ? `--${issue.path.join(".")}` : "(input)";
    return `  ${path}: ${issue.message}`;
  });
  return [header, ...lines].join("\n");
}
