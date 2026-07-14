import path from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { ActivityEvent, AgentSnapshot, ProgressItem, TaskStatus, ViewedSession, ViewedTask } from "../../shared/types.js";
import { exists, fileTimestamp, readFileSample, shortText, walkFiles } from "../fs-utils.js";

interface CodexAdapterOptions {
  codexDir: string;
  currentProjectPath?: string;
}

interface ParsedCodexSession {
  id: string;
  title: string;
  projectPath?: string;
  model?: string;
  provider?: string;
  sourcePath: string;
  updatedAt?: string;
  archived: boolean;
  activity: ActivityEvent[];
  progressItems: ProgressItem[];
  planUpdatedAt?: string;
  completedAt?: string;
  lastUserAt?: string;
}

export async function readCodexData(options: CodexAdapterOptions): Promise<AgentSnapshot> {
  const sessionsRoot = path.join(options.codexDir, "sessions");
  const archivedRoot = path.join(options.codexDir, "archived_sessions");
  const sourcePaths = [sessionsRoot, archivedRoot];

  if (!(await exists(sessionsRoot)) && !(await exists(archivedRoot))) {
    return {
      health: {
        agent: "codex",
        label: "Codex",
        status: "unavailable",
        detail: "No Codex sessions directory found.",
        capabilities: ["JSONL session logs"],
        sourcePaths
      },
      tasks: [],
      sessions: [],
      activity: []
    };
  }

  const activeFiles = await walkFiles(sessionsRoot, (filePath) => filePath.toLowerCase().endsWith(".jsonl"));
  const archivedFiles = await walkFiles(archivedRoot, (filePath) => filePath.toLowerCase().endsWith(".jsonl"));
  const parsed = await Promise.all([
    ...activeFiles.map((filePath) => parseCodexJsonl(filePath, false)),
    ...archivedFiles.map((filePath) => parseCodexJsonl(filePath, true))
  ]);
  const sessions = parsed.filter((session): session is ParsedCodexSession => Boolean(session));

  const tasks: ViewedTask[] = sessions.flatMap((session) => createCodexTasks(session, options.currentProjectPath));

  const viewedSessions: ViewedSession[] = sessions.map((session) => {
    const inferredComplete = isPlanComplete(session, options.currentProjectPath);
    return {
      id: `codex:${session.id}`,
      agent: "codex" as const,
      title: session.title,
      projectPath: session.projectPath,
      sourcePath: session.sourcePath,
      status: session.archived || inferredComplete ? "completed" : isRecent(session.updatedAt) ? "in_progress" : "unknown",
      taskCount: Math.max(1, session.progressItems.length),
      updatedAt: session.updatedAt,
      model: session.model,
      provider: session.provider,
      progressItems: session.progressItems,
      metadata: {
        model: session.model,
        provider: session.provider,
        archived: session.archived,
        inferredComplete
      }
    };
  });

  const activity = sessions.flatMap((session) => session.activity).sort((a, b) => compareIso(b.createdAt, a.createdAt));

  return {
    health: {
      agent: "codex",
      label: "Codex",
      status: "ok",
      detail: `${sessions.length} session${sessions.length === 1 ? "" : "s"} from JSONL logs.`,
      capabilities: ["JSONL session logs", "Recent activity", "Archived sessions"],
      sourcePaths
    },
    tasks: sortByUpdated(tasks),
    sessions: sortByUpdated(viewedSessions),
    activity: activity.slice(0, 100)
  };
}

