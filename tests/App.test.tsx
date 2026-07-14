import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Dashboard } from "../src/Dashboard";
import type { DashboardData } from "../src/api";

const data: DashboardData = {
  agents: [
    { agent: "claude", label: "Claude", status: "ok", detail: "2 tasks", capabilities: ["Native tasks"] },
    { agent: "codex", label: "Codex", status: "ok", detail: "1 session", capabilities: ["JSONL sessions"] },
    { agent: "copilot", label: "GitHub Copilot", status: "partial", detail: "DB readable", capabilities: ["Local DB read-only"] }
  ],
  tasks: [
    {
      id: "claude:session:1",
      agent: "claude",
      nativeId: "1",
      sessionId: "session",
      title: "Refine dashboard polish",
      description: "Make the task viewer readable.",
      status: "in_progress",
      updatedAt: "2026-07-14T22:00:00.000Z",
      sourcePath: "C:\\Users\\Gaming pc\\.claude\\tasks\\session\\1.json",
      dependencies: { blocks: [], blockedBy: [] },
      tokenEstimate: {
        label: "Task",
        characters: 60,
        tokens: 15,
        method: "approx_chars_div_4",
        breakdown: [
          { label: "Title", characters: 23, tokens: 6, method: "approx_chars_div_4" },
          { label: "Description", characters: 30, tokens: 8, method: "approx_chars_div_4" },
          { label: "Path", characters: 7, tokens: 2, method: "approx_chars_div_4" }
        ]
      },
      metadata: {}
    },
    {
      id: "codex:session-1:plan:1",
      agent: "codex",
      nativeId: "session-1:plan:1",
      sessionId: "session-1",
      title: "Render progress cards",
      status: "in_progress",
      updatedAt: "2026-07-14T22:05:00.000Z",
      sourcePath: "C:\\Users\\Gaming pc\\.codex\\sessions\\2026\\07\\14\\session-1.jsonl",
      dependencies: { blocks: [], blockedBy: [] },
      model: "gpt-5.5",
      tokenEstimate: {
        label: "Task",
        characters: 120,
        tokens: 30,
        method: "approx_chars_div_4",
        breakdown: [
          { label: "Title", characters: 21, tokens: 6, method: "approx_chars_div_4" },
          { label: "Progress", characters: 55, tokens: 14, method: "approx_chars_div_4" },
          { label: "Path", characters: 44, tokens: 11, method: "approx_chars_div_4" }
        ]
      },
      progressItems: [
        { id: "session-1:plan:1", title: "Inspect task sources", status: "completed", updatedAt: "2026-07-14T22:00:00.000Z", source: "plan" },
        { id: "session-1:plan:2", title: "Render progress cards", status: "in_progress", updatedAt: "2026-07-14T22:05:00.000Z", source: "plan" }
      ],
      metadata: { planIndex: 2 }
    },
    {
      id: "copilot:session-1",
      agent: "copilot",
      nativeId: "session-1",
      title: "Tighten the UI",
      status: "completed",
      updatedAt: "2026-07-14T15:30:00.000Z",
      sourcePath: "C:\\Users\\Gaming pc\\.copilot\\data.db",
      dependencies: { blocks: [], blockedBy: [] },
      tokenEstimate: { label: "Task", characters: 40, tokens: 10, method: "approx_chars_div_4" },
      metadata: {}
    },
    {
      id: "claude:yesterday:1",
      agent: "claude",
      nativeId: "old-1",
      sessionId: "yesterday",
      title: "Yesterday Claude task",
      status: "in_progress",
      updatedAt: "2026-07-13T23:22:33.000Z",
      sourcePath: "C:\\Users\\Gaming pc\\.claude\\tasks\\yesterday\\1.json",
      dependencies: { blocks: [], blockedBy: [] },
      tokenEstimate: { label: "Task", characters: 80, tokens: 20, method: "approx_chars_div_4" },
      metadata: {}
    }
  ],
  sessions: [],
  activity: [],
  providers: [],
  tokenSummary: {
    method: "approx_chars_div_4",
    taskTokens: 75,
    sessionTokens: 0,
    totalTokens: 75
  },
  readOnly: false,
  generatedAt: "2026-07-14T22:10:00.000Z"
};

describe("Dashboard", () => {
  test("filters by agent and opens task detail", async () => {
    const addProvider = vi.fn().mockResolvedValue(undefined);
    const deleteTask = vi.fn().mockResolvedValue(undefined);
    const deleteSession = vi.fn().mockResolvedValue(undefined);
    render(
      <Dashboard
        data={data}
        loading={false}
        error={null}
        onAddProvider={addProvider}
        onDeleteSession={deleteSession}
        onDeleteTask={deleteTask}
        onRefresh={() => undefined}
      />
    );

    expect(screen.getByText("AI Coding Console")).toBeInTheDocument();
    expect(screen.getByText("Model, task, and context manager for AI coding agents.")).toBeInTheDocument();
    expect(screen.getByText("Context Budget")).toBeInTheDocument();
    expect(screen.getByLabelText("Token budget")).toHaveValue(4000);
    expect(screen.queryByText("Smart Context Trimming & Packing")).not.toBeInTheDocument();
    expect(screen.getByText("Providers & Models")).toBeInTheDocument();
    expect(screen.getAllByText(/tokens/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getAllByText("gpt-5.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Refine dashboard polish").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Render progress cards").length).toBeGreaterThan(0);
    expect(screen.getByText("Plan step 2 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday Claude task")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Render progress cards/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Model");
    expect(screen.getByRole("dialog")).toHaveTextContent("gpt-5.5");
    expect(screen.getByRole("dialog")).toHaveTextContent("Token Breakdown");
    expect(screen.getByRole("dialog")).toHaveTextContent("Progress");
    expect(screen.getByRole("dialog")).toHaveTextContent("Progress");
    expect(screen.getByRole("dialog")).toHaveTextContent("Inspect task sources");
    expect(screen.getByRole("dialog")).toHaveTextContent("Completed");

    await userEvent.click(screen.getByRole("button", { name: /Delete from viewer/i }));
    expect(deleteTask).toHaveBeenCalledWith("codex:session-1:plan:1");

    await userEvent.clear(screen.getByLabelText("Token budget"));
    await userEvent.type(screen.getByLabelText("Token budget"), "40");

    expect(screen.getByText("Context load is getting tight")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Filter GitHub Copilot/i }));

    expect(screen.queryByText("Refine dashboard polish")).not.toBeInTheDocument();
    expect(screen.getAllByText("Tighten the UI").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /Tighten the UI/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Tighten the UI");
    expect(screen.getByRole("dialog")).toHaveTextContent("C:\\Users\\Gaming pc\\.copilot\\data.db");

    await userEvent.type(screen.getByLabelText("Provider name"), "OpenRouter");
    await userEvent.type(screen.getByLabelText("Model name"), "anthropic/claude-sonnet");
    await userEvent.click(screen.getByRole("button", { name: /Add model/i }));
    expect(addProvider).toHaveBeenCalledWith({ provider: "OpenRouter", model: "anthropic/claude-sonnet", endpoint: "", notes: "" });
  });
});
