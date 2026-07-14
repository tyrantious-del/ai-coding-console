import type { TaskStatus } from "../shared/types.js";

const statusMap = new Map<string, TaskStatus>([
  ["todo", "pending"],
  ["queued", "pending"],
  ["pending", "pending"],
  ["open", "pending"],
  ["in_progress", "in_progress"],
  ["in-progress", "in_progress"],
  ["running", "in_progress"],
  ["active", "in_progress"],
  ["working", "in_progress"],
  ["done", "completed"],
  ["complete", "completed"],
  ["completed", "completed"],
  ["merged", "completed"],
  ["closed", "completed"],
  ["blocked", "blocked"],
  ["waiting", "blocked"],
  ["failed", "failed"],
  ["error", "failed"],
  ["interrupted", "failed"]
]);

export function normalizeTaskStatus(value: unknown): TaskStatus {
  if (typeof value !== "string") return "unknown";
  return statusMap.get(value.trim().toLowerCase()) ?? "unknown";
}

export function statusFromBooleans(options: { running?: boolean; interrupted?: boolean }): TaskStatus {
  if (options.running) return "in_progress";
  if (options.interrupted) return "failed";
  return "completed";
}
