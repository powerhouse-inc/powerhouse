import React, { useState, useEffect, useCallback, useRef } from "react";
import path from "node:path";
import { Box, Text, useInput, useStdout } from "ink";
import Spinner from "ink-spinner";
import type { ServiceManager, ServiceInstanceStatus } from "../core/types.js";
import type { ProjectScanResult } from "../core/project-scanner.js";
import { resolveServiceName } from "../core/services.js";

interface ServicePanelProps {
  services: ServiceManager;
  onExit: () => void;
  /** When set, scope the panel to a single service. */
  serviceId?: string;
  /** CLI workdir — used for project scanning. */
  workdir?: string;
}

type PanelView = "list" | "details" | "logs";

/** Discriminated union for items in the panel list. */
type PanelItem =
  | { kind: "instance"; data: ServiceInstanceStatus }
  | { kind: "project"; data: ProjectScanResult; serviceId: string };

function statusIcon(status: ServiceInstanceStatus["status"]): string {
  return status === "ready"
    ? "●"
    : status === "starting"
      ? "◐"
      : status === "failed"
        ? "✗"
        : status === "stopping"
          ? "◑"
          : status === "stopped"
            ? "■"
            : "○";
}

function statusColor(status: ServiceInstanceStatus["status"]): string {
  return status === "ready"
    ? "green"
    : status === "starting"
      ? "yellow"
      : status === "failed"
        ? "red"
        : "gray";
}

/**
 * Build a combined list of instances + discovered projects.
 * Projects whose path matches a running/stopped instance's workdir are excluded.
 */
function buildPanelItems(
  statuses: ServiceInstanceStatus[],
  services: ServiceManager,
  workdir?: string,
): PanelItem[] {
  const items: PanelItem[] = [];

  // Add instances (skip idle placeholders when projects are available)
  const instanceWorkdirs = new Set<string>();
  for (const svc of statuses) {
    if (svc.workdir) instanceWorkdirs.add(svc.workdir);
  }

  // Determine which service IDs have a projectScanner
  const serviceIds = new Set(statuses.map((s) => s.serviceId));
  let hasProjects = false;
  const projectItems: PanelItem[] = [];

  if (workdir) {
    for (const sid of serviceIds) {
      const def = services.getDefinition(sid);
      if (!def?.projectScanner) continue;
      const projects = services.scanProjects(sid, workdir);
      for (const proj of projects) {
        // Skip projects that already have a running/stopped instance
        if (!instanceWorkdirs.has(proj.path)) {
          projectItems.push({ kind: "project", data: proj, serviceId: sid });
          hasProjects = true;
        }
      }
    }
  }

  // Add instances — skip idle placeholders if we have projects to show
  for (const svc of statuses) {
    if (svc.status === "idle" && hasProjects) continue;
    items.push({ kind: "instance", data: svc });
  }

  // Add remaining projects after instances
  items.push(...projectItems);

  return items;
}

/**
 * Interactive service management panel for the REPL.
 * Shows service status, supports start/stop, log viewing, and detail inspection.
 * When a service has a projectScanner and workdir is provided, discovered projects
 * are shown and can be started directly.
 */
