import type { ActivityEvent, AdapterHealth, TokenSummary, UserModelProvider, ViewedSession, ViewedTask } from "../shared/types";

export interface DashboardData {
  agents: AdapterHealth[];
  tasks: ViewedTask[];
  sessions: ViewedSession[];
  activity: ActivityEvent[];
  providers: UserModelProvider[];
  tokenSummary: TokenSummary;
  readOnly: boolean;
  generatedAt: string;
}

interface BaseResponse {
  readOnly: boolean;
  generatedAt: string;
}

interface AgentsResponse extends BaseResponse {
  agents: AdapterHealth[];
}

interface TasksResponse extends BaseResponse {
  tasks: ViewedTask[];
  tokenSummary: TokenSummary;
}

interface SessionsResponse extends BaseResponse {
  sessions: ViewedSession[];
}

interface ActivityResponse extends BaseResponse {
  activity: ActivityEvent[];
}

interface ProvidersResponse extends BaseResponse {
  providers: UserModelProvider[];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [agents, tasks, sessions, activity, providers] = await Promise.all([
    fetchJson<AgentsResponse>("/api/agents"),
    fetchJson<TasksResponse>("/api/tasks"),
    fetchJson<SessionsResponse>("/api/sessions"),
    fetchJson<ActivityResponse>("/api/activity"),
    fetchJson<ProvidersResponse>("/api/providers")
  ]);

  return {
    agents: agents.agents,
    tasks: tasks.tasks,
    sessions: sessions.sessions,
    activity: activity.activity,
    providers: providers.providers,
    tokenSummary: tasks.tokenSummary,
    readOnly: agents.readOnly && tasks.readOnly && sessions.readOnly && activity.readOnly && providers.readOnly,
    generatedAt: latestTimestamp([agents.generatedAt, tasks.generatedAt, sessions.generatedAt, activity.generatedAt, providers.generatedAt])
  };
}

export async function deleteTask(taskId: string): Promise<void> {
  await fetchEmpty(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetchEmpty(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

export async function addProvider(input: { provider: string; model: string; endpoint?: string; notes?: string }): Promise<void> {
  await fetchEmpty("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchEmpty(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
}

function latestTimestamp(values: string[]): string {
  return values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date().toISOString();
}
