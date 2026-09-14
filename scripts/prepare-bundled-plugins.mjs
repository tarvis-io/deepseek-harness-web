import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [workspaceGitDir] = process.argv.slice(2);
if (!workspaceGitDir) {
  throw new Error("usage: prepare-bundled-plugins.mjs WORKSPACE_GIT_DIR");
}

async function replaceRequired(path, before, after) {
  const source = await readFile(path, "utf8");
  if (!source.includes(before)) throw new Error(`expected source text missing from ${path}`);
  await writeFile(path, source.replace(before, after));
}

const workspaceIndex = join(workspaceGitDir, "lib/index.js");
await replaceRequired(
  workspaceIndex,
  'import { settingsNamespace } from "@deepseek-ai/dsh-settings";\n',
  "",
);
await replaceRequired(
  workspaceIndex,
  'const SETTINGS_NAMESPACE = settingsNamespace("workspace-git");',
  'const SETTINGS_NAMESPACE = "workspace-git";',
);