async function parseCodexJsonl(filePath: string, archived: boolean): Promise<ParsedCodexSession | null> {
  try {
    const updatedAt = await fileTimestamp(filePath);
    let id = path.basename(filePath, ".jsonl");
    let projectPath: string | undefined;
    let model: string | undefined;
    let provider: string | undefined;
    let title: string | undefined;
    const activity: ActivityEvent[] = [];
    let progressItems: ProgressItem[] = [];
    let planUpdatedAt: string | undefined;
    let completedAt: string | undefined;
    let lastUserAt: string | undefined;

    const lines = shouldStreamFullFile(updatedAt, archived) ? readJsonlLines(filePath) : readSampledJsonlLines(filePath);

    for await (const line of lines) {
      if (!line.trim()) continue;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isObject(record)) continue;

      const type = asString(record.type);
      const timestamp = asString(record.timestamp);
      const payload = isObject(record.payload) ? record.payload : {};

      if (type === "session_meta") {
        id = asString(payload.id) ?? id;
        projectPath = asString(payload.cwd) ?? projectPath;
        model = asString(payload.model) ?? model;
        provider = asString(payload.model_provider) ?? provider;
      }

      if (type === "turn_context" && !projectPath) {
        projectPath = asString(payload.cwd);
      }

      if (type === "turn_context") {
        model = asString(payload.model) ?? model;
        provider = asString(payload.model_provider) ?? provider;
      }

      const userText = extractUserText(payload);
      if (userText && isMeaningfulPrompt(userText)) {
        title = shortText(userText, id);
        lastUserAt = timestamp ?? lastUserAt;
      }

      const functionName = asString(payload.name);
      if (type === "response_item" && functionName === "update_plan") {
        const parsedPlan = parseCodexPlan(asString(payload.arguments), id, timestamp);
        if (parsedPlan.length > 0) {
          progressItems = parsedPlan;
          planUpdatedAt = timestamp;
        }
      }

      const eventMessage = asString(payload.message);
      const eventType = asString(payload.type);
      if (type === "event_msg" && eventType === "task_complete") {
        completedAt = timestamp ?? completedAt;
      }
      if (type === "event_msg" && eventMessage && isDisplayableActivity(eventMessage)) {
        activity.push({
          id: `codex-event:${id}:${activity.length}`,
          agent: "codex",
          kind: eventType ?? "event",
          message: shortText(eventMessage, eventMessage, 180),
          sessionId: id,
          createdAt: timestamp,
          sourcePath: filePath,
          metadata: {}
        });
      }
    }

    return {
      id,
      title: title ?? shortText(projectPath, id),
      projectPath,
      model,
      provider,
      sourcePath: filePath,
      updatedAt,
      archived,
      activity,
      progressItems,
      planUpdatedAt,
      completedAt,
      lastUserAt
    };
  } catch {
    return null;
  }
}

async function* readSampledJsonlLines(filePath: string): AsyncGenerator<string> {
  const sample = await readFileSample(filePath);
  for (const line of sample.split(/\r?\n/)) {
    yield line;
  }
}

async function* readJsonlLines(filePath: string): AsyncGenerator<string> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      yield line;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

