import { execSync } from "child_process";

const pkgs = process.env.PH_PACKAGES?.split(",") || [];
for (const pkg of pkgs) {
  if (pkg === "") continue;
  console.log(`> Installing ${pkg}`);
  execSync(`pnpm add ${pkg}`, { stdio: "inherit" });
}
