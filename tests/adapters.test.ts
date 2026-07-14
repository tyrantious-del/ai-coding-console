import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readClaudeData } from "../server/adapters/claude";
import { readCodexData } from "../server/adapters/codex";
import { readCopilotData } from "../server/adapters/copilot";
import { normalizeTaskStatus } from "../server/status";
import { createCopilotFixtureDb, makeTempDir, writeJson, writeText } from "./fixtures";

describe("status normalization", () => {
  test("maps known native statuses into viewer columns", () => {
    expect(normalizeTaskStatus("in_progress")).toBe("in_progress");
    expect(normalizeTaskStatus("done")).toBe("completed");
    expect(normalizeTaskStatus("blocked")).toBe("blocked");
    expect(normalizeTaskStatus("mystery")).toBe("unknown");
  });
});

describe("Claude adapter", () => {
  test("reads native Claude task JSON without mutating source files", async () => {
    const claudeDir = await makeTempDir("claude");
    const taskPath = join(claudeDir, "tasks", "session-a", "2.json");
    await writeJson(taskPath, {
      id: "2",
      subject: "Finish component CSS pass",
      description: "Match reference.png with the best available slices.",
      activeForm: "Finishing component CSS pass",
      status: "in_progress",
      blocks: ["3"],
      blockedBy: []
    });

    const data = await readClaudeData({ claudeDir });

    expect(data.health.status).toBe("ok");
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]).toMatchObject({
      agent: "claude",
      nativeId: "2",
      sessionId: "session-a",
      title: "Finish component CSS pass",
      status: "in_progress",
      sourcePath: taskPath
    });
    expect(data.sessions[0].taskCount).toBe(1);
  });
});

