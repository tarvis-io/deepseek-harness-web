import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';

// Run against a disposable test container with DSH_TRUSTED_HOSTS=dsh.test.
// Use a public-style Host header while connecting locally, like a reverse proxy.
const container = process.argv[2] || 'dsh';
const base = process.argv[3] || 'http://127.0.0.1:3080';
const host = 'dsh.test';
const logs = execFileSync('docker', ['logs', container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const token = [...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/\?token=([A-Za-z0-9_-]+)/g)].at(-1)?.[1];
assert.ok(token, 'startup login token must exist');

async function request(path, headers = {}, body) {
  // Node fetch can override Host; use HTTP directly to test the real fence.
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${base}${path}`, {
      signal: AbortSignal.timeout(15000),
      method: body ? 'POST' : 'GET',
      headers: { Host: host, ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: { get: key => {
          const value = res.headers[key];
          return Array.isArray(value) ? value[0] : value;
        } },
        json: async () => JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

const body = { type: 'client-request', rpcId: 'remote-settings-smoke', method: 'settings/describe', payload: { args: {} } };
assert.equal((await request('/api/settings/describe', {}, body)).status, 401, 'remote settings require login');
const login = await request(`/?token=${token}`);
assert.equal(login.status, 303, 'remote token login must redirect');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'remote login must set a session cookie');
const response = await request('/api/settings/describe', { Cookie: cookie }, body);
assert.equal(response.status, 200, 'authenticated remote settings must be reachable');
const result = (await response.json()).result;
assert.equal(result?.ok, true, `settings describe must succeed (${result?.error?.code ?? 'no error code'}: ${result?.error?.message ?? ''})`);
assert.equal(result.value?.writable, true, 'host settings must be writable');
assert.equal((await request('/api/settings/describe', { Cookie: cookie, Origin: 'https://untrusted.test' }, body)).status, 403, 'cross-origin requests must remain blocked');
assert.equal((await request('/api/settings/describe', { Cookie: cookie, Host: 'untrusted.test' }, body)).status, 403, 'untrusted hosts must remain blocked');
console.log('Remote settings API, login cookie, and Host/Origin protection verified');
