import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import worker, { commitFilesAtomically } from '../src/worker';

describe('admin worker', () => {
  it('reports an unauthenticated session without contacting GitHub', async () => {
    const response = await worker.fetch(
      new Request('https://lmd.gg/api/admin/session'),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it('rejects protected routes without an Access token', async () => {
    const response = await worker.fetch(
      new Request('https://lmd.gg/api/admin/posts?view=drafts'),
      env,
    );
    expect(response.status).toBe(401);
  });

  it('publishes mixed create and update items with one branch move', async () => {
    let blobIndex = 0;
    const request = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/git/ref/heads/main')) {
          return Response.json({ object: { sha: 'commit-base' } });
        }
        if (url.endsWith('/git/commits/commit-base')) {
          return Response.json({ tree: { sha: 'tree-base' } });
        }
        if (url.endsWith('/git/trees/tree-base?recursive=1')) {
          return Response.json({
            tree: [
              {
                path: 'src/content/post/reply-target.md',
                type: 'blob',
                sha: 'blob-old',
              },
            ],
          });
        }
        if (url.endsWith('/git/blobs')) {
          blobIndex += 1;
          return Response.json({ sha: `blob-${blobIndex}` });
        }
        if (url.endsWith('/git/trees') && init?.method === 'POST') {
          return Response.json({ sha: 'tree-new' });
        }
        if (url.endsWith('/git/commits') && init?.method === 'POST') {
          return Response.json({ sha: 'commit-new' });
        }
        if (url.endsWith('/git/refs/heads/main') && init?.method === 'PATCH') {
          return Response.json({ object: { sha: 'commit-new' } });
        }
        return new Response(null, { status: 404 });
      },
    );

    await commitFilesAtomically(
      env,
      [
        {
          slug: 'new-reply',
          content: '---\npubDate: 2026-08-01\n---\n',
        },
        {
          slug: 'reply-target',
          content: '---\npubDate: 2026-08-01\nthread: "thread-1"\n---\n',
          operation: 'update',
        },
      ],
      'create',
      request as unknown as typeof fetch,
    );

    const calls = request.mock.calls;
    expect(
      calls.filter(([url]) => String(url).endsWith('/git/blobs')),
    ).toHaveLength(2);
    expect(
      calls.filter(
        ([url, init]) =>
          String(url).endsWith('/git/refs/heads/main') &&
          init?.method === 'PATCH',
      ),
    ).toHaveLength(1);
  });
});
