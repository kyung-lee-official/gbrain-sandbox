/**
 * Copy sandbox demo markdown into the nested gbrain checkout.
 *
 * Source (tracked by monorepo): demos/gbrain-shared-source/
 * Target (nested gbrain git):   apps/gbrain/shared-source/
 *
 * Run from monorepo root: bun run inject:gbrain-demos
 */
import { $ } from "bun";
import { join, pathExists } from "./fs-path.ts";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const root = join(import.meta.dir, "..");
const sourceDir = join(root, "demos", "gbrain-shared-source");
const targetRoot = join(root, "apps", "gbrain");
const targetDir = join(targetRoot, "shared-source");

if (!(await pathExists(sourceDir))) {
  fail(`Demo source missing: ${sourceDir}`);
}

if (!(await pathExists(targetRoot))) {
  fail(
    `Missing ${targetRoot}. Clone or init the nested gbrain repo first (see docs/GBRAIN_SETUP.md).`,
  );
}

if (!(await pathExists(join(targetRoot, ".git")))) {
  fail(
    `${targetRoot} is not a git repository. Clone the knowledge repo into apps/gbrain (or git init there) — see docs/GBRAIN_SETUP.md.`,
  );
}

await $`mkdir -p ${targetDir}`.quiet();

const entries: string[] = [];
for await (const name of new Bun.Glob("*.md").scan({
  cwd: sourceDir,
  onlyFiles: true,
})) {
  entries.push(name);
}
entries.sort();

if (entries.length === 0) {
  fail(`No .md files in ${sourceDir}`);
}

for (const name of entries) {
  const from = join(sourceDir, name);
  const to = join(targetDir, name);
  await Bun.write(to, Bun.file(from));
  console.log(`copied ${name} → apps/gbrain/shared-source/${name}`);
}

const nestedGitignore = join(targetRoot, ".gitignore");
if (!(await Bun.file(nestedGitignore).exists())) {
  await Bun.write(
    nestedGitignore,
    "# Local gbrain CLI env (never commit)\n.env\n.env.local\n\n# Monorepo placeholder\n.gitkeep\n",
  );
  console.log("wrote apps/gbrain/.gitignore");
}

console.log(
  `\nInjected ${entries.length} demo page(s). Commit inside apps/gbrain if needed, then:\n` +
    `  cd apps/gbrain\n` +
    `  gbrain sync --source shared-source --repo ./shared-source --full --no-pull\n` +
    `  gbrain embed --stale`,
);
