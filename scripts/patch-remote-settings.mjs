import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const settingsPath = 'packages/client/ui-settings/src/client/index.ts';
const authPath = 'packages/client/connection/src/rpc-host.ts';
const original = "  const persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory'";
const replacement = `  // Tarvis container: remote operators use the authenticated Host settings API.
  // Keep the server's browser-cookie and Host/Origin checks intact.
  const persistence = 'host' as const`;

// Deliberately match the pinned upstream implementation exactly. An upstream
// ref upgrade must be reviewed rather than silently shipping a partial patch.
export function patchRemoteSettings(settings, auth) {
  for (const guard of [
    'if (!isTrustedApiRequest(request, this.trustedHosts)) return 403',
    'return this.browserAuth.isAuthenticated(request) ? undefined : 401',
  ]) {
    if (!auth.includes(guard)) {
      throw new Error('Remote settings: upstream authentication changed; review before building');
    }
  }
  if (settings.split(original).length !== 2) {
    throw new Error('Remote settings: expected exactly one upstream persistence gate; review before building');
  }
  return settings.replace(original, replacement);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node patch-remote-settings.mjs <upstream-source-root>');
  const target = resolve(root, settingsPath);
  const patched = patchRemoteSettings(readFileSync(target, 'utf8'), readFileSync(resolve(root, authPath), 'utf8'));
  writeFileSync(target, patched);
  console.log('Enabled authenticated remote Settings in the container build');
}
