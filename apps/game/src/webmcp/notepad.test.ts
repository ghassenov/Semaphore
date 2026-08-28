// @vitest-environment happy-dom
/**
 * The notepad: the declarative API, and the ending it very nearly broke.
 *
 * This file exists mostly for one claim. `ToolDirector.endSession()` drains
 * the registry to empty, and that is the last beat of the game - the whole
 * reason `open_the_door` is a tool rather than a button. The spike found on
 * 2026-08-28 that aborting a signal does **not** remove a declaratively
 * registered tool, because its lifetime is its form element's rather than a
 * controller's (doc 11 section 2, D-024). So the moment the notepad exists,
 * the ending is one line away from finishing on a registry holding one tool,
 * and looking almost right while it does.
 *
 * Everything here runs against a document, because the tool under test is an
 * element. The fake registry unions the imperative tools with every
 * `form[toolname]` in that document, exactly as a real registry does, which is
 * what lets these assertions mean anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Phase } from "@semaphore/protocol";
import { SessionClient, type StateSummary } from "../net/sessionClient.js";
import { ToolDirector } from "./director.js";
import { installFakeRegistry, type FakeRegistry } from "./fake-registry.js";
import { WRITE_NOTE_SPEC, createNotepadForm } from "./tools.notepad.js";
import { isAgentSubmission, registerFormTool } from "./adapter.js";
import { BUDGETS } from "./tool.js";

let registry: FakeRegistry;
let host: HTMLElement;

function body(phase: Phase, chamber: StateSummary["chamber"] = null, text = "ok") {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
        state: { phase, chamber, designation: "KEEPER", remainingMs: null },
      }),
  } as unknown as Response;
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  registry = installFakeRegistry();
  vi.stubGlobal("performance", { now: () => 0 });
});

afterEach(() => {
  registry.uninstall();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A director with somewhere to put the pad, and the session already begun. */
async function begunSession(): Promise<ToolDirector> {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(body("IN_CHAMBER", "airlock"));
  const client = new SessionClient("s_test");
  const director = new ToolDirector(client, { notepadHost: host });
  await director.mountEntry();
  await director.applyState({
    phase: "IN_CHAMBER",
    chamber: "airlock",
    designation: "KEEPER",
    remainingMs: null,
  });
  return director;
}

describe("registerFormTool", () => {
  it("writes the attributes that make a form a tool", () => {
    const form = document.createElement("form");
    const field = document.createElement("textarea");
    field.name = "text";
    form.append(field);
    document.body.append(form);

    registerFormTool(form, {
      name: "write_note",
      description: "Write a line.",
      params: { text: "The line to write." },
      autoSubmit: true,
    });

    expect(form.getAttribute("toolname")).toBe("write_note");
    expect(form.getAttribute("tooldescription")).toBe("Write a line.");
    expect(form.hasAttribute("toolautosubmit")).toBe(true);
    expect(field.getAttribute("toolparamdescription")).toBe("The line to write.");
  });

  it("returns a teardown that removes the element, because nothing else can", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const teardown = registerFormTool(form, {
      name: "write_note",
      description: "Write a line.",
      params: {},
      autoSubmit: false,
    });

    expect(form.isConnected).toBe(true);
    teardown();
    expect(form.isConnected).toBe(false);
  });

  it("ignores a parameter the form does not have, rather than throwing", () => {
    // A mismatch should surface as a gap in `getTools()`, which is inspectable,
    // not as an exception during startup, which takes the page down.
    const form = document.createElement("form");
    document.body.append(form);
    expect(() =>
      registerFormTool(form, {
        name: "write_note",
        description: "Write a line.",
        params: { missing: "Nothing here has this name." },
        autoSubmit: false,
      }),
    ).not.toThrow();
  });
});

describe("isAgentSubmission", () => {
  it("reads agentInvoked when the host sets it", () => {
    const event = new SubmitEvent("submit") as SubmitEvent & { agentInvoked?: boolean };
    event.agentInvoked = true;
    expect(isAgentSubmission(event)).toBe(true);
  });

  it("treats an absent property as a human hand", () => {
    // The safer default: attributing a human's line to the agent would put
    // words in a partner's mouth, and the property is not in every target yet.
    expect(isAgentSubmission(new SubmitEvent("submit"))).toBe(false);
  });
});

