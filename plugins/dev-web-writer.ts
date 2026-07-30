import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const MAX_REQUEST_BYTES = 2_000_000;
const MAX_POST_BYTES = 800_000;
const MAX_THREAD_ITEMS = 24;
const SLUG_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

interface WriteItem {
  slug: string;
  content: string;
}

function respond(
  response: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function isAuthorized(request: IncomingMessage): boolean {
  const expectedSecret = process.env.LMD_ADMIN_SECRET?.trim();
  if (!expectedSecret) return true;

  const authorization = request.headers.authorization ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  return safeEqual(suppliedSecret, expectedSecret);
}

function requireAuthorized(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (isAuthorized(request)) return true;
  respond(response, 401, { error: '访问密钥不正确。' });
  return false;
}

function postPath(contentDirectory: string, slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('INVALID_SLUG');
  }

  const filePath = path.resolve(contentDirectory, `${slug}.md`);
  if (!filePath.startsWith(`${contentDirectory}${path.sep}`)) {
    throw new Error('INVALID_PATH');
  }
  return filePath;
}

function validateItems(items: WriteItem[]): void {
  if (items.length === 0 || items.length > MAX_THREAD_ITEMS) {
    throw new Error('INVALID_ITEM_COUNT');
  }

  const slugs = new Set<string>();
  for (const item of items) {
    if (!SLUG_PATTERN.test(item.slug)) throw new Error('INVALID_SLUG');
    if (
      !item.content.startsWith('---\n') ||
      item.content.length > MAX_POST_BYTES
    ) {
      throw new Error('INVALID_CONTENT');
    }
    if (slugs.has(item.slug)) throw new Error('DUPLICATE_SLUG');
    slugs.add(item.slug);
  }
}

/**
 * Authenticated local writing API used by /write during `pnpm dev`.
 *
 * Set LMD_ADMIN_SECRET to exercise the same Bearer-token flow planned for the
 * Cloudflare Worker. Without it, localhost is treated as an authenticated
 * development session. None of these endpoints are included in a static build.
 */
