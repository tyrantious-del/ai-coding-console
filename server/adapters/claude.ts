import path from "node:path";
import type { AgentSnapshot, TaskStatus, ViewedSession, ViewedTask } from "../../shared/types.js";
import { exists, fileTimestamp, readJsonFile, walkFiles } from "../fs-utils.js";
import { normalizeTaskStatus } from "../status.js";

interface ClaudeTaskJson {
  id?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: string;
  model?: string;
  modelName?: string;
  provider?: string;
  blocks?: string[];
  blockedBy?: string[];
}

export interface ClaudeAdapterOptions {
  claudeDir: string;
}

export async function readClaudeData(options: ClaudeAdapterOptions): Promise<AgentSnapshot> {
  const tasksDir = path.join(options.claudeDir, "tasks");
  const projectsDir = path.join(options.claudeDir, "projects");
  const sourcePaths = [tasksDir, projectsDir];

  if (!(await exists(tasksDir))) {
    return {
      health: {
        agent: "claude",
        label: "Claude",
        status: "unavailable",
        detail: "No Claude tasks directory found.",
        capabilities: ["Native task JSON"],
        sourcePaths
      },
      tasks: [],
      sessions: [],
      activity: []
    };
  }

  const files = await walkFiles(tasksDir, (filePath) => filePath.toLowerCase().endsWith(".json"));
  const tasks: ViewedTask[] = [];

  for (const filePath of files) {
    const raw = await readJsonFile<ClaudeTaskJson>(filePath);
    if (!raw) continue;
    const sessionId = path.basename(path.dirname(filePath));
    const nativeId = raw.id ?? path.basename(filePath, ".json");
    const updatedAt = await fileTimestamp(filePath);
    const title = raw.subject ?? raw.activeForm ?? raw.description ?? `Claude task ${nativeId}`;

    tasks.push({
      id: `claude:${sessionId}:${nativeId}`,
      agent: "claude",
      nativeId,
      sessionId,
      title,
      description: raw.description,
      status: normalizeTaskStatus(raw.status),
      sourcePath: filePath,
      updatedAt,
      model: raw.model ?? raw.modelName,
      provider: raw.provider,
      dependencies: {
        blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
        blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy : []
      },
      metadata: {
        activeForm: raw.activeForm,
        model: raw.model ?? raw.modelName,
        provider: raw.provider
      }
    });
  }

  const sessions = createClaudeSessions(tasks, tasksDir);
  const activity = tasks
    .filter((task) => task.status === "in_progress" || task.status === "completed" || task.status === "blocked")
    .slice(0, 100)
    .map((task) => ({
      id: `claude-activity:${task.id}`,
      agent: "claude" as const,
      kind: `task_${task.status}`,
      message: `${task.status.replace("_", " ")}: ${task.title}`,
      taskId: task.id,
      sessionId: task.sessionId,
      createdAt: task.updatedAt,
      sourcePath: task.sourcePath,
      metadata: {}
    }));

  return {
    health: {
      agent: "claude",
      label: "Claude",
      status: "ok",
      detail: `${tasks.length} task${tasks.length === 1 ? "" : "s"} across ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`,
      capabilities: ["Native task JSON", "Dependencies", "Session grouping"],
      sourcePaths
    },
    tasks: sortByUpdated(tasks),
    sessions,
    activity
  };
}

function createClaudeSessions(tasks: ViewedTask[], tasksDir: string): ViewedSession[] {
  const bySession = new Map<string, ViewedTask[]>();
  for (const task of tasks) {
    const sessionId = task.sessionId ?? "unknown";
    bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), task]);
  }

  return [...bySession.entries()]
    .map(([sessionId, sessionTasks]) => {
      const latest = sortByUpdated(sessionTasks)[0];
      const hasActive = sessionTasks.some((task) => task.status === "in_progress");
      const hasBlocked = sessionTasks.some((task) => task.status === "blocked");
      const status: TaskStatus = hasActive ? "in_progress" : hasBlocked ? "blocked" : "unknown";
      return {
        id: `claude:${sessionId}`,
        agent: "claude" as const,
        title: sessionId,
        sourcePath: path.join(tasksDir, sessionId),
        status,
        taskCount: sessionTasks.length,
        updatedAt: latest?.updatedAt,
        metadata: {}
      };
    })
    .sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
}

function sortByUpdated<T extends { updatedAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareIso(b.updatedAt, a.updatedAt));
}

function compareIso(a?: string, b?: string): number {
  return Date.parse(a ?? "1970-01-01T00:00:00.000Z") - Date.parse(b ?? "1970-01-01T00:00:00.000Z");
}