export function ServicePanel({
  services,
  onExit,
  serviceId,
  workdir,
}: ServicePanelProps) {
  const { stdout } = useStdout();
  const columns = stdout?.columns || 80;

  const [statuses, setStatuses] = useState(() => services.list(serviceId));
  const [items, setItems] = useState<PanelItem[]>(() =>
    buildPanelItems(services.list(serviceId), services, workdir),
  );
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<PanelView>("list");
  const [busy, setBusy] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [detailServiceId, setDetailServiceId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  function refreshList() {
    const newStatuses = services.list(serviceId);
    setStatuses(newStatuses);
    setItems(buildPanelItems(newStatuses, services, workdir));
  }

  // Poll service statuses
  useEffect(() => {
    const timer = setInterval(refreshList, 2000);
    return () => clearInterval(timer);
  }, [services, workdir]);

  // Cleanup log watcher on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const openLogs = useCallback(
    (svcId: string, instId: string) => {
      cleanupRef.current?.();
      const initial = services.logs(svcId, instId, 30).split("\n");
      setLogLines(initial);
      setDetailServiceId(svcId);
      setView("logs");
      const cleanup = services.watchLogs(svcId, instId, (line) => {
        setLogLines((prev) => [...prev.slice(-200), line]);
      });
      cleanupRef.current = cleanup;
    },
    [services],
  );

  const closeSubview = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setLogLines([]);
    setDetailServiceId(null);
    setView("list");
    refreshList();
  }, [services, workdir]);

  const openDetails = useCallback((svcId: string) => {
    setDetailServiceId(svcId);
    setView("details");
  }, []);

  const startProject = useCallback(
    async (projServiceId: string, projPath: string) => {
      const def = services.getDefinition(projServiceId);
      if (!def) return;
      const maxInstances = def.maxInstances ?? 1;
      const running = statuses.filter(
        (s) =>
          s.serviceId === projServiceId &&
          (s.status === "ready" || s.status === "starting"),
      );

      if (running.length >= maxInstances) {
        if (maxInstances === 1 && running.length === 1) {
          // Offer to kill and restart
          setConfirm({
            message: `${resolveServiceName(def)} is already running. Kill and start in ${path.basename(projPath)}? (y/n)`,
            onConfirm: async () => {
              setConfirm(null);
              setBusy(`Restarting ${resolveServiceName(def)}...`);
              try {
                await services.stop(projServiceId);
                await services.start(projServiceId, {
                  workdir: projPath,
                  cwd: projPath,
                });
              } catch {
                /* ignore */
              }
              setBusy(null);
              refreshList();
            },
          });
          return;
        }
        // Multi-instance limit reached
        setBusy(
          `Instance limit reached (${maxInstances}). Stop an instance first.`,
        );
        setTimeout(() => setBusy(null), 3000);
        return;
      }

      setBusy(
        `Starting ${resolveServiceName(def)} in ${path.basename(projPath)}...`,
      );
      try {
        await services.start(projServiceId, {
          workdir: projPath,
          cwd: projPath,
        });
      } catch {
        /* ignore */
      }
      setBusy(null);
      refreshList();
    },
    [services, statuses, workdir],
  );

  const toggleInstance = useCallback(
    async (svc: ServiceInstanceStatus) => {
      if (svc.status === "ready" || svc.status === "starting") {
        setBusy(`Stopping ${svc.name}...`);
        try {
          await services.stop(svc.serviceId, svc.instanceId);
        } catch {
          /* ignore */
        }
      } else {
        setBusy(`Starting ${svc.name}...`);
        try {
          await services.start(svc.serviceId, {
            workdir: svc.workdir,
            cwd: svc.workdir,
            params: svc.params,
          });
        } catch {
          /* ignore */
        }
      }
      setBusy(null);
      refreshList();
    },
    [services, workdir],
  );

  const handleAction = useCallback(async () => {
    const item = items[selected];
    if (!item || busy) return;

    if (item.kind === "project") {
      await startProject(item.serviceId, item.data.path);
    } else {
      await toggleInstance(item.data);
    }
  }, [items, selected, busy, startProject, toggleInstance]);

  useInput((ch, key) => {
    // Confirmation dialog intercept
    if (confirm) {
      if (ch === "y" || ch === "Y") {
        confirm.onConfirm();
      } else {
        setConfirm(null);
      }
      return;
    }

    // Subviews: logs and details
    if (view === "logs" || view === "details") {
      if (key.escape || ch === "q" || ch === "Q") {
        closeSubview();
        return;
      }
      // In details view, allow 'l' to jump to logs
      if (view === "details" && (ch === "l" || ch === "L") && detailServiceId) {
        // Find the instance to get its instanceId
        const inst = statuses.find((s) => s.serviceId === detailServiceId);
        if (inst) openLogs(detailServiceId, inst.instanceId);
        return;
      }
      return;
    }

    // List view
    if (key.escape || ch === "q" || ch === "Q") {
      onExit();
      return;
    }

    if (key.upArrow || ch === "k") {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || ch === "j") {
      setSelected((s) => Math.min(items.length - 1, s + 1));
      return;
    }

    if (key.return || ch === " ") {
      handleAction();
      return;
    }

    if (ch === "d" || ch === "D") {
      const item = items[selected];
      if (item?.kind === "instance") openDetails(item.data.serviceId);
      return;
    }

    if (ch === "l" || ch === "L") {
      const item = items[selected];
      if (item?.kind === "instance")
        openLogs(item.data.serviceId, item.data.instanceId);
      return;
    }

    if (ch === "r" || ch === "R") {
      refreshList();
      return;
    }
  });

  const hr = <Text color="green">{"─".repeat(columns)}</Text>;

  // ── Details view ──
  if (view === "details" && detailServiceId) {
    const svc = statuses.find((s) => s.serviceId === detailServiceId);
    const def = services.getDefinition(detailServiceId);

    // Readiness patterns from definition
    const patterns =
      def?.readiness?.patterns ??
      (def?.readiness?.pattern
        ? [
            {
              name: "_default",
              pattern: def.readiness.pattern,
              captures: def.readiness.captures,
            },
          ]
        : []);

    return (
      <Box flexDirection="column">
        {hr}
        <Box justifyContent="space-between">
          <Text bold color="cyan">
            {" "}
            {svc?.name ?? detailServiceId}{" "}
          </Text>
          <Text dimColor> l logs q/Esc back </Text>
        </Box>
        {hr}
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>
            <Text bold>ID: </Text>
            {detailServiceId}
          </Text>
          <Text>
            <Text bold>Status: </Text>
            <Text color={statusColor(svc?.status ?? "idle")}>
              {statusIcon(svc?.status ?? "idle")} {svc?.status ?? "idle"}
            </Text>
          </Text>
          <Text>
            <Text bold>PID: </Text>
            {String(svc?.pid ?? "—")}
          </Text>
          <Text>
            <Text bold>Command: </Text>
            {typeof def?.command === "function"
              ? "(dynamic)"
              : (def?.command ?? "—")}
          </Text>
          {def?.shutdown && (
            <Text>
              <Text bold>Shutdown:</Text>
              {` ${def.shutdown.signal} (timeout ${def.shutdown.timeout}ms)`}
            </Text>
          )}
          {def?.restart?.enabled && (
            <Text>
              <Text bold>Restart: </Text>
              {`enabled, max ${def.restart.maxRetries} retries, ${def.restart.delay}ms delay`}
            </Text>
          )}
          {svc?.error && (
            <Text>
              <Text bold>Error: </Text>
              <Text color="red">{svc.error}</Text>
            </Text>
          )}

          {/* Endpoints */}
          {svc?.endpoints && Object.keys(svc.endpoints).length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Endpoints:</Text>
              {Object.entries(svc.endpoints).map(([k, v]) => (
                <Text key={k}>
                  {" "}
                  {k}: {v}
                </Text>
              ))}
            </Box>
          )}

          {/* Readiness patterns */}
          {patterns.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>
                Readiness patterns
                {def?.readiness?.timeout
                  ? ` (timeout ${def.readiness.timeout}ms)`
                  : ""}
                :
              </Text>
              {patterns.map((p) => (
                <Box key={p.name} flexDirection="column">
                  <Text>
                    {" "}
                    {p.name}: <Text dimColor>{p.pattern.source}</Text>
                  </Text>
                  {p.captures && Object.keys(p.captures).length > 0 && (
                    <Text dimColor>
                      {" "}
                      captures:{" "}
                      {Object.entries(p.captures)
                        .map(([k, v]) => `${k}→$${v}`)
                        .join(", ")}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        <Text>{""}</Text>
        {hr}
      </Box>
    );
  }

  // ── Log view ──
  if (view === "logs" && detailServiceId) {
    const svc = statuses.find((s) => s.serviceId === detailServiceId);
    const visibleLines = logLines.slice(-20);
    return (
      <Box flexDirection="column">
        {hr}
        <Box justifyContent="space-between">
          <Text bold color="cyan">
            {" "}
            Logs: {svc?.name ?? detailServiceId}{" "}
          </Text>
          <Text dimColor> q/Esc back </Text>
        </Box>
        {hr}
        <Box flexDirection="column" marginLeft={1} marginTop={1}>
          {visibleLines.map((line, i) => (
            <Text key={i} dimColor>
              {line}
            </Text>
          ))}
          {visibleLines.length === 0 && <Text dimColor>(no logs)</Text>}
        </Box>
      </Box>
    );
  }

  // ── List view ──
  return (
    <Box flexDirection="column">
      {hr}
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          {" "}
          Services{" "}
        </Text>
        <Text dimColor>
          {" "}
          ↑↓ select Enter start/toggle d details l logs r refresh q close{" "}
        </Text>
      </Box>
      {hr}
      <Box flexDirection="column" marginTop={1} marginLeft={1}>
        {items.map((item, i) => {
          const isSelected = i === selected;

          if (item.kind === "project") {
            const rel = workdir
              ? path.relative(workdir, item.data.path)
              : item.data.path;
            const display = rel ? "./" + rel : ".";
            return (
              <Box key={`proj-${item.data.path}`}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "▸ " : "  "}
                </Text>
                <Text color="blue">◇ </Text>
                <Text bold={isSelected}>{item.data.name.padEnd(24)}</Text>
                <Text dimColor> {display}</Text>
              </Box>
            );
          }

          const svc = item.data;
          const icon = statusIcon(svc.status);
          const color = statusColor(svc.status);

          const epParts: string[] = [];
          if (svc.endpoints) {
            for (const [k, v] of Object.entries(svc.endpoints)) {
              epParts.push(`${k}=${v}`);
            }
          }

          return (
            <Box key={svc.instanceId}>
              <Text color={isSelected ? "cyan" : undefined}>
                {isSelected ? "▸ " : "  "}
              </Text>
              <Text color={color}>{icon} </Text>
              <Text bold={isSelected}>{svc.name.padEnd(24)}</Text>
              <Text dimColor> [{svc.status}]</Text>
              {svc.workdir && (
                <Text dimColor> {path.basename(svc.workdir)}</Text>
              )}
              {svc.pid != null && svc.pid > 0 && (
                <Text dimColor> pid {String(svc.pid)}</Text>
              )}
              {epParts.length > 0 && <Text dimColor> {epParts.join(" ")}</Text>}
              {svc.workdir && <Text dimColor> {svc.workdir}</Text>}
              {svc.error && <Text color="red"> {svc.error}</Text>}
            </Box>
          );
        })}
      </Box>
      {busy && (
        <Box marginTop={1} marginLeft={1}>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {busy}</Text>
        </Box>
      )}
      {confirm && (
        <Box marginTop={1} marginLeft={1}>
          <Text color="yellow">{confirm.message}</Text>
        </Box>
      )}
      <Text>{""}</Text>
      {hr}
    </Box>
  );
}