export function devWebWriter(): Plugin {
  return {
    name: 'lmd-dev-web-writer',
    configureServer(server) {
      const contentDirectory = path.resolve(process.cwd(), 'src/content/post');

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        /**
         * 媒体上传（dev 专用）：把二进制原样写进 public/media/uploads/。
         * 生产环境的媒体链路还在 Cloudflare 待迁移清单里（见 CLAUDE.md），
         * 所以这里只解决本地撰写，接口形状先对齐将来的 /api/admin/upload。
         */
        if (url.pathname === '/__lmd/upload') {
          if (!requireAuthorized(request, response)) return;
          if (request.method !== 'POST') {
            respond(response, 405, { error: '只接受 POST 请求。' });
            return;
          }
          try {
            const rawName = url.searchParams.get('name') ?? 'file';
            // 只保留安全字符，避免路径穿越
            const safeBase = path
              .basename(rawName)
              .replace(/[^\w.-]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .slice(0, 80);
            const extension = path.extname(safeBase);
            const stem = path.basename(safeBase, extension) || 'file';
            const stamp = new Date()
              .toISOString()
              .replace(/[-:]/g, '')
              .slice(0, 15);
            const fileName = `${stamp}-${stem}${extension}`;

            const uploadDirectory = path.resolve(
              process.cwd(),
              'public/media/uploads',
            );
            await mkdir(uploadDirectory, { recursive: true });

            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(chunk as Buffer);
            const bytes = Buffer.concat(chunks);
            if (bytes.byteLength === 0) {
              respond(response, 400, { error: '没有收到文件内容。' });
              return;
            }
            await writeFile(path.join(uploadDirectory, fileName), bytes);
            respond(response, 201, {
              url: `/media/uploads/${fileName}`,
              bytes: bytes.byteLength,
            });
          } catch (error) {
            respond(response, 500, {
              error: error instanceof Error ? error.message : '上传失败。',
            });
          }
          return;
        }

        if (url.pathname === '/__lmd/session') {
          if (request.method !== 'GET') {
            respond(response, 405, { error: '只接受 GET 请求。' });
            return;
          }
          respond(response, 200, { authenticated: isAuthorized(request) });
          return;
        }

        if (url.pathname !== '/__lmd/write') {
          next();
          return;
        }
        if (!requireAuthorized(request, response)) return;

        try {
          if (request.method === 'GET') {
            const slug = url.searchParams.get('slug')?.trim() ?? '';
            const filePath = postPath(contentDirectory, slug);
            const content = await readFile(filePath, 'utf8');
            respond(response, 200, {
              slug,
              content,
              file: `src/content/post/${slug}.md`,
            });
            return;
          }

          if (request.method === 'DELETE') {
            const slug = url.searchParams.get('slug')?.trim() ?? '';
            await unlink(postPath(contentDirectory, slug));
            respond(response, 200, { deleted: slug });
            return;
          }

          if (request.method !== 'POST' && request.method !== 'PUT') {
            respond(response, 405, {
              error: '只接受 GET、POST、PUT 或 DELETE 请求。',
            });
            return;
          }

          const payload = JSON.parse(await readRequestBody(request)) as {
            slug?: unknown;
            content?: unknown;
            posts?: unknown;
          };
          const legacyItem =
            typeof payload.slug === 'string' &&
            typeof payload.content === 'string'
              ? [{ slug: payload.slug.trim(), content: payload.content }]
              : [];
          const items = Array.isArray(payload.posts)
            ? payload.posts
                .filter(
                  (item): item is { slug: string; content: string } =>
                    typeof item === 'object' &&
                    item !== null &&
                    typeof (item as { slug?: unknown }).slug === 'string' &&
                    typeof (item as { content?: unknown }).content === 'string',
                )
                .map((item) => ({
                  slug: item.slug.trim(),
                  content: item.content,
                }))
            : legacyItem;

          validateItems(items);
          await mkdir(contentDirectory, { recursive: true });
          const paths = items.map((item) =>
            postPath(contentDirectory, item.slug),
          );

          if (request.method === 'POST') {
            for (const filePath of paths) {
              await access(filePath)
                .then(() => {
                  throw new Error('POST_EXISTS');
                })
                .catch((error: NodeJS.ErrnoException) => {
                  if (error.message === 'POST_EXISTS') throw error;
                  if (error.code !== 'ENOENT') throw error;
                });
            }
          } else if (items.length !== 1) {
            throw new Error('UPDATE_ONE_ONLY');
          }

          for (const [index, item] of items.entries()) {
            await writeFile(paths[index]!, item.content, {
              encoding: 'utf8',
              flag: request.method === 'POST' ? 'wx' : 'w',
            });
          }

          respond(response, request.method === 'POST' ? 201 : 200, {
            files: items.map((item) => `src/content/post/${item.slug}.md`),
            urls: items.map((item) => `/${item.slug}`),
          });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          const message = error instanceof Error ? error.message : '';

          if (code === 'ENOENT') {
            respond(response, 404, { error: '没有找到这篇内容。' });
            return;
          }
          if (code === 'EEXIST' || message === 'POST_EXISTS') {
            respond(response, 409, {
              error: '同名内容已经存在，请换一个链接名称。',
            });
            return;
          }
          if (message === 'REQUEST_TOO_LARGE') {
            respond(response, 413, { error: '请求内容过大。' });
            return;
          }
          if (
            [
              'INVALID_SLUG',
              'INVALID_PATH',
              'INVALID_CONTENT',
              'INVALID_ITEM_COUNT',
              'DUPLICATE_SLUG',
              'UPDATE_ONE_ONLY',
            ].includes(message)
          ) {
            respond(response, 400, { error: '发布内容或链接名称无效。' });
            return;
          }

          respond(response, 400, { error: '无法解析或写入这些内容。' });
        }
      });
    },
  };
}
