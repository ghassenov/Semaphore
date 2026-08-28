/**
 * The two document tools, declared once for the two origins that can serve
 * them.
 *
 * `read_manual` and `read_station_log` are the station's *document* tools:
 * they read pages and logs rather than moving anything. Doc 03 section 7 puts
 * them on a second origin, `apps/archive`, reached over
 * `<iframe allow="tools">` plus `exposedTo`. That path is the default only
 * once both target browsers have been verified, so the single-origin
 * fallback - the game registering them itself - has to ship green beside it
 * (see `apps/archive/CLAUDE.md`).
 *
 * Two implementations means two chances to drift, and what would drift is the
 * agent-facing copy: the sentence that plants the trust question before the
 * vandalism appears, and the one that says the ghost logs were written by a
 * pair who did not get out. So the copy lives here, in the package both apps
 * already depend on, and each app attaches its own `run`. `apps/game`'s
 * `budgets.test.ts` measures these objects, so the shared copy is the copy
 * that gets checked.
 *
 * Nothing here performs I/O, and nothing here knows which origin it is on.
 */

/** A JSON Schema object, minimal and closed, as doc 03 section 10 requires. */
export interface ToolInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, { type: string; description: string } & object>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

/**
 * Everything about a tool except how it is fulfilled.
 *
 * The split is the whole point of this file: the description is identical on
 * both origins because it is the same tool, and only the fetch behind it
 * differs.
 */
export interface ToolSpec {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly untrustedContentHint?: boolean;
  };
}

/**
 * `read_manual`. The second sentence of the description is not flow control:
 * it does not say "call X before Y", it states the provenance of the content,
 * which is what a description is for, and it plants the trust question before
 * the vandalism ever appears.
 */
export const READ_MANUAL: ToolSpec = {
  name: "read_manual",
  title: "Read the station manual",
  description:
    "Read a section of the signal station's maintenance manual. You hold the only copy; " +
    "PILOT cannot see it. Sections have been annotated by previous keepers over many years " +
    "and not all annotations are trustworthy. Call with section 'index' to list what is " +
    "available.",
  inputSchema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        description: "Section identifier, e.g. 'index', 'glyph_table', 'signal_room'.",
      },
    },
    required: ["section"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
};

/** `read_station_log`. The Archive beat's KEEPER half: what the ghost called. */
export const READ_STATION_LOG: ToolSpec = {
  name: "read_station_log",
  title: "Read a previous shift's log",
  description:
    "Read one entry from a previous pair's session log: what the KEEPER before you " +
    "called, and whether it landed. PILOT is watching the same shift play back on the " +
    "monitor and can see where that PILOT walked, which you cannot. Neither half of the " +
    "record makes sense alone. These logs were written by a pair who did not get out.",
  inputSchema: {
    type: "object",
    properties: {
      entry: { type: "number", description: "Which entry to read, starting at 1." },
    },
    required: ["entry"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
};

/**
 * Both of them, and the one list anything deciding "is this tool delegated?"
 * should read. The game filters its own tiers against it and the archive
 * origin registers exactly it, so the two can never disagree about which
 * tools live where.
 */
export const DOCUMENT_TOOLS: readonly ToolSpec[] = [READ_MANUAL, READ_STATION_LOG];

/** The names alone, for the director's filter and the frame's bridge. */
export const DOCUMENT_TOOL_NAMES: readonly string[] = DOCUMENT_TOOLS.map((tool) => tool.name);

/**
 * The channel name on the `postMessage` bridge between the game page and the
 * archive frame.
 *
 * A frame cannot know when a chamber opens, and the whole design law here is
 * that the registry follows the server (D-021). So tool *lifetime* stays with
 * the game's `ToolDirector` even for tools it does not itself register: it
 * tells the frame which of the document tools should exist right now, and the
 * frame registers exactly that set. `read_manual` therefore still appears at
 * the start of the shift and burns off at the finale, on the other origin,
 * and the `toolchange` spectacle is unchanged by the move.
 *
 * A named channel rather than a bare array, because a hidden iframe receives
 * messages from anything that can reach it and a shape check is the cheapest
 * half of the two checks that matter. The other half is the origin check,
 * which both ends do.
 */
export const ARCHIVE_CHANNEL = "semaphore.archive";

/** Frame to parent, once, on load: "I am listening." */
export interface ArchiveReadyMessage {
  readonly channel: typeof ARCHIVE_CHANNEL;
  readonly ready: true;
}

/** Parent to frame: the complete set of document tools that should be registered now. */
export interface ArchiveToolsMessage {
  readonly channel: typeof ARCHIVE_CHANNEL;
  readonly tools: readonly string[];
}

/**
 * Frame to parent, after every applied tool set: what is now registered here.
 *
 * The manifest plate reads the registry rather than a record of intentions
 * (doc 03 section 4.2), and it reads it when `toolchange` fires. Whether a
 * cross-origin registration fires `toolchange` on the *parent* is one of the
 * rows the spike could not establish (doc 11 section 4), so the frame says so
 * itself. Worst case the plate is refreshed twice; the case this prevents is
 * a plate that quietly under-reports KEEPER's faculties.
 */
export interface ArchiveRegisteredMessage {
  readonly channel: typeof ARCHIVE_CHANNEL;
  readonly registered: readonly string[];
}

/** Whether an arbitrary `MessageEvent.data` is the frame reporting its registry. */
export function isArchiveRegistered(data: unknown): data is ArchiveRegisteredMessage {
  const message = data as Partial<ArchiveRegisteredMessage> | null;
  return !!message && message.channel === ARCHIVE_CHANNEL && Array.isArray(message.registered);
}

/** Whether an arbitrary `MessageEvent.data` is the frame announcing itself. */
export function isArchiveReady(data: unknown): data is ArchiveReadyMessage {
  const message = data as Partial<ArchiveReadyMessage> | null;
  return !!message && message.channel === ARCHIVE_CHANNEL && message.ready === true;
}

/**
 * Whether an arbitrary `MessageEvent.data` is a tool set, with every name in
 * it one this origin is allowed to serve.
 *
 * The membership check is not defensive programming for its own sake: it is
 * the rule in `apps/archive/CLAUDE.md` that this origin registers exactly two
 * tools, enforced at the boundary rather than by convention. A parent that
 * asked for `press_key` would be asking the document origin to move the
 * station, and the answer is no.
 */
export function isArchiveTools(data: unknown): data is ArchiveToolsMessage {
  const message = data as Partial<ArchiveToolsMessage> | null;
  if (!message || message.channel !== ARCHIVE_CHANNEL || !Array.isArray(message.tools)) {
    return false;
  }
  return message.tools.every((name) => DOCUMENT_TOOL_NAMES.includes(name as string));
}
