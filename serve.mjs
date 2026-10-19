import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('./', import.meta.url));
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.webm', 'video/webm'],
  ['.mp4', 'video/mp4'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
]);

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function requestError(status, message) {
  return Object.assign(new Error(message), { status });
}

/** Decode before resolving so encoded traversal never escapes the document root. */
export function resolveRequestPath(root, requestTarget) {
  let pathname;
  try {
    pathname = decodeURIComponent(String(requestTarget).split('?')[0]);
  } catch {
    throw requestError(400, 'Malformed URL');
  }
  if (!pathname.startsWith('/') || /[\\\0:]/u.test(pathname)) {
    throw requestError(400, 'Invalid path');
  }
  const segments = pathname.split('/');
  if (segments.some(segment => segment === '..' || segment.startsWith('.'))) {
    throw requestError(403, 'Forbidden');
  }
  const candidate = path.resolve(root, `.${pathname}`);
  if (!within(path.resolve(root), candidate)) throw requestError(403, 'Forbidden');
  return candidate;
}

export function createStaticServer({ root = PROJECT_ROOT } = {}) {
  const documentRoot = realpath(path.resolve(root));
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const fail = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : `${message}\n`);
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      fail(405, 'Method not allowed');
      return;
    }
    try {
      const base = await documentRoot;
      let file = resolveRequestPath(base, request.url);
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      // Real paths also prevent a symlink inside the root from exposing outside files.
      file = await realpath(file);
      if (!within(base, file)) throw requestError(403, 'Forbidden');
      const info = await stat(file);
      if (!info.isFile()) throw requestError(404, 'Not found');
      response.writeHead(200, {
        'Content-Type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
        'Content-Length': info.size,
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch (error) {
      const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR';
      fail(error.status || (missing ? 404 : 500), error.status ? error.message : missing ? 'Not found' : 'Server error');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
  } else {
    const server = createStaticServer();
    server.on('error', error => {
      console.error(`Unable to start local server: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`FLUX MOTION is ready at http://127.0.0.1:${port}`);
      console.log('Press Ctrl+C to stop.');
    });
  }
}
