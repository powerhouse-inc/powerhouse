import path from "node:path";
import { startRegistry, WORKSPACE_PUBLISH_PACKAGES } from "/home/user/powerhouse/test/e2e-utils/src/index.ts";
const ROOT = "/home/user/powerhouse/test/package-e2e";
const child = await startRegistry(path.join(ROOT, ".registry-storage"), path.join(ROOT, ".registry-cdn-cache"), { localPackages: WORKSPACE_PUBLISH_PACKAGES.join(",") });
console.log("REGISTRY PID", child.pid);
setInterval(() => {}, 1 << 30);
