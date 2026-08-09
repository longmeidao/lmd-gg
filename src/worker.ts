/**
 * lmd.gg 后台 Worker：仅处理 `/api/*`，其余请求交给静态资源。
 * 负责 Access 鉴权、GitHub 内容写入和 R2 媒体上传。
 */

import {
  CONTENT_DIR,
  INVALID_PAYLOAD_ERRORS,
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

// Worker 再次验证 Access 签名，防止通过其他域名绕过边缘规则。

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

/** Access 公钥与请求无关，可安全跨请求缓存。 */
let cachedKeys: { at: number; keys: CryptoKey[] } | null = null;

const accessKeys = async (env: Env): Promise<CryptoKey[]> => {
  // 缓存一小时，在支持证书轮换的同时减少 JWKS 请求。
  if (cachedKeys && Date.now() - cachedKeys.at < 3600_000)
    return cachedKeys.keys;

  const response = await fetch(
    `${env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '')}/cdn-cgi/access/certs`,
  );
  if (!response.ok) {
    // 保留响应正文，便于定位 Access 配置错误。
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

/* GitHub 内容读写。 */

const githubHeaders = (env: Env) => ({
  authorization: `Bearer ${env.GITHUB_TOKEN}`,
  accept: 'application/vnd.github+json',
  'user-agent': 'lmd-gg-admin-worker',
  'x-github-api-version': '2022-11-28',
});

const contentsUrl = (env: Env, path: string) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

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

/** 返回已有文件的 SHA；文件不存在时返回 null。 */
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

/** 原子提交整批 Markdown，避免分支出现不完整串文。 */
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
    const exists = existingPaths.has(postRelativePath(item.slug));
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
          path: postRelativePath(item.slug),
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

/* 路由。 */

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
    const path = postRelativePath(slug);
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
    const path = postRelativePath(slug);
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
  return json(
    {
      saved: items.map((item) => item.slug),
      files: items.map((item) => postRelativePath(item.slug)),
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
  // R2 只保存原件，展示尺寸由 Image Transformations 生成。
  const key = `images/originals/${fileName}`;

  // 先检查 content-length，再将请求体直接流入 R2，避免整文件进入内存。
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
   * PNG 依次尝试无损 WebP 和 PNG8，照片使用限宽 WebP。
   * 仅采用格式正确且实际体积更小的候选，否则返回原件。
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
        // PNG 候选按质量排序，命中后不再尝试更低质量格式。
        break;
      }
    } catch (error) {
      // 转换探测失败时保留原件 URL。
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

    // 仅接管 API 路径。
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
        INVALID_PAYLOAD_ERRORS.includes(
          message as (typeof INVALID_PAYLOAD_ERRORS)[number],
        )
      ) {
        return json({ error: '发布内容或链接名称无效。' }, 400);
      }
      console.error(JSON.stringify({ event: 'admin_api_failed', message }));
      return json({ error: '后台操作失败。' }, 502);
    }

    return json({ error: '没有这个接口。' }, 404);
  },
};
