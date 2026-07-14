import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { UserModelProvider } from "../shared/types.js";

export interface ConsoleState {
  deletedTaskIds: string[];
  deletedSessionIds: string[];
  providers: UserModelProvider[];
}

export interface ProviderInput {
  provider: string;
  model: string;
  endpoint?: string;
  notes?: string;
}

const emptyState: ConsoleState = {
  deletedTaskIds: [],
  deletedSessionIds: [],
  providers: []
};

export async function readConsoleState(statePath: string): Promise<ConsoleState> {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<ConsoleState>;
    return {
      deletedTaskIds: Array.isArray(parsed.deletedTaskIds) ? parsed.deletedTaskIds.filter(isString) : [],
      deletedSessionIds: Array.isArray(parsed.deletedSessionIds) ? parsed.deletedSessionIds.filter(isString) : [],
      providers: Array.isArray(parsed.providers) ? parsed.providers.filter(isUserModelProvider) : []
    };
  } catch {
    return { ...emptyState };
  }
}

export async function deleteTaskFromViewer(statePath: string, taskId: string): Promise<ConsoleState> {
  const state = await readConsoleState(statePath);
  if (!state.deletedTaskIds.includes(taskId)) {
    state.deletedTaskIds = [...state.deletedTaskIds, taskId];
    await writeConsoleState(statePath, state);
  }
  return state;
}

export async function deleteSessionFromViewer(statePath: string, sessionId: string): Promise<ConsoleState> {
  const state = await readConsoleState(statePath);
  if (!state.deletedSessionIds.includes(sessionId)) {
    state.deletedSessionIds = [...state.deletedSessionIds, sessionId];
    await writeConsoleState(statePath, state);
  }
  return state;
}

export async function addUserModelProvider(statePath: string, input: ProviderInput): Promise<UserModelProvider> {
  const provider = input.provider.trim();
  const model = input.model.trim();
  if (!provider || !model) {
    throw new Error("Provider and model are required.");
  }

  const state = await readConsoleState(statePath);
  const next: UserModelProvider = {
    id: randomUUID(),
    provider,
    model,
    endpoint: cleanOptional(input.endpoint),
    notes: cleanOptional(input.notes),
    createdAt: new Date().toISOString()
  };
  state.providers = [next, ...state.providers];
  await writeConsoleState(statePath, state);
  return next;
}

async function writeConsoleState(statePath: string, state: ConsoleState): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUserModelProvider(value: unknown): value is UserModelProvider {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<UserModelProvider>;
  return isString(record.id) && isString(record.provider) && isString(record.model) && isString(record.createdAt);
}
