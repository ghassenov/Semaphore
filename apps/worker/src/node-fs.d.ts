/**
 * The three filesystem calls this directory's tests reach past the web platform
 * for.
 *
 * Same arrangement, and the same reason, as `tests/node-fs.d.ts` and
 * `bench/node-fs.d.ts`: the worker itself has no Node dependency and its
 * tsconfig deliberately carries only `@cloudflare/workers-types`, so declaring
 * the handful of functions one test reaches for is a smaller price than pulling
 * `@types/node` into a package that must not accidentally use it.
 *
 * Only `Session.test.ts` uses these, and only to read the migration SQL and its
 * own source, because the thing it checks is that those two files agree.
 */
declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function readdirSync(path: string): string[];
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

/**
 * `import.meta.dirname`, which Node has had since 20.11 and which the ES2022
 * library does not declare. The test anchors to its own directory so it finds
 * `migrations/` from any working directory.
 */
interface ImportMeta {
  readonly dirname: string;
}