function shouldStreamFullFile(updatedAt: string | undefined, archived: boolean): boolean {
  if (archived || !updatedAt) return false;
  const date = new Date(updatedAt);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function createCodexTasks(session: ParsedCodexSession, currentProjectPath?: string): ViewedTask[] {
  const status = session.archived ? "completed" : isRecent(session.updatedAt) ? "in_progress" : "unknown";
  const planWasCompleted = isPlanComplete(session, currentProjectPath);
  const completePendingForCurrentProject = planWasCompleted && isSamePath(session.projectPath, currentProjectPath);
  if (session.progressItems.length === 0) {
    return [
      {
        id: `codex:${session.id}`,
        agent: "codex",
        nativeId: session.id,
        sessionId: session.id,
        title: session.title,
        description: session.projectPath ? `Workspace: ${session.projectPath}` : undefined,
        status,
        projectPath: session.projectPath,
        sourcePath: session.sourcePath,
        updatedAt: session.updatedAt,
        model: session.model,
        provider: session.provider,
        progressItems: session.progressItems,
        dependencies: { blocks: [], blockedBy: [] },
        metadata: {
          model: session.model,
          provider: session.provider,
          archived: session.archived
        }
      }
    ];
  }

  return session.progressItems.map((item, index) => ({
    id: `codex:${session.id}:plan:${index + 1}`,
    agent: "codex" as const,
    nativeId: `${session.id}:plan:${index + 1}`,
    sessionId: session.id,
    title: item.title,
    description: session.projectPath ? `Workspace: ${session.projectPath}` : `Session: ${shortText(session.title, session.id, 90)}`,
    status: normalizeCompletedPlanItemStatus(item.status, session.archived, planWasCompleted, completePendingForCurrentProject),
    projectPath: session.projectPath,
    sourcePath: session.sourcePath,
    updatedAt: item.updatedAt ?? session.updatedAt,
    model: session.model,
    provider: session.provider,
    progressItems: session.progressItems,
    dependencies: { blocks: [], blockedBy: [] },
    metadata: {
      model: session.model,
      provider: session.provider,
      archived: session.archived,
      inferredComplete: planWasCompleted,
      sessionTitle: session.title,
      planIndex: index + 1
    }
  }));
}

function parseCodexPlan(argumentsJson: string | undefined, sessionId: string, timestamp: string | undefined): ProgressItem[] {
  if (!argumentsJson) return [];

  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (!isObject(parsed) || !Array.isArray(parsed.plan)) return [];

    return parsed.plan
      .map((item, index): ProgressItem | null => {
        if (!isObject(item)) return null;
        const title = asString(item.step) ?? asString(item.title);
        if (!title) return null;
        return {
          id: `${sessionId}:plan:${index + 1}`,
          title,
          status: normalizePlanStatus(asString(item.status)),
          updatedAt: timestamp,
          source: "plan"
        };
      })
      .filter((item): item is ProgressItem => Boolean(item));
  } catch {
    return [];
  }
}

function normalizePlanStatus(status: string | undefined): TaskStatus {
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "blocked" || status === "failed") {
    return status;
  }
  return "unknown";
}

function normalizeCompletedPlanItemStatus(
  status: TaskStatus,
  archived: boolean,
  inferredComplete: boolean,
  completePending: boolean
): TaskStatus {
  if (status === "failed") return "failed";
  if (archived) return "completed";
  if (completePending && status === "pending") return "completed";
  if (inferredComplete && status === "in_progress") return "completed";
  return status;
}

function isMeaningfulPrompt(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("# agents.md instructions")) return false;
  if (lower.startsWith("<environment_context>")) return false;
  if (lower.includes("<instructions>") && lower.includes("</instructions>")) return false;
  if (lower.includes("memory_summary begins")) return false;
  return true;
}

function isDisplayableActivity(value: string): boolean {
  const lower = value.toLowerCase();
  return !lower.includes("agents.md") && !lower.includes("planned features");
}

function extractUserText(payload: Record<string, unknown>): string | undefined {
  if (payload.type !== "message" || payload.role !== "user" || !Array.isArray(payload.content)) {
    return undefined;
  }

  return payload.content
    .map((item) => {
      if (!isObject(item)) return "";
      return asString(item.text) ?? "";
    })
    .join(" ")
    .trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecent(value?: string): boolean {
  if (!value) return false;
  return Date.now() - Date.parse(value) < 30 * 60 * 1000;
}

function sortByUpdated<T extends { updatedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
}

function compareIso(a?: string, b?: string): number {
  return Date.parse(a ?? "1970-01-01T00:00:00.000Z") - Date.parse(b ?? "1970-01-01T00:00:00.000Z");
}

function isPlanComplete(session: ParsedCodexSession, currentProjectPath?: string): boolean {
  if (!isAfter(session.completedAt, session.planUpdatedAt)) return false;
  if (isSamePath(session.projectPath, currentProjectPath)) return true;
  return !isAfter(session.lastUserAt, session.completedAt);
}

function isAfter(value: string | undefined, reference: string | undefined): boolean {
  if (!value || !reference) return false;
  return Date.parse(value) > Date.parse(reference);
}

function isSamePath(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}
