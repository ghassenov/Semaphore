/**
 * Shared wire vocabulary for the client, the worker, the archive origin and
 * the benchmark harness.
 *
 * Everything a boundary is described in terms of lives here and only here.
 * A duplicated channel tag or error code is how two halves of the system
 * quietly stop agreeing about what a fact means, and in this project the
 * disagreement would not be a bug, it would be a leak.
 */

export {
  CHANNELS,
  PERCEIVED_BY,
  audible,
  concealedFrom,
  hidden,
  otherParty,
  perceives,
  projectFacts,
  shared,
  tactile,
  visual,
} from "./channels.js";
export type { Channel, Party, Tagged, TaggedRecord, Unwrapped } from "./channels.js";

export { ERROR_CODES, GameError, errors } from "./errors.js";
export type { ErrorCode } from "./errors.js";

export {
  CHAMBER_NAMES,
  CHAMBER_ORDER,
  CHAMBER_TIMER_MS,
  CUES,
  DIFFICULTIES,
  MODE_CHAMBERS,
  NOTE_CAPACITY,
  NOTE_MAX_LENGTH,
  PHASES,
  TERMINAL_PHASES,
  isCue,
  nextChamber,
  timerFor,
} from "./game.js";
export type {
  ChamberId,
  Cue,
  Difficulty,
  DifficultySettings,
  FailureState,
  GhostBeat,
  GhostTrack,
  Note,
  NoteAuthor,
  Phase,
  PilotView,
  Progress,
  SessionMode,
} from "./game.js";

export { parseJsonl, toJsonl } from "./log.js";
export type {
  AudibleEvent,
  ChamberEvent,
  FailureEvent,
  PilotActionEvent,
  SessionEndEvent,
  SessionEvent,
  SessionStartEvent,
  StateDeltaEvent,
  ToolCallEvent,
  ToolCancelEvent,
} from "./log.js";

export {
  ARCHIVE_CHANNEL,
  DOCUMENT_TOOLS,
  DOCUMENT_TOOL_NAMES,
  READ_MANUAL,
  READ_STATION_LOG,
  isArchiveReady,
  isArchiveRegistered,
  isArchiveTools,
} from "./tools.js";
export type {
  ArchiveReadyMessage,
  ArchiveRegisteredMessage,
  ArchiveToolsMessage,
  ToolInputSchema,
  ToolSpec,
} from "./tools.js";
