import { $ } from "bun";

/** Small path helpers for Bun scripts (no node: imports). */

export function join(...parts: string[]): string {
  return parts
    .map((part, i) => {
      const cleaned = part.replaceAll("\\", "/");
      if (i === 0) return cleaned.replace(/\/+$/, "");
      return cleaned.replace(/^\/+|\/+$/g, "");
    })
    .filter((part) => part.length > 0)
    .join("/");
}

export async function pathExists(target: string): Promise<boolean> {
  if (await Bun.file(target).exists()) return true;
  const probe = await $`ls ${target}`.nothrow().quiet();
  return probe.exitCode === 0;
}
