/**
 * The three filesystem calls this directory reaches past the web platform for.
 *
 * Same arrangement, and same reason, as `tests/node-fs.d.ts`: this directory
 * has no runtime dependencies, and declaring the two functions it reaches past
 * the web platform for is a smaller price than pulling `@types/node` in for
 * them. Kept in its own `.d.ts` because a file with a top-level import is a
 * module, and `declare module` inside one augments something that must already
 * exist.
 */
declare module "node:fs" {
  export function mkdirSync(path: string, options: { recursive: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function readFileSync(path: string, encoding: string): string;
}
