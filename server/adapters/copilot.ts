import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ActivityEvent, AgentSnapshot, ViewedSession, ViewedTask } from "../../shared/types.js";
import { exists } from "../fs-utils.js";
import { statusFromBooleans } from "../status.js";

interface CopilotAdapterOptions {
  copilotDir: string;
}

interface CopilotRow {
  id: string;
  title: string | null;
  session_type: string | null;
  mode: string | null;
  model: string | null;
  is_running: number | null;
  was_interrupted: number | null;
  interruption_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  agent: string | null;
  workspace_id: string | null;
  branch: string | null;
  workspace_name: string | null;
  port: number | null;
  project_name: string | null;
  main_repo_path: string | null;
  github_owner: string | null;
  github_repo: string | null;
}

interface ActivityRow {
  id: string;
  workspace_id: string | null;
  session_id: string | null;
  activity_type: string;
  preview: string;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export async function readCopilotData(options: CopilotAdapterOptions): Promise<AgentSnapshot> {
  const dataDb = path.join(options.copilotDir, "data.db");
  const sessionStoreDb = path.join(options.copilotDir, "session-store.db");
  const sourcePaths = [dataDb, sessionStoreDb];

  if (!(await exists(dataDb))) {
    return {
      health: {
        agent: "copilot",
        label: "GitHub Copilot",
        status: "unavailable",
        detail: "No local Copilot data.db found.",
        capabilities: ["Local SQLite read-only"],
        sourcePaths
      },
      tasks: [],
      sessions: [],
      activity: []
    };
  }

  try {
    const db = new DatabaseSync(dataDb, { readOnly: true });
    try {
      const rows = queryRows<CopilotRow>(db, `
        SELECT
          s.id,
          s.title,
          s.session_type,
          s.mode,
          s.model,
          s.is_running,
          s.was_interrupted,
          s.interruption_reason,
          s.created_at,
          s.updated_at,
          s.agent,
          w.id AS workspace_id,
          w.branch,
          w.name AS workspace_name,
          w.port,
          p.name AS project_name,
          p.main_repo_path,
          p.github_owner,
          p.github_repo
        FROM sessions s
        LEFT JOIN workspaces w ON w.session_id = s.id
        LEFT JOIN projects p ON p.id = w.project_id
        ORDER BY datetime(s.updated_at) DESC
        LIMIT 150
      `);
      const activities = queryRows<ActivityRow>(db, `
        SELECT id, workspace_id, session_id, activity_type, preview, created_at, updated_at, metadata_json
        FROM activity_items
        ORDER BY datetime(created_at) DESC
        LIMIT 150
      `);

      const tasks: ViewedTask[] = rows.map((row) => {
        const status = statusFromBooleans({
          running: Boolean(row.is_running),
          interrupted: Boolean(row.was_interrupted)
        });
        return {
          id: `copilot:${row.id}`,
          agent: "copilot",
          nativeId: row.id,
          sessionId: row.id,
          title: row.title || row.workspace_name || row.project_name || row.id,
          description: row.interruption_reason ?? undefined,
          status,
          projectPath: row.main_repo_path ?? undefined,
          sourcePath: dataDb,
          createdAt: row.created_at ?? undefined,
          updatedAt: row.updated_at ?? undefined,
          model: row.model ?? undefined,
          dependencies: { blocks: [], blockedBy: [] },
          metadata: {
            mode: row.mode,
            model: row.model,
            workspaceId: row.workspace_id,
            branch: row.branch,
            port: row.port,
            repository: row.github_owner && row.github_repo ? `${row.github_owner}/${row.github_repo}` : undefined
          }
        };
      });

      const sessions: ViewedSession[] = rows.map((row) => ({
        id: `copilot:${row.id}`,
        agent: "copilot",
        title: row.title || row.workspace_name || row.project_name || row.id,
        projectPath: row.main_repo_path ?? undefined,
        sourcePath: dataDb,
        status: statusFromBooleans({
          running: Boolean(row.is_running),
          interrupted: Boolean(row.was_interrupted)
        }),
        taskCount: 1,
        updatedAt: row.updated_at ?? undefined,
        model: row.model ?? undefined,
        metadata: {
          mode: row.mode,
          model: row.model,
          workspaceId: row.workspace_id,
          branch: row.branch,
          port: row.port
        }
      }));

      const activity: ActivityEvent[] = activities.map((row) => ({
        id: `copilot-activity:${row.id}`,
        agent: "copilot",
        kind: row.activity_type,
        message: row.preview || row.activity_type,
        sessionId: row.session_id ?? undefined,
        createdAt: row.created_at,
        sourcePath: dataDb,
        metadata: parseMetadata(row.metadata_json)
      }));

      const hasSessionStore = await exists(sessionStoreDb);
      return {
        health: {
          agent: "copilot",
          label: "GitHub Copilot",
          status: hasSessionStore ? "ok" : "partial",
          detail: `${tasks.length} local session${tasks.length === 1 ? "" : "s"} from Copilot SQLite.`,
          capabilities: ["Local SQLite read-only", "Projects", "Workspaces", "Activity"],
          sourcePaths
        },
        tasks,
        sessions,
        activity
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      health: {
        agent: "copilot",
        label: "GitHub Copilot",
        status: "error",
        detail: error instanceof Error ? error.message : "Could not read Copilot SQLite data.",
        capabilities: ["Local SQLite read-only"],
        sourcePaths
      },
      tasks: [],
      sessions: [],
      activity: []
    };
  }
}

function queryRows<T>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
