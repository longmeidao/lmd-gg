declare module 'cloudflare:test' {
  // Cloudflare 的测试运行时通过空接口继承来合并 Wrangler 生成的 Env。
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
