/**
 * The handful of Node symbols the CLI reaches past the web platform for.
 *
 * Same arrangement, and same reason, as `bench/node-fs.d.ts` and
 * `tests/node-fs.d.ts`: this package has no runtime dependencies, and
 * declaring the four things its command-line entry point needs is a smaller
 * price than pulling `@types/node` in for them - which matters more here than
 * elsewhere, because this package is the one meant to be picked up by somebody
 * else's project.
 *
 * Kept in its own `.d.ts` because a file with a top-level import is a module,
 * and `declare module` inside one augments something that must already exist.
 */
declare module "node:url" {
  export function pathToFileURL(path: string): { readonly href: string };
}

declare module "node:path" {
  export function resolve(...segments: string[]): string;
}

declare const process: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  exitCode: number;
  readonly stdout: { write(text: string): void };
  readonly stderr: { write(text: string): void };
};
