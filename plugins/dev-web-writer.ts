import {
  access,
  mkdir,
  readFile,
  rename,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  MAX_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
  makeUploadName,
  parseDraftSummary,
  postRelativePath,
  readWriteItems,
  type DraftSummary,
  type WritePayload,
} from '../src/domain/content-contract';

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

function postPath(contentDirectory: string, slug: string): string {
  const filePath = path.resolve(process.cwd(), postRelativePath(slug));
  if (!filePath.startsWith(`${contentDirectory}${path.sep}`)) {
    throw new Error('INVALID_PATH');
  }
  return filePath;
}

async function listDrafts(
  contentDirectory: string,
  directory = contentDirectory,
): Promise<DraftSummary[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return listDrafts(contentDirectory, file);
      if (!/\.mdx?$/.test(entry.name)) return [];
      const slug = path
        .relative(contentDirectory, file)
        .replace(/\\/g, '/')
        .replace(/\.mdx?$/, '');
      const draft = parseDraftSummary(slug, await readFile(file, 'utf8'));
      return draft ? [draft] : [];
    }),
  );
  return nested
    .flat()
    .sort((left, right) => right.pubDate.localeCompare(left.pubDate));
}

/** 本地专用写作 API；仅注入 Vite 开发服务器，固定绕过生产鉴权。 */
export function devWebWriter(): Plugin {
  return {
    name: 'lmd-dev-web-writer',
    configureServer(server) {
      const contentDirectory = path.resolve(process.cwd(), 'src/content/post');

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');

        /** 媒体上传（dev 专用）：原样写入 public/media/uploads/。 */
        if (url.pathname === '/__lmd/upload') {
          if (request.method !== 'POST') {
            respond(response, 405, { error: '只接受 POST 请求。' });
            return;
          }
          try {
            const declared = Number(request.headers['content-length'] ?? '0');
            if (!Number.isFinite(declared) || declared <= 0) {
              respond(response, 400, { error: '没有收到文件内容。' });
              return;
            }
            if (declared > MAX_UPLOAD_BYTES) {
              respond(response, 413, { error: '文件过大。' });
              return;
            }
            const fileName = makeUploadName(
              url.searchParams.get('name') ?? 'file',
            );

            const uploadDirectory = path.resolve(
              process.cwd(),
              'public/media/uploads',
            );
            await mkdir(uploadDirectory, { recursive: true });

            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
              const buffer = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk);
              size += buffer.length;
              if (size > MAX_UPLOAD_BYTES) throw new Error('UPLOAD_TOO_LARGE');
              chunks.push(buffer);
            }
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
            const tooLarge =
              error instanceof Error && error.message === 'UPLOAD_TOO_LARGE';
            respond(response, tooLarge ? 413 : 500, {
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
          respond(response, 200, { authenticated: true });
          return;
        }

        if (url.pathname !== '/__lmd/write') {
          next();
          return;
        }
        try {
          if (request.method === 'GET') {
            if (url.searchParams.get('view') === 'drafts') {
              respond(response, 200, {
                drafts: await listDrafts(contentDirectory),
              });
              return;
            }
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

          const payload = JSON.parse(
            await readRequestBody(request),
          ) as WritePayload;
          const items = readWriteItems(payload);
          await mkdir(contentDirectory, { recursive: true });
          const paths = items.map((item) =>
            postPath(contentDirectory, item.slug),
          );

          const operations = items.map(
            (item) =>
              item.operation ??
              (request.method === 'POST' ? 'create' : 'update'),
          );
          const originals = new Map<string, string>();
          for (const [index, filePath] of paths.entries()) {
            const exists = await access(filePath)
              .then(() => true)
              .catch((error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') return false;
                throw error;
              });
            if (operations[index] === 'create' && exists) {
              throw new Error(`POST_EXISTS:${items[index]!.slug}`);
            }
            if (operations[index] === 'update' && !exists) {
              throw new Error(`POST_MISSING:${items[index]!.slug}`);
            }
            if (exists)
              originals.set(filePath, await readFile(filePath, 'utf8'));
          }

          const tempPaths = paths.map(
            (filePath) => `${filePath}.${randomUUID()}.tmp`,
          );
          const committed: number[] = [];
          try {
            for (const [index, item] of items.entries()) {
              await mkdir(path.dirname(paths[index]!), { recursive: true });
              await writeFile(tempPaths[index]!, item.content, {
                encoding: 'utf8',
                flag: 'wx',
              });
            }
            for (const [index, tempPath] of tempPaths.entries()) {
              await rename(tempPath, paths[index]!);
              committed.push(index);
            }
          } catch (error) {
            await Promise.allSettled(
              tempPaths.map((filePath) => unlink(filePath)),
            );
            await Promise.all(
              committed.map(async (index) => {
                const filePath = paths[index]!;
                const original = originals.get(filePath);
                if (original === undefined) await unlink(filePath);
                else await writeFile(filePath, original, 'utf8');
              }),
            );
            throw error;
          }

          respond(response, request.method === 'POST' ? 201 : 200, {
            saved: items.map((item) => item.slug),
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
          if (code === 'EEXIST' || message.startsWith('POST_EXISTS:')) {
            respond(response, 409, {
              error: '同名内容已经存在，请换一个链接名称。',
            });
            return;
          }
          if (message.startsWith('POST_MISSING:')) {
            respond(response, 404, { error: '没有找到这篇内容。' });
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
              'INVALID_OPERATION',
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
