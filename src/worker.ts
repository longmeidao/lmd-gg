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

const CONTENT_DIR = 'src/content/post';
/** 和 dev 端一致：只允许小写字母、数字、连字符和一层子目录 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const MAX_POST_BYTES = 256 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
  if (cachedKeys && Date.now() - cachedKeys.at < 3600_000) return cachedKeys.keys;

  const response = await fetch(
    `${env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '')}/cdn-cgi/access/certs`,
  );
  if (!response.ok) throw new Error('取 Access 证书失败');
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
  if (!SLUG_PATTERN.test(slug)) throw new Error('INVALID_SLUG');
  return `${CONTENT_DIR}/${slug}.md`;
};

const encodeContent = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const decodeContent = (base64: string): string =>
  new TextDecoder().decode(base64UrlToBytes(base64.replace(/\n/g, '')));

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

const putFile = async (
  env: Env,
  path: string,
  content: string,
  message: string,
  sha: string | null,
) => {
  const response = await fetch(contentsUrl(env, path), {
    method: 'PUT',
    headers: { ...githubHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeContent(content),
      branch: env.GITHUB_REF,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`写入 ${path} 失败：${response.status}`);
  }
};

/* ── 路由 ──────────────────────────────────────────────────────────────── */

interface PostItem {
  slug: string;
  content: string;
}

const readItems = (payload: {
  slug?: unknown;
  content?: unknown;
  posts?: unknown;
}): PostItem[] => {
  const legacy =
    typeof payload.slug === 'string' && typeof payload.content === 'string'
      ? [{ slug: payload.slug.trim(), content: payload.content }]
      : [];
  const items = Array.isArray(payload.posts)
    ? payload.posts
        .filter(
          (item): item is PostItem =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as PostItem).slug === 'string' &&
            typeof (item as PostItem).content === 'string',
        )
        .map((item) => ({ slug: item.slug.trim(), content: item.content }))
    : legacy;

  if (items.length === 0) throw new Error('没有要保存的内容。');
  const seen = new Set<string>();
  items.forEach((item) => {
    if (!SLUG_PATTERN.test(item.slug)) throw new Error('INVALID_SLUG');
    if (!item.content.startsWith('---\n')) throw new Error('缺少 frontmatter。');
    if (item.content.length > MAX_POST_BYTES) throw new Error('内容过大。');
    if (seen.has(item.slug)) throw new Error('DUPLICATE_SLUG');
    seen.add(item.slug);
  });
  return items;
};

const handlePosts = async (
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> => {
  if (request.method === 'GET') {
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

  const items = readItems(
    (await request.json()) as { slug?: unknown; content?: unknown; posts?: unknown },
  );

  // GitHub 的 contents API 一次只能改一个文件，串文就是几条几次提交
  for (const item of items) {
    const path = postPath(item.slug);
    const sha = await fileSha(env, path);
    if (request.method === 'POST' && sha) {
      return json({ error: `${item.slug} 已存在。` }, 409);
    }
    await putFile(
      env,
      path,
      item.content,
      `${sha ? 'docs: update' : 'docs: add'} ${item.slug}`,
      sha,
    );
  }
  // POST 表示新建，回 201；PUT 是保存，回 200
  return json(
    { saved: items.map((item) => item.slug) },
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
  const rawName = url.searchParams.get('name') ?? 'file';
  const safeBase = rawName
    .split(/[\\/]/)
    .pop()!
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const dot = safeBase.lastIndexOf('.');
  const extension = dot > 0 ? safeBase.slice(dot) : '';
  const stem = (dot > 0 ? safeBase.slice(0, dot) : safeBase) || 'file';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const key = `uploads/${stamp}-${stem}${extension}`;

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

  return json(
    { url: `${env.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${key}`, bytes: declared },
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
      const status = message === 'INVALID_SLUG' ? 400 : 500;
      return json({ error: message }, status);
    }

    return json({ error: '没有这个接口。' }, 404);
  },
};
