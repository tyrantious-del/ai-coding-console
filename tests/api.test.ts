import { join } from "node:path";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createApp } from "../server/app";
import { createCopilotFixtureDb, makeTempDir, writeJson, writeText } from "./fixtures";

describe("Model Manager API", () => {
  test("returns normalized tasks and supports viewer-local controls", async () => {
    const root = await makeTempDir("api");
    const claudeDir = join(root, "claude");
    const codexDir = join(root, "codex");
    const copilotDir = join(root, "copilot");
    const statePath = join(root, "state", "state.json");
    await writeJson(join(claudeDir, "tasks", "claude-session", "1.json"), {
      id: "1",
      subject: "Claude task",
      description: "",
      status: "pending",
      blocks: [],
      blockedBy: []
    });
    await writeText(
      join(codexDir, "sessions", "2026", "07", "14", "rollout.jsonl"),
      `${JSON.stringify({
        timestamp: "2026-07-14T21:58:40.383Z",
        type: "session_meta",
        payload: { id: "codex-session", cwd: root }
      })}\n`
    );
    createCopilotFixtureDb(join(copilotDir, "data.db"));

    const app = createApp({ claudeDir, codexDir, copilotDir, statePath, watch: false });

    const tasks = await request(app).get("/api/tasks").expect(200);
    expect(tasks.body.readOnly).toBe(false);
    expect(tasks.body.tokenSummary.method).toBe("approx_chars_div_4");
    expect(tasks.body.tokenSummary.taskTokens).toBeGreaterThan(0);
    expect(tasks.body.tasks.map((task: { agent: string }) => task.agent).sort()).toEqual([
      "claude",
      "codex",
      "copilot"
    ]);
    expect(tasks.body.tasks.every((task: { tokenEstimate?: unknown }) => Boolean(task.tokenEstimate))).toBe(true);

    const claudeTask = tasks.body.tasks.find((task: { agent: string }) => task.agent === "claude");
    await request(app).delete(`/api/tasks/${encodeURIComponent(claudeTask.id)}`).expect(204);
    const afterDelete = await request(app).get("/api/tasks").expect(200);
    expect(afterDelete.body.tasks.some((task: { id: string }) => task.id === claudeTask.id)).toBe(false);

    await request(app).post("/api/providers").send({ provider: "OpenRouter", model: "anthropic/claude-sonnet", endpoint: "https://openrouter.ai" }).expect(201);
    const providers = await request(app).get("/api/providers").expect(200);
    expect(providers.body.providers[0]).toMatchObject({ provider: "OpenRouter", model: "anthropic/claude-sonnet" });

    await request(app).patch("/api/tasks/1").send({ status: "completed" }).expect(404);
  });
});
