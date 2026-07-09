import { serveDir } from '@std/http/file-server';

const port = Number(Deno.env.get('PORT') ?? 8000);

Deno.serve({ port }, (req) => {
  return serveDir(req, {
    fsRoot: 'docs',
    quiet: true,
  });
});

console.log(`Serving docs/ at http://localhost:${port}/`);
