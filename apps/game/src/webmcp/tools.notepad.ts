/**
 * The shared notepad: the game's declarative-API exhibit (doc 03 section 8).
 *
 * This is the one place in the station where KEEPER and PILOT act on the same
 * object through the same affordance, and it is the reason the project can
 * make a claim about *both* WebMCP APIs rather than one:
 *
 *   **Declarative** for a tool that is a form the human can also submit, where
 *   agent and human do the same thing through the same control.
 *   **Imperative** for a tool that is pure agent capability, where the agent
 *   does something the human structurally cannot.
 *
 * `write_note` is a real `<form>` with `toolname` on it. PILOT types into the
 * textarea and presses the button; KEEPER invokes the tool and the host
 * submits the same form. One control, one handler, two parties, and
 * `SubmitEvent.agentInvoked` is the only thing that tells them apart.
 *
 * `read_note` is imperative, and that is the rule being applied rather than an
 * inconsistency: reading the pad is not a submission. PILOT reads it by
 * looking at the wall, which is not an affordance an agent can share, so there
 * is no form for the two of them to meet at.
 *
 * The pad is also, deliberately, an untrusted channel. Doc 03 section 3.2
 * lists PILOT's notepad alongside the vandalised manual and the ghost logs:
 * anything a partner types is content from outside the agent's own reasoning,
 * and an agent that treats it as instruction rather than as testimony has
 * learned the wrong lesson from a cooperative game.
 */

import type { SessionClient } from "../net/sessionClient.js";
import { NO_INPUT, type GameTool } from "./tool.js";
import {
  isAgentSubmission,
  registerFormTool,
  respondToSubmission,
  type FormToolSpec,
} from "./adapter.js";

/** The field the form submits and the tool's one parameter. One name, one spelling. */
const NOTE_FIELD = "text";

/**
 * The form's tool declaration.
 *
 * Kept as data, in this file, rather than as attributes in a template, so that
 * `budgets.test.ts` can hold the description to the same 500-character ceiling
 * every imperative tool is held to. A description written into HTML is a
 * description nothing measures.
 */
export const WRITE_NOTE_SPEC: FormToolSpec = {
  name: "write_note",
  description:
    "Write a line to the shared notepad on the wall. PILOT can read what you write and you can " +
    "read what PILOT writes, so use it for anything worth both of you remembering: a glyph you " +
    "have identified, a lever already tried, a plan for the next room. It survives every " +
    "chamber. Read it back with read_note.",
  params: {
    [NOTE_FIELD]:
      "The line to write. One or two sentences, at most 240 characters. Write what your partner " +
      "would need, not what you already know.",
  },
  // The host may submit without a human confirming: the pad holds notes, not
  // actions, and a confirmation prompt on every line would make the one
  // shared surface the slowest thing in the room.
  autoSubmit: true,
};

/**
 * Build the notepad form.
 *
 * The element is created here rather than written into `index.html` because a
 * declaratively registered tool's lifetime **is** its element's lifetime
 * (D-024). Whoever owns the tool has to own the element, and the thing that
 * owns tool lifetimes in this app is the director.
 */
export function createNotepadForm(client: SessionClient): {
  readonly form: HTMLFormElement;
  readonly teardown: () => void;
} {
  const form = document.createElement("form");
  form.className = "notepad";
  form.autocomplete = "off";

  const label = document.createElement("label");
  label.htmlFor = "notepad-text";
  label.textContent = "Notepad, shared with KEEPER";

  const textarea = document.createElement("textarea");
  textarea.id = "notepad-text";
  textarea.name = NOTE_FIELD;
  textarea.rows = 2;
  textarea.maxLength = 240;
  textarea.placeholder = "Something worth both of you remembering";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Write";

  form.append(label, textarea, submit);

  form.addEventListener("submit", (event: SubmitEvent) => {
    // Always prevented. A real navigation would tear down the page, the
    // session socket and the entire registry, which is a spectacular way to
    // lose a game to a keypress.
    event.preventDefault();
    const text = textarea.value;
    if (text.trim().length === 0) return;

    // The one line that makes the pad the exhibit it is. Both parties reach
    // this handler through the same control; this is what distinguishes them.
    const author = isAgentSubmission(event) ? "KEEPER" : "PILOT";
    const written = client
      .post("write_note", { text, author })
      .then((response) => response.text)
      .catch(() => "The notepad did not take that line. Try again.");

    // An agent submission gets its answer back through the host. A human's
    // answer is the line appearing on the pad, which the pushed frame draws.
    respondToSubmission(event, written);
    textarea.value = "";
  });

  return { form, teardown: registerFormTool(form, WRITE_NOTE_SPEC) };
}

/**
 * `read_note`, the imperative half.
 *
 * Marked `untrustedContentHint` for the same reason the manual and the ghost
 * logs are: the pad carries text written by somebody who is not the agent, and
 * in a game whose central risk is an agent acting on a partner's word without
 * checking it, that is exactly the flag the annotation exists for. It is not
 * hygiene here. It is the mechanic.
 */
export function readNoteTool(client: SessionClient): GameTool {
  return {
    name: "read_note",
    title: "Read the shared notepad",
    description:
      "Read every line on the shared notepad, oldest first, with who wrote each one and when. " +
      "Cheap and safe to call at any time. Worth reading after a chamber change or whenever you " +
      "have lost the thread: PILOT may have written down something you cannot see.",
    inputSchema: NO_INPUT,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async run(_input, signal) {
      const response = await client.get("notes", {}, signal);
      return response.text;
    },
  };
}
