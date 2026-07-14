import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export async function makeTempDir(label: string): Promise<string> {
  const dir = join(tmpdir(), `model-manager-${label}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeText(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data, "utf8");
}

export function createCopilotFixtureDb(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      main_repo_path TEXT NOT NULL,
      github_owner TEXT,
      github_repo TEXT,
      last_opened_at TEXT
    );
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      branch TEXT,
      name TEXT,
      port INTEGER,
      updated_at TEXT,
      session_id TEXT
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      session_type TEXT,
      mode TEXT,
      model TEXT,
      is_running INTEGER,
      was_interrupted INTEGER,
      interruption_reason TEXT,
      created_at TEXT,
      updated_at TEXT,
      agent TEXT
    );
    CREATE TABLE activity_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      session_id TEXT,
      activity_type TEXT NOT NULL,
      preview TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
  db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)").run(
    "project-1",
    "Fable",
    "C:\\Projects\\fable",
    "tyrantious-del",
    "fable",
    "2026-07-13T01:00:00.000Z"
  );
  db.prepare("INSERT INTO workspaces VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    "workspace-1",
    "project-1",
    "feature/ui-pass",
    "UI pass",
    3007,
    "2026-07-13T02:00:00.000Z",
    "session-1"
  );
  db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "session-1",
    "Tighten the UI",
    "project",
    "autopilot",
    "claude-fable-5",
    0,
    0,
    null,
    "2026-07-13T01:30:00.000Z",
    "2026-07-13T02:30:00.000Z",
    "copilot"
  );
  db.prepare("INSERT INTO activity_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    "activity-1",
    "workspace-1",
    "session-1",
    "agent_idle",
    "Finished UI pass",
    "2026-07-13T02:30:00.000Z",
    "2026-07-13T02:30:00.000Z",
    "{}"
  );
  db.close();
}
