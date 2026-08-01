/**
 * lmd.gg 的后台 Worker。
 *
 * 站点本身仍然是静态构建（`dist/`），这个 Worker 只接管 `/api/*` ——
 * 其余请求原样交给静态资源。做法和色览一致，见 wrangler.jsonc 的
 * `assets.run_worker_first`。
 *
 * 它只做静态站做不到的三件事：
 *   1. 保管密钥（GITHUB_TOKEN 绝不能出现在前端 JS 里）
 *   2. 校验身份（Cloudflare Access 签发的 JWT）
 *   3. 写仓库 / 传媒体（写进 git 后由 CI 重新构建部署）
 *
 * 内容依旧是 git 里的 markdown，没有数据库。
 */

/**
 * `Env` 由 `wrangler types` 从 wrangler.jsonc 生成（worker-configuration.d.ts），
 * 不手写 —— 手写的接口迟早和实际绑定对不上。改了绑定记得重跑一次。
 *
 * 绑定与变量：MEDIA(R2) / ASSETS / GITHUB_* / ACCESS_* / MEDIA_PUBLIC_URL
 */

import {
  CONTENT_DIR,
  MAX_UPLOAD_BYTES,
  makeUploadName,
  parseDraftSummary,
  postRelativePath,
  readWriteItems,
  type DraftSummary,
  type WriteItem,
  type WritePayload,
} from './domain/content-contract';

interface MediaCandidate {
  url: string;
  contentType: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/* ── Cloudflare Access ──────────────────────────────────────────────────
 * Access 在边缘就会拦掉未登录的请求，但 Worker 仍然自己验一遍签名：
 * 光靠边缘拦截的话，绕过自定义域名（比如走 workers.dev）就没人管了。
 */

interface AccessClaims {
  aud?: string[] | string;
  exp?: number;
  email?: string;
}

const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

interface CertsResponse {
  keys?: JsonWebKey[];
}

/**
 * JWKS 缓存。放模块级是有意的：Access 的公钥对所有请求都一样，不是请求态，
 * 跨请求复用不会串数据。（要避免的是把某个请求的数据存进全局。）
 */
let cachedKeys: { at: number; keys: CryptoKey[] } | null = null;

const accessKeys = async (env: Env): Promise<CryptoKey[]> => {
  // 证书会轮换，缓存一小时足够，也避免每个请求都去取一次
  if (cachedKeys && Date.now() - cachedKeys.at < 3600_000)
    return cachedKeys.keys;

  const response = await fetch(
    `${env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '')}/cdn-cgi/access/certs`,
  );
  if (!response.ok) {
    // 没这条日志的话，配错了只会看到 authenticated:false，无从查起
    console.error(
      JSON.stringify({
        event: 'access_certs_failed',
        status: response.status,
        teamDomain: env.ACCESS_TEAM_DOMAIN,
      }),
    );
    throw new Error('取 Access 证书失败');
  }
  const body = (await response.json()) as CertsResponse;

  const keys = await Promise.all(
    (body.keys ?? []).map((jwk) =>
      crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    ),
  );
  cachedKeys = { at: Date.now(), keys };
  return keys;
};

const readToken = (request: Request): string => {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = request.headers.get('cookie') ?? '';
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] ?? '';
};

const verifyAccess = async (request: Request, env: Env): Promise<boolean> => {
  if (
    env.ACCESS_AUD.includes('REPLACE-ME') ||
    env.ACCESS_TEAM_DOMAIN.includes('REPLACE-ME')
  ) {
    console.error(JSON.stringify({ event: 'access_not_configured' }));
    return false;
  }

  const token = readToken(request);
  if (!token) return false;

  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return false;

  const signed = new TextEncoder().encode(`${header}.${payload}`);
  const signatureBytes = base64UrlToBytes(signature);

  let verified = false;
  for (const key of await accessKeys(env)) {
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signatureBytes as BufferSource,
      signed as BufferSource,
    );
    if (ok) {
      verified = true;
      break;
    }
  }
  if (!verified) return false;

  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(payload)),
  ) as AccessClaims;

  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
    return false;
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return audience.includes(env.ACCESS_AUD);
};

/* ── GitHub 内容读写 ───────────────────────────────────────────────────── */

const githubHeaders = (env: Env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'lmd-gg-admin-worker',
  'x-github-api-version': '2022-11-28',
});