describe("Codex adapter", () => {
  test("turns Codex JSONL sessions into read-only viewed tasks", async () => {
    const codexDir = await makeTempDir("codex");
    const jsonlPath = join(codexDir, "sessions", "2026", "07", "14", "rollout-1.jsonl");
    await writeText(
      jsonlPath,
      [
        JSON.stringify({
          timestamp: "2026-07-14T21:58:40.383Z",
          type: "session_meta",
          payload: {
            id: "codex-session-1",
            cwd: "C:\\Projects\\model-manager",
            model_provider: "openai"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T21:58:50.383Z",
          type: "turn_context",
          payload: {
            cwd: "C:\\Projects\\model-manager",
            model: "gpt-5.5"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T21:59:40.383Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "# AGENTS.md instructions for C:\\Projects\\model-manager\n\n<INSTRUCTIONS>\nboilerplate\n</INSTRUCTIONS>" }]
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:00:00.383Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Build the task viewer" }]
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:00:20.383Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "update_plan",
            arguments: JSON.stringify({
              plan: [
                { step: "Inspect task sources", status: "completed" },
                { step: "Render progress cards", status: "in_progress" }
              ]
            })
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:00:40.383Z",
          type: "event_msg",
          payload: { type: "agent_message", message: "Found AGENTS.md instructions in the live activity feed" }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:00:50.383Z",
          type: "event_msg",
          payload: { type: "agent_message", message: "Scaffolded the project" }
        })
      ].join("\n")
    );

    const data = await readCodexData({ codexDir });

    expect(data.health.status).toBe("ok");
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.map((task) => task.title)).toEqual(["Inspect task sources", "Render progress cards"]);
    expect(data.tasks[0]).toMatchObject({
      agent: "codex",
      nativeId: "codex-session-1:plan:1",
      title: "Inspect task sources",
      projectPath: "C:\\Projects\\model-manager",
      model: "gpt-5.5",
      status: "completed"
    });
    expect(data.tasks[1]).toMatchObject({ title: "Render progress cards", status: "in_progress" });
    expect(data.tasks[0].progressItems).toHaveLength(2);
    expect(data.sessions[0]).toMatchObject({ taskCount: 2, model: "gpt-5.5" });
    expect(data.activity[0].message).toContain("Scaffolded");
    expect(data.activity.some((event) => event.message.includes("AGENTS.md"))).toBe(false);
  });

  test("finds Codex plan updates even when large tool output follows", async () => {
    const codexDir = await makeTempDir("codex-large");
    const jsonlPath = join(codexDir, "sessions", "2026", "07", "14", "rollout-large.jsonl");
    const largeOutput = "x".repeat(700_000);
    await writeText(
      jsonlPath,
      [
        JSON.stringify({
          timestamp: "2026-07-14T22:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "codex-large-session",
            cwd: "C:\\Projects\\model-manager",
            model: "gpt-5.5"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:01:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "update_plan",
            arguments: JSON.stringify({
              plan: [
                { step: "Generate logo", status: "completed" },
                { step: "Verify dashboard", status: "in_progress" }
              ]
            })
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:02:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call_output",
            output: largeOutput
          }
        })
      ].join("\n")
    );

    const data = await readCodexData({ codexDir });

    expect(data.tasks.map((task) => [task.title, task.status])).toEqual([
      ["Generate logo", "completed"],
      ["Verify dashboard", "in_progress"]
    ]);
  });

  test("marks active Codex plan steps complete when task_complete follows the latest plan", async () => {
    const codexDir = await makeTempDir("codex-complete");
    const jsonlPath = join(codexDir, "sessions", "2026", "07", "14", "rollout-complete.jsonl");
    await writeText(
      jsonlPath,
      [
        JSON.stringify({
          timestamp: "2026-07-14T22:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "codex-complete-session",
            cwd: "C:\\Projects\\model-manager",
            model: "gpt-5.5"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:01:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "update_plan",
            arguments: JSON.stringify({
              plan: [
                { step: "Wire logo", status: "in_progress" },
                { step: "Verify dashboard", status: "pending" }
              ]
            })
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:02:00.000Z",
          type: "event_msg",
          payload: {
            type: "task_complete",
            last_agent_message: "Done. Checks passed."
          }
        })
      ].join("\n")
    );

    const data = await readCodexData({ codexDir });

    expect(data.tasks.map((task) => [task.title, task.status])).toEqual([
      ["Wire logo", "completed"],
      ["Verify dashboard", "pending"]
    ]);
    expect(data.sessions[0]).toMatchObject({ status: "completed", metadata: { inferredComplete: true } });
  });

  test("closes pending Codex plan steps only for the current project workspace", async () => {
    const codexDir = await makeTempDir("codex-current-project");
    const jsonlPath = join(codexDir, "sessions", "2026", "07", "14", "rollout-current-project.jsonl");
    await writeText(
      jsonlPath,
      [
        JSON.stringify({
          timestamp: "2026-07-14T22:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "codex-current-project-session",
            cwd: "C:\\Projects\\model-manager",
            model: "gpt-5.5"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:01:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "update_plan",
            arguments: JSON.stringify({
              plan: [
                { step: "Wire logo", status: "in_progress" },
                { step: "Verify dashboard", status: "pending" }
              ]
            })
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:02:00.000Z",
          type: "event_msg",
          payload: { type: "task_complete", last_agent_message: "Done." }
        })
      ].join("\n")
    );

    const otherProject = await readCodexData({ codexDir, currentProjectPath: "C:\\Projects\\other" });
    const currentProject = await readCodexData({ codexDir, currentProjectPath: "C:\\Projects\\model-manager" });

    expect(otherProject.tasks.map((task) => [task.title, task.status])).toEqual([
      ["Wire logo", "completed"],
      ["Verify dashboard", "pending"]
    ]);
    expect(currentProject.tasks.map((task) => [task.title, task.status])).toEqual([
      ["Wire logo", "completed"],
      ["Verify dashboard", "completed"]
    ]);
  });

  test("does not complete another project plan after a newer user turn reopens the session", async () => {
    const codexDir = await makeTempDir("codex-reopened");
    const jsonlPath = join(codexDir, "sessions", "2026", "07", "14", "rollout-reopened.jsonl");
    await writeText(
      jsonlPath,
      [
        JSON.stringify({
          timestamp: "2026-07-14T22:00:00.000Z",
          type: "session_meta",
          payload: {
            id: "codex-reopened-session",
            cwd: "C:\\Projects\\fable",
            model: "gpt-5.5"
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:01:00.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "update_plan",
            arguments: JSON.stringify({
              plan: [{ step: "Fix overworld transition", status: "in_progress" }]
            })
          }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:02:00.000Z",
          type: "event_msg",
          payload: { type: "task_complete", last_agent_message: "Done." }
        }),
        JSON.stringify({
          timestamp: "2026-07-14T22:03:00.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "The transition still needs work" }]
          }
        })
      ].join("\n")
    );

    const data = await readCodexData({ codexDir, currentProjectPath: "C:\\Projects\\model-manager" });

    expect(data.tasks[0]).toMatchObject({
      title: "Fix overworld transition",
      status: "in_progress",
      projectPath: "C:\\Projects\\fable"
    });
    expect(data.sessions[0]).toMatchObject({ status: "in_progress", metadata: { inferredComplete: false } });
  });
});

describe("Copilot adapter", () => {
  test("reads local Copilot SQLite data in read-only mode", async () => {
    const copilotDir = await makeTempDir("copilot");
    createCopilotFixtureDb(join(copilotDir, "data.db"));

    const data = await readCopilotData({ copilotDir });

    expect(data.health.status).toBe("partial");
    expect(data.tasks[0]).toMatchObject({
      agent: "copilot",
      nativeId: "session-1",
      title: "Tighten the UI",
      status: "completed",
      projectPath: "C:\\Projects\\fable"
    });
    expect(data.sessions[0].metadata.branch).toBe("feature/ui-pass");
    expect(data.activity[0].kind).toBe("agent_idle");
  });
});
