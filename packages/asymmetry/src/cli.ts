#!/usr/bin/env -S node --experimental-strip-types
/**
 * `asymmetry <module>` - audit one application and say what its agent could
 * work out on its own.
 *
 * The module is any file whose default export is a `Subject`: a perception
 * model, and one or more surfaces bundled with the states to examine. The
 * exit code is the point - non-zero when anything was found - so this is a CI
 * gate rather than a report somebody has to remember to read.
 *
 * Run the worked example with:
 *
 *     node --experimental-strip-types src/cli.ts examples/support-console.ts
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { audit, formatAudit, type Subject } from "./index.ts";

async function main(argv: readonly string[]): Promise<number> {
  const target = argv[0];
  if (!target || target === "--help" || target === "-h") {
    process.stdout.write(usage());
    return target ? 0 : 2;
  }

  const loaded = (await import(pathToFileURL(resolve(target)).href)) as { default?: unknown };
  const subject = loaded.default;
  if (!isSubject(subject)) {
    process.stderr.write(
      `${target} does not default-export a Subject.\n` +
        `Expected an object with { name, model, checks }. See examples/support-console.ts.\n`,
    );
    return 2;
  }

  const result = audit(subject);
  process.stdout.write(`${formatAudit(result)}\n`);
  return result.findings.length === 0 ? 0 : 1;
}

/**
 * A structural check rather than a cast.
 *
 * The module being loaded is arbitrary user code, and the failure this guards
 * against - a typo in an export, a module that throws before it exports - is
 * far better reported as one sentence naming the file than as a `TypeError`
 * from inside the audit two frames later.
 */
function isSubject(value: unknown): value is Subject {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Subject>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.model === "object" &&
    candidate.model !== null &&
    Array.isArray(candidate.checks)
  );
}

function usage(): string {
  return [
    "asymmetry <module>",
    "",
    "Audit a divided interface: prove that each party's view does not determine",
    "what the other party was supposed to supply, and report the gap in bits.",
    "",
    "<module>  a file default-exporting a Subject { name, model, checks }.",
    "",
    "Exits 0 when every surface is underdetermined for every party, 1 when",
    "anything was found, 2 on a usage error.",
    "",
  ].join("\n");
}

process.exitCode = await main(process.argv.slice(2));
