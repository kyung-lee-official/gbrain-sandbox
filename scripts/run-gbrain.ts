/**
 * Run the gbrain CLI with cwd = apps/gbrain.
 * Usage: bun run scripts/run-gbrain.ts <gbrain-args...>
 */
import { $ } from "bun";
import { join, pathExists } from "./fs-path.ts";

const root = join(import.meta.dir, "..");
const cwd = join(root, "apps", "gbrain");
const args = Bun.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: bun run scripts/run-gbrain.ts <gbrain-args...>");
  process.exit(1);
}

if (!(await pathExists(cwd)) || !(await pathExists(join(cwd, ".git")))) {
  console.error(
    `Missing nested gbrain git checkout at ${cwd}. See docs/GBRAIN_SETUP.md.`,
  );
  process.exit(1);
}

const result = await $`gbrain ${args}`.cwd(cwd).nothrow();
process.exit(result.exitCode);
