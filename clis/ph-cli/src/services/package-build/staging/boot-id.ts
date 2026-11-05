import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function readBootId(): string | null {
  try {
    const id =
      process.platform === "linux"
        ? readFileSync("/proc/sys/kernel/random/boot_id", "utf8")
        : process.platform === "darwin"
          ? execFileSync("sysctl", ["-n", "kern.bootsessionuuid"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            })
          : "";
    return id.trim() || null;
  } catch {
    return null;
  }
}

let memo: string | null | undefined;

/**
 * This boot of the machine, as the OS names it, or null where it cannot be
 * read. Unlike a boot time derived from the clock, it changes only with a
 * reboot.
 */
export function currentBootId(): string | null {
  if (memo === undefined) memo = readBootId();
  return memo;
}