const contentsUrl = (env: Env, path: string) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

const postPath = (slug: string) => {
  return postRelativePath(slug);
};

const decodeContent = (base64: string): string =>
  new TextDecoder().decode(base64UrlToBytes(base64.replace(/\n/g, '')));

interface GithubContentEntry {
  type: 'file' | 'dir';
  path: string;
  name: string;
}

const githubDirectory = async (
  env: Env,
  directory: string,
): Promise<GithubContentEntry[]> => {
  const response = await fetch(
    `${contentsUrl(env, directory)}?ref=${encodeURIComponent(env.GITHUB_REF)}`,
    { headers: githubHeaders(env) },
  );
  if (!response.ok)
    throw new Error(`读取 ${directory} 失败：${response.status}`);
  return (await response.json()) as GithubContentEntry[];
};

const githubFile = async (env: Env, file: string): Promise<string> => {
  const response = await fetch(
    `${contentsUrl(env, file)}?ref=${encodeURIComponent(env.GITHUB_REF)}`,
    { headers: githubHeaders(env) },
  );
  if (!response.ok) throw new Error(`读取 ${file} 失败：${response.status}`);
  const body = (await response.json()) as { content?: string };
  return decodeContent(body.content ?? '');
};

const listMarkdownFiles = async (
  env: Env,
  directory = CONTENT_DIR,
): Promise<string[]> => {
  const entries = await githubDirectory(env, directory);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.type === 'dir') return listMarkdownFiles(env, entry.path);
      return /\.mdx?$/.test(entry.name) ? [entry.path] : [];
    }),
  );
  return nested.flat();
};

const listDrafts = async (env: Env): Promise<DraftSummary[]> => {
  const files = await listMarkdownFiles(env);
  const drafts = await Promise.all(
    files.map(async (file) => {
      const slug = file.slice(`${CONTENT_DIR}/`.length).replace(/\.mdx?$/, '');
      return parseDraftSummary(slug, await githubFile(env, file));
    }),
  );
  return drafts
    .filter((draft): draft is DraftSummary => draft !== null)
    .sort((left, right) => right.pubDate.localeCompare(left.pubDate));
};

/** 已存在就返回它的 sha（更新时必须带上），不存在返回 null */
const fileSha = async (env: Env, path: string): Promise<string | null> => {
  const response = await fetch(
    `${contentsUrl(env, path)}?ref=${encodeURIComponent(env.GITHUB_REF)}`,
    { headers: githubHeaders(env) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`读取 ${path} 失败：${response.status}`);
  const body = (await response.json()) as { sha?: string };
  return body.sha ?? null;
};

const gitUrl = (env: Env, path: string) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/git/${path}`;

const branchPath = (branch: string) =>
  branch.split('/').map(encodeURIComponent).join('/');

const githubJson = async <T>(
  env: Env,
  url: string,
  init?: RequestInit,
  request: typeof fetch = fetch,
): Promise<T> => {
  const response = await request(url, {
    ...init,
    headers: {
      ...githubHeaders(env),
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GITHUB_API:${response.status}`);
  }
  return (await response.json()) as T;
};

interface GitTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

/**
 * 一次提交整批 Markdown：先创建不可见的 blob/tree/commit，最后才移动分支指针。
 * 任一步失败都不会让线上分支只出现半条串文。
 */
