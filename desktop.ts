const DOCS_ROOT = new URL('./docs/', import.meta.url);

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

new Deno.BrowserWindow({
  title: 'Sosyoku',
  width: 1280,
  height: 860,
});

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const filePath = resolveStaticPath(url.pathname);

  if (!filePath) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const body = request.method === 'HEAD' ? null : await Deno.readFile(filePath);
    return new Response(body, {
      headers: {
        'content-type': contentType(filePath.pathname),
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return new Response('Not found', { status: 404 });
    }
    throw error;
  }
});

function resolveStaticPath(pathname: string): URL | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const path = decoded === '/' ? '/index.html' : decoded;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '..' || segment.includes('\\'))) {
    return null;
  }

  return new URL(`.${path}`, DOCS_ROOT);
}

function contentType(pathname: string): string {
  const extension = pathname.match(/\.[^.\/]+$/)?.[0]?.toLowerCase();
  return extension ? CONTENT_TYPES[extension] ?? 'application/octet-stream' : 'application/octet-stream';
}
