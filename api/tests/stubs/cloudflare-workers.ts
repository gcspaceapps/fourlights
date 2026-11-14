// Stands in for the `cloudflare:workers` module, which only exists inside workerd, so the Durable
// Object class can be loaded and exercised in Node (see vitest.config.ts).
export class DurableObject {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
