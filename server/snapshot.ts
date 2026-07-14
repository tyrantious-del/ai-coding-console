import type { AgentSnapshot, ViewerSnapshot } from "../shared/types.js";
import type { AppConfig } from "./config.js";
import { readClaudeData } from "./adapters/claude.js";
import { readCodexData } from "./adapters/codex.js";
import { readCopilotData } from "./adapters/copilot.js";
import { readConsoleState } from "./local-state.js";
import { createTokenSummary, estimateSessionTokens, estimateTaskTokens } from "./token-estimator.js";

export async function readViewerSnapshot(config: AppConfig): Promise<ViewerSnapshot> {
  const [state, claude, codex, copilot] = await Promise.all([
    readConsoleState(config.statePath),
    readClaudeData({ claudeDir: config.claudeDir }),
    readCodexData({ codexDir: config.codexDir, currentProjectPath: process.cwd() }),
    readCopilotData({ copilotDir: config.copilotDir })
  ]);
  const snapshots: AgentSnapshot[] = [claude, codex, copilot];
  const deletedTaskIds = new Set(state.deletedTaskIds);
  const deletedSessionIds = new Set(state.deletedSessionIds);

  const tasks = snapshots
    .flatMap((snapshot) => snapshot.tasks)
    .filter((task) => !deletedTaskIds.has(task.id) && !isTaskSessionDeleted(task, deletedSessionIds))
    .sort((a, b) => compareIso(b.updatedAt, a.updatedAt))
    .map((task) => ({ ...task, tokenEstimate: estimateTaskTokens(task) }));
  const sessions = snapshots
    .flatMap((snapshot) => snapshot.sessions)
    .filter((session) => !deletedSessionIds.has(session.id))
    .sort((a, b) => compareIso(b.updatedAt, a.updatedAt))
    .map((session) => ({ ...session, tokenEstimate: estimateSessionTokens(session) }));

  return {
    agents: snapshots.map((snapshot) => snapshot.health),
    tasks,
    sessions,
    activity: snapshots.flatMap((snapshot) => snapshot.activity).sort((a, b) => compareIso(b.createdAt, a.createdAt)).slice(0, 150),
    providers: state.providers,
    tokenSummary: createTokenSummary(tasks, sessions),
    readOnly: false,
    generatedAt: new Date().toISOString()
  };
}

function compareIso(a?: string, b?: string): number {
  return Date.parse(a ?? "1970-01-01T00:00:00.000Z") - Date.parse(b ?? "1970-01-01T00:00:00.000Z");
}

function isTaskSessionDeleted(task: { agent: string; sessionId?: string }, deletedSessionIds: Set<string>): boolean {
  if (!task.sessionId) return false;
  return deletedSessionIds.has(task.sessionId) || deletedSessionIds.has(`${task.agent}:${task.sessionId}`);
}
