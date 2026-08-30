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

/**
 * `import.meta.dirname`, which Node has had since 20.11 and which the ES2022
 * library does not declare.
 *
 * Both programs in this directory write their results beside their own source
 * rather than beside whoever's shell started them. Anchoring to the module's
 * directory is what makes `pnpm ablation` correct from `bench/`, from the repo
 * root, and from anywhere else; resolving against the working directory meant
 * the package's own scripts wrote into `bench/bench/results` or could not find
 * the suite at all.
 */
interface ImportMeta {
  readonly dirname: string;
}
