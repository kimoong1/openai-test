import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createStaticServer, resolveRequestPath } from './serve.mjs';

function get(port, target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: target, method }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('path resolution rejects encoded traversal, hidden files, and platform-specific escapes', () => {
  const root = path.resolve('safe-root');
  assert.equal(resolveRequestPath(root, '/app.js?v=1'), path.join(root, 'app.js'));
  for (const target of ['/../secret', '/%2e%2e/secret', '/a/%2e%2e/secret', '/.git/config']) {
    assert.throws(() => resolveRequestPath(root, target), { status: 403 });
  }
  for (const target of ['/%ZZ', '/%00', '/a%5c..%5csecret', '/C:%5csecret', 'https://example.com']) {
    assert.throws(() => resolveRequestPath(root, target), { status: 400 });
  }
});

test('HTTP server serves modules, handles HEAD, and rejects unsafe requests', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'flux-motion-test-'));
  const root = path.join(temporary, 'public');
  await mkdir(root);
  await writeFile(path.join(root, 'index.html'), '<h1>FLUX</h1>');
  await writeFile(path.join(root, 'app.js'), 'export const flux = 1;');
  const privateRoot = path.join(temporary, 'private');
  await mkdir(privateRoot);
  await writeFile(path.join(privateRoot, 'secret.txt'), 'private');
  const server = createStaticServer({ root });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const home = await get(port, '/?preset=test');
  assert.equal(home.status, 200);
  assert.equal(home.body, '<h1>FLUX</h1>');
  assert.match(home.headers['content-type'], /text\/html/u);
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  const module = await get(port, '/app.js');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /text\/javascript/u);
  const head = await get(port, '/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], module.headers['content-length']);
  assert.equal((await get(port, '/missing')).status, 404);
  assert.equal((await get(port, '/%2e%2e/secret.txt')).status, 403);
  assert.equal((await get(port, '/%00')).status, 400);
  const post = await get(port, '/', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');

  await t.test('symlink targets outside the document root are forbidden', async child => {
    try {
      await symlink(privateRoot, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') {
        child.skip('Creating symlinks requires an unavailable platform permission.');
        return;
      }
      throw error;
    }
    assert.equal((await get(port, '/escape/secret.txt')).status, 403);
  });
});
