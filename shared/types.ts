export type AgentKind = "claude" | "codex" | "copilot";

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked" | "failed" | "unknown";

export type AdapterHealthStatus = "ok" | "partial" | "unavailable" | "error";

export interface AdapterHealth {
  agent: AgentKind;
  label: string;
  status: AdapterHealthStatus;
  detail: string;
  capabilities: string[];
  sourcePaths: string[];
}

export interface TaskDependencies {
  blocks: string[];
  blockedBy: string[];
}

export interface ProgressItem {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt?: string;
  source: "native" | "plan" | "activity";
}

export type TokenEstimateMethod = "approx_chars_div_4";

export interface TokenEstimate {
  tokens: number;
  characters: number;
  method: TokenEstimateMethod;
  label: string;
  breakdown?: TokenEstimate[];
}

export interface TokenSummary {
  method: TokenEstimateMethod;
  taskTokens: number;
  sessionTokens: number;
  totalTokens: number;
}

export interface UserModelProvider {
  id: string;
  provider: string;
  model: string;
  endpoint?: string;
  notes?: string;
  createdAt: string;
}

export interface ViewedTask {
  id: string;
  agent: AgentKind;
  nativeId: string;
  sessionId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  projectPath?: string;
  sourcePath: string;
  createdAt?: string;
  updatedAt?: string;
  model?: string;
  provider?: string;
  progressItems?: ProgressItem[];
  tokenEstimate?: TokenEstimate;
  dependencies: TaskDependencies;
  metadata: Record<string, unknown>;
}

export interface ViewedSession {
  id: string;
  agent: AgentKind;
  title: string;
  projectPath?: string;
  sourcePath: string;
  status: TaskStatus;
  taskCount: number;
  updatedAt?: string;
  model?: string;
  provider?: string;
  progressItems?: ProgressItem[];
  tokenEstimate?: TokenEstimate;
  metadata: Record<string, unknown>;
}

export interface ActivityEvent {
  id: string;
  agent: AgentKind;
  kind: string;
  message: string;
  taskId?: string;
  sessionId?: string;
  createdAt?: string;
  sourcePath: string;
  metadata: Record<string, unknown>;
}

export interface AgentSnapshot {
  health: AdapterHealth;
  tasks: ViewedTask[];
  sessions: ViewedSession[];
  activity: ActivityEvent[];
}

export interface ViewerSnapshot {
  agents: AdapterHealth[];
  tasks: ViewedTask[];
  sessions: ViewedSession[];
  activity: ActivityEvent[];
  providers: UserModelProvider[];
  tokenSummary: TokenSummary;
  readOnly: boolean;
  generatedAt: string;
}
