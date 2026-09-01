/**
 * Asymmetry: prove that an agent's tool surface does not determine what only
 * the screen was meant to show.
 *
 * An agent's tool surface and a human's UI surface do not have to be the same
 * surface. Once they diverge on purpose - an agent that sees aggregates while
 * the screen shows rows, an agent scoped to less than the operator beside it -
 * somebody has to be able to check that the divergence is real. This is that
 * check, and it is a stronger one than grepping a response for a secret:
 * absence of a literal value is not absence of information.
 *
 * Tag your state by channel, say who perceives which channel, enumerate what
 * else the world could have been, and the kit answers in bits how much the
 * agent still has to be told.
 *
 * Extracted from Semaphore, where it is a build gate, a live meter and a
 * benchmark, all over one implementation.
 */

export { canonicalise, viewHash } from "./canonical.ts";
export {
  concealedFrom,
  invert,
  perceives,
  project,
  type PerceptionModel,
  type Tagged,
  type TaggedRecord,
  type Unwrapped,
} from "./perception.ts";
export {
  consistentWorlds,
  distinctActions,
  isUnderdetermined,
  measure,
  type Ambiguity,
  type Space,
} from "./worlds.ts";
export {
  audit,
  check,
  formatAudit,
  type Audit,
  type AuditRow,
  type Check,
  type Finding,
  type Subject,
} from "./report.ts";