export const commitFilesAtomically = async (
  env: Env,
  items: WriteItem[],
  defaultOperation: 'create' | 'update',
  request: typeof fetch = fetch,
) => {
  const ref = branchPath(env.GITHUB_REF);
  const refBody = await githubJson<{ object: { sha: string } }>(
    env,
    gitUrl(env, `ref/heads/${ref}`),
    undefined,
    request,
  );
  const baseCommitSha = refBody.object.sha;
  const commitBody = await githubJson<{ tree: { sha: string } }>(
    env,
    gitUrl(env, `commits/${baseCommitSha}`),
    undefined,
    request,
  );
  const baseTreeSha = commitBody.tree.sha;
  const treeBody = await githubJson<{
    tree: GitTreeEntry[];
    truncated?: boolean;
  }>(
    env,
    `${gitUrl(env, `trees/${baseTreeSha}`)}?recursive=1`,
    undefined,
    request,
  );
  if (treeBody.truncated) throw new Error('GITHUB_TREE_TRUNCATED');

  const existingPaths = new Set(
    treeBody.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path),
  );
  for (const item of items) {
    const exists = existingPaths.has(postPath(item.slug));
    const operation = item.operation ?? defaultOperation;
    if (operation === 'create' && exists) {
      throw new Error(`POST_EXISTS:${item.slug}`);
    }
    if (operation === 'update' && !exists) {
      throw new Error(`POST_MISSING:${item.slug}`);
    }
  }

  const blobs = await Promise.all(
    items.map((item) =>
      githubJson<{ sha: string }>(
        env,
        gitUrl(env, 'blobs'),
        {
          method: 'POST',
          body: JSON.stringify({ content: item.content, encoding: 'utf-8' }),
        },
        request,
      ),
    ),
  );
  const newTree = await githubJson<{ sha: string }>(
    env,
    gitUrl(env, 'trees'),
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: items.map((item, index) => ({
          path: postPath(item.slug),
          mode: '100644',
          type: 'blob',
          sha: blobs[index]!.sha,
        })),
      }),
    },
    request,
  );
  const label = items.length === 1 ? items[0]!.slug : `${items.length} posts`;
  const newCommit = await githubJson<{ sha: string }>(
    env,
    gitUrl(env, 'commits'),
    {
      method: 'POST',
      body: JSON.stringify({
        message: `docs: publish ${label}`,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    },
    request,
  );

  const updateResponse = await request(gitUrl(env, `refs/heads/${ref}`), {
    method: 'PATCH',
    headers: { ...githubHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (updateResponse.status === 409 || updateResponse.status === 422) {
    throw new Error('BRANCH_CHANGED');
  }
  if (!updateResponse.ok) {
    throw new Error(`GITHUB_API:${updateResponse.status}`);
  }
};

/* ── 路由 ──────────────────────────────────────────────────────────────── */

const handlePosts = async (
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> => {
  if (request.method === 'GET') {
    if (url.searchParams.get('view') === 'drafts') {
      return json({ drafts: await listDrafts(env) });
    }
    const slug = url.searchParams.get('slug')?.trim() ?? '';
    const path = postPath(slug);
    const response = await fetch(
      `${contentsUrl(env, path)}?ref=${encodeURIComponent(env.GITHUB_REF)}`,
      { headers: githubHeaders(env) },
    );
    if (response.status === 404) return json({ error: '文章不存在。' }, 404);
    if (!response.ok) return json({ error: '读取失败。' }, 502);
    const body = (await response.json()) as { content?: string };
    return json({
      slug,
      content: decodeContent(body.content ?? ''),
      file: path,
    });
  }

  if (request.method === 'DELETE') {
    const slug = url.searchParams.get('slug')?.trim() ?? '';
    const path = postPath(slug);
    const sha = await fileSha(env, path);
    if (!sha) return json({ error: '文章不存在。' }, 404);
    const response = await fetch(contentsUrl(env, path), {
      method: 'DELETE',
      headers: { ...githubHeaders(env), 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `docs: remove ${slug}`,
        sha,
        branch: env.GITHUB_REF,
      }),
    });
    if (!response.ok) return json({ error: '删除失败。' }, 502);
    return json({ deleted: slug });
  }

  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: '只接受 GET、POST、PUT 或 DELETE 请求。' }, 405);
  }

  const items = readWriteItems((await request.json()) as WritePayload);

  await commitFilesAtomically(
    env,
    items,
    request.method === 'POST' ? 'create' : 'update',
  );
  // POST 表示新建，回 201；PUT 是保存，回 200
  return json(
    {
      saved: items.map((item) => item.slug),
      files: items.map((item) => postPath(item.slug)),
      urls: items.map((item) => `/${item.slug}`),
    },
    request.method === 'POST' ? 201 : 200,
  );
};

const handleUpload = async (
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: '只接受 POST 请求。' }, 405);
  }
  const fileName = makeUploadName(url.searchParams.get('name') ?? 'file');
  // 只存原件。展示尺寸由 Cloudflare Image Transformations 现场生成，
  // 所以这里不压缩也不生成变体（Worker 里也跑不了图像处理库）。
  const key = `images/originals/${fileName}`;

  // 先按 content-length 判断，再把 body 直接流给 R2。
  // `await request.arrayBuffer()` 会把整个文件读进内存，大文件直接把 Worker 撑爆。
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared <= 0) {
    return json({ error: '没有收到文件内容。' }, 400);
  }
  if (declared > MAX_UPLOAD_BYTES) return json({ error: '文件过大。' }, 413);
  if (!request.body) return json({ error: '没有收到文件内容。' }, 400);

  await env.MEDIA.put(key, request.body, {
    httpMetadata: {
      contentType:
        request.headers.get('content-type') || 'application/octet-stream',
    },
  });

  const origin = env.MEDIA_PUBLIC_URL.replace(/\/$/, '');
  const original = `${origin}/${key}`;
  const contentType = (
    request.headers.get('content-type') || 'application/octet-stream'
  )
    .split(';', 1)[0]
    .toLowerCase();

  /**
   * 不再把所有图片固定缩成 1200px WebP q92：截图文字会糊，已经量化过的
   * PNG 还可能越转越大。PNG 先试原尺寸无损 WebP，再试原尺寸 PNG8；照片
   * 才使用限宽的有损 WebP。每个候选都以真实响应的格式和 Content-Length
   * 为准，只有确实更小才采用，否则返回原件。
   */
  const candidates: MediaCandidate[] =
    contentType === 'image/png'
      ? [
          {
            url: `${origin}/cdn-cgi/image/format=webp,quality=100,onerror=redirect/${key}`,
            contentType: 'image/webp',
          },
          {
            url: `${origin}/cdn-cgi/image/format=png,quality=85,onerror=redirect/${key}`,
            contentType: 'image/png',
          },
        ]
      : ['image/jpeg', 'image/webp'].includes(contentType)
        ? [
            {
              url: `${origin}/cdn-cgi/image/width=1200,fit=scale-down,quality=92,format=webp,onerror=redirect/${key}`,
              contentType: 'image/webp',
            },
          ]
        : [];

  let selectedUrl = original;
  let selectedBytes = declared;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        headers: {
          accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        },
      });
      const transformedType = (response.headers.get('content-type') ?? '')
        .split(';', 1)[0]
        .toLowerCase();
      let transformedBytes = Number(response.headers.get('content-length'));
      if (!Number.isFinite(transformedBytes) || transformedBytes <= 0) {
        transformedBytes = (await response.arrayBuffer()).byteLength;
      } else {
        await response.body?.cancel();
      }
      if (
        response.ok &&
        transformedType === candidate.contentType &&
        Number.isFinite(transformedBytes) &&
        transformedBytes > 0 &&
        transformedBytes < declared
      ) {
        selectedUrl = candidate.url;
        selectedBytes = transformedBytes;
        // PNG 候选按质量排序：无损 WebP 可用时，不再为了少几个字节降级到 PNG8。
        break;
      }
    } catch (error) {
      // 压缩探测失败不能让上传失败；保留原件 URL 即可。
      console.warn(
        JSON.stringify({
          event: 'media_candidate_probe_failed',
          key,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return json(
    {
      url: selectedUrl,
      original,
      bytes: declared,
      servedBytes: selectedBytes,
    },
    201,
  );
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // run_worker_first 只挂了 /api/*，这里再兜一层
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const authenticated = await verifyAccess(request, env).catch(() => false);

    if (url.pathname === '/api/admin/session') {
      return json({ authenticated });
    }
    if (!authenticated) return json({ error: '未登录。' }, 401);

    try {
      if (url.pathname === '/api/admin/posts') {
        return await handlePosts(request, env, url);
      }
      if (url.pathname === '/api/admin/upload') {
        return await handleUpload(request, env, url);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '操作失败。';
      if (message.startsWith('POST_EXISTS:')) {
        return json({ error: `${message.slice(12)} 已存在。` }, 409);
      }
      if (message.startsWith('POST_MISSING:')) {
        return json({ error: `${message.slice(13)} 不存在。` }, 404);
      }
      if (message === 'BRANCH_CHANGED') {
        return json({ error: '仓库刚刚发生变化，请重新发布。' }, 409);
      }
      if (
        [
          'INVALID_SLUG',
          'INVALID_CONTENT',
          'INVALID_ITEM_COUNT',
          'INVALID_OPERATION',
          'DUPLICATE_SLUG',
        ].includes(message)
      ) {
        return json({ error: '发布内容或链接名称无效。' }, 400);
      }
      console.error(JSON.stringify({ event: 'admin_api_failed', message }));
      return json({ error: '后台操作失败。' }, 502);
    }

    return json({ error: '没有这个接口。' }, 404);
  },
};
