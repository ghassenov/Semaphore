/**
 * The two filesystem calls the screenshot tour needs.
 *
 * `cross-origin-delegation.ts` has no dependencies on purpose: it drives a
 * real browser over the DevTools Protocol using web APIs Node implements, so
 * it needs neither Playwright nor `@types/node`. Writing a screenshot to disk
 * is the one thing that reaches past the web platform, and declaring the two
 * functions it uses is a smaller price than pulling a type package in for
 * them. Kept in its own `.d.ts` because a file with a top-level import is a
 * module, and `declare module` inside one is an augmentation of something
 * that has to already exist.
 */
declare module "node:fs" {
  export function mkdirSync(path: string, options: { recursive: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}
