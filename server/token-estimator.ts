import type { TokenEstimate, TokenSummary, ViewedSession, ViewedTask } from "../shared/types.js";

const METHOD = "approx_chars_div_4" as const;

export function estimateTokensFromText(value: string | undefined, label: string): TokenEstimate {
  const characters = value?.length ?? 0;
  return {
    label,
    characters,
    method: METHOD,
    tokens: characters === 0 ? 0 : Math.ceil(characters / 4)
  };
}

export function estimateTaskTokens(task: ViewedTask): TokenEstimate {
  const breakdown = [
    estimateTokensFromText(task.title, "Title"),
    estimateTokensFromText(task.description, "Description"),
    estimateTokensFromText(formatProgress(task.progressItems), "Progress"),
    estimateTokensFromText([task.projectPath, task.sourcePath].filter(Boolean).join("\n"), "Path"),
    estimateTokensFromText(formatTaskMetadata(task), "Metadata")
  ];

  return combineEstimate("Task", breakdown);
}

export function estimateSessionTokens(session: ViewedSession): TokenEstimate {
  const breakdown = [
    estimateTokensFromText(session.title, "Title"),
    estimateTokensFromText(formatProgress(session.progressItems), "Progress"),
    estimateTokensFromText([session.projectPath, session.sourcePath].filter(Boolean).join("\n"), "Path"),
    estimateTokensFromText(formatSessionMetadata(session), "Metadata")
  ];

  return combineEstimate("Session", breakdown);
}

export function createTokenSummary(tasks: ViewedTask[], sessions: ViewedSession[]): TokenSummary {
  const taskTokens = tasks.reduce((total, task) => total + (task.tokenEstimate?.tokens ?? estimateTaskTokens(task).tokens), 0);
  const sessionTokens = sessions.reduce((total, session) => total + (session.tokenEstimate?.tokens ?? estimateSessionTokens(session).tokens), 0);

  return {
    method: METHOD,
    taskTokens,
    sessionTokens,
    totalTokens: taskTokens + sessionTokens
  };
}

function combineEstimate(label: string, breakdown: TokenEstimate[]): TokenEstimate {
  return {
    label,
    method: METHOD,
    characters: breakdown.reduce((total, estimate) => total + estimate.characters, 0),
    tokens: breakdown.reduce((total, estimate) => total + estimate.tokens, 0),
    breakdown
  };
}

function formatProgress(progressItems: ViewedTask["progressItems"]): string {
  return progressItems?.map((item) => `${item.title} ${item.status}`).join("\n") ?? "";
}

function formatTaskMetadata(task: ViewedTask): string {
  return JSON.stringify({
    agent: task.agent,
    status: task.status,
    nativeId: task.nativeId,
    sessionId: task.sessionId,
    model: task.model,
    provider: task.provider,
    metadata: task.metadata
  });
}

function formatSessionMetadata(session: ViewedSession): string {
  return JSON.stringify({
    agent: session.agent,
    status: session.status,
    taskCount: session.taskCount,
    model: session.model,
    provider: session.provider,
    metadata: session.metadata
  });
}
