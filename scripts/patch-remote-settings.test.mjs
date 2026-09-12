import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchRemoteSettings } from './patch-remote-settings.mjs';

const gate = "  const persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory'";
const auth = `if (!isTrustedApiRequest(request, this.trustedHosts)) return 403
return this.browserAuth.isAuthenticated(request) ? undefined : 401`;

test('changes only the settings persistence gate', () => {
  const patched = patchRemoteSettings(`before\n${gate}\nafter`, auth);
  assert.ok(patched.startsWith('before\n'));
  assert.ok(patched.endsWith('\nafter'));
  assert.ok(patched.includes("const persistence = 'host' as const"));
  assert.ok(!patched.includes('isLoopback'));
});

test('rejects missing, changed, duplicated, or already patched source', () => {
  for (const source of ['', gate.replace('isLoopback', 'isTrusted'), `${gate}\n${gate}`, patchRemoteSettings(gate, auth)]) {
    assert.throws(() => patchRemoteSettings(source, auth), /exactly one upstream persistence gate/);
  }
});

test('requires both upstream authentication guards', () => {
  for (const source of ['', ...auth.split('\n')]) {
    assert.throws(() => patchRemoteSettings(gate, source), /upstream authentication changed/);
  }
});