describe("the notepad form", () => {
  it("posts a hand submission as PILOT", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const client = new SessionClient("s_test");
    const { form } = createNotepadForm(client);
    document.body.append(form);
    const field = form.elements.namedItem("text") as HTMLTextAreaElement;

    field.value = "lever_b carries the spiral";
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    await Promise.resolve();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      text: "lever_b carries the spiral",
      author: "PILOT",
    });
  });

  it("posts an agent submission as KEEPER", async () => {
    // The one line that makes the pad the exhibit it is: both parties reach
    // the same handler through the same control, and this is what tells them
    // apart.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const client = new SessionClient("s_test");
    const { form } = createNotepadForm(client);
    document.body.append(form);
    const field = form.elements.namedItem("text") as HTMLTextAreaElement;

    field.value = "Stroke table says spiral is 4.";
    const event = new SubmitEvent("submit", { cancelable: true }) as SubmitEvent & {
      agentInvoked?: boolean;
    };
    event.agentInvoked = true;
    form.dispatchEvent(event);
    await Promise.resolve();

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String((init as RequestInit).body)).author).toBe("KEEPER");
  });

  it("never navigates, whoever submitted", () => {
    // A real navigation would tear down the page, the session socket and the
    // whole registry, which is a spectacular way to lose a game to a keypress.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const { form } = createNotepadForm(new SessionClient("s_test"));
    document.body.append(form);
    (form.elements.namedItem("text") as HTMLTextAreaElement).value = "anything";

    const event = new SubmitEvent("submit", { cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("sends nothing for a blank line, and clears the field after a real one", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(body("IN_CHAMBER", "airlock"));
    const { form } = createNotepadForm(new SessionClient("s_test"));
    document.body.append(form);
    const field = form.elements.namedItem("text") as HTMLTextAreaElement;

    field.value = "   ";
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    expect(fetchMock).not.toHaveBeenCalled();

    field.value = "something";
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(field.value).toBe("");
  });

  it("respects the same description budget every imperative tool does", () => {
    // A description written into a template is a description nothing measures,
    // which is why the spec is a TypeScript object (D-022).
    expect(WRITE_NOTE_SPEC.name.length).toBeLessThanOrEqual(BUDGETS.name);
    expect(WRITE_NOTE_SPEC.description.length).toBeLessThanOrEqual(BUDGETS.description);
    for (const description of Object.values(WRITE_NOTE_SPEC.params)) {
      expect(description.length).toBeLessThanOrEqual(BUDGETS.parameterDescription);
    }
  });
});

describe("the notepad in the registry", () => {
  it("appears alongside the imperative tools once the shift begins", async () => {
    await begunSession();
    // Indistinguishable in `getTools()` apart from annotations, which is what
    // the spike found and what makes the two-API claim honest.
    const names = (await registry.getTools()).map((tool) => tool.name);
    expect(names).toContain("write_note");
    expect(names).toContain("read_note");
    expect(names).toContain("pull_lever");
  });

  it("is created once and survives every chamber", async () => {
    const director = await begunSession();
    const first = host.querySelector("form");
    await director.applyState({
      phase: "IN_CHAMBER",
      chamber: "signal_room",
      designation: "KEEPER",
      remainingMs: null,
    });
    // A pad that emptied at each door would be worse than no pad: it is the
    // pair's memory, and the moment they most need it is a room change.
    expect(host.querySelectorAll("form")).toHaveLength(1);
    expect(host.querySelector("form")).toBe(first);
  });

  it("is off the wall at the finale, leaving open_the_door alone", async () => {
    const director = await begunSession();
    await director.applyState({
      phase: "FINALE",
      chamber: "concord_lock",
      designation: "KEEPER",
      remainingMs: null,
    });
    expect(registry.names()).toEqual(["open_the_door"]);
    expect(host.querySelector("form")).toBeNull();
  });
});

describe("the ending", () => {
  it("drains the registry to genuinely empty", async () => {
    // The claim D-024 put at risk. Aborting every controller is not enough:
    // the notepad is registered by its element and leaves only when the
    // element does. Without the removal this reads `["write_note"]`, which is
    // the worse failure because it looks almost right.
    const director = await begunSession();
    expect(registry.names().length).toBeGreaterThan(1);

    director.endSession();

    expect(registry.names()).toEqual([]);
    expect(await registry.getTools()).toEqual([]);
    expect(host.querySelector("form")).toBeNull();
  });

  it("fires toolchange when the pad leaves, so the last beat is observable", async () => {
    const director = await begunSession();
    let firedAfterRemoval = false;
    registry.addEventListener("toolchange", () => {
      firedAfterRemoval = true;
    });

    director.endSession();
    // The MutationObserver that models the browser's own watch is async.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(firedAfterRemoval).toBe(true);
  });

  it("ends empty when the server itself reports ESCAPED", async () => {
    // The path a real session takes: nothing calls `endSession` by hand, the
    // machine state arrives on a response and the director follows it (D-021).
    // `ESCAPED` is the only terminal phase, so this is the whole ending.
    const director = await begunSession();
    await director.applyState({
      phase: "ESCAPED",
      chamber: "concord_lock",
      designation: "KEEPER",
      remainingMs: null,
    });
    expect(registry.names()).toEqual([]);
    expect(host.querySelector("form")).toBeNull();
  });

  it("is idempotent, because the finale already took the pad down", async () => {
    const director = await begunSession();
    await director.applyState({
      phase: "FINALE",
      chamber: "concord_lock",
      designation: "KEEPER",
      remainingMs: null,
    });
    expect(() => {
      director.endSession();
      director.endSession();
    }).not.toThrow();
    expect(registry.names()).toEqual([]);
  });
});
