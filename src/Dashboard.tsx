import { Activity, Archive, Bot, Clock3, Database, FileJson, Gauge, GitBranch, Loader2, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { AgentKind, TaskStatus, ViewedTask } from "../shared/types";
import type { DashboardData } from "./api";
import logoUrl from "./assets/ai-coding-console-logo-full.png";
import "./styles.css";

interface DashboardProps {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  onAddProvider: (input: { provider: string; model: string; endpoint?: string; notes?: string }) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onRefresh: () => void;
}

const boardColumns: Array<{ key: string; label: string; statuses: TaskStatus[]; dotStatus: TaskStatus }> = [
  { key: "pending", label: "Pending", statuses: ["pending"], dotStatus: "pending" },
  { key: "in_progress", label: "In Progress", statuses: ["in_progress"], dotStatus: "in_progress" },
  { key: "completed", label: "Completed", statuses: ["completed"], dotStatus: "completed" }
];
const visibleStatuses = new Set<TaskStatus>(boardColumns.flatMap((column) => column.statuses));
const agentLabels: Record<AgentKind, string> = {
  claude: "Claude",
  codex: "Codex",
  copilot: "GitHub Copilot"
};

type DateScope = "today" | "all";

export function Dashboard({ data, loading, error, onAddProvider, onDeleteSession, onDeleteTask, onRefresh }: DashboardProps) {
  const [selectedAgent, setSelectedAgent] = useState<AgentKind | "all">("all");
  const [query, setQuery] = useState("");
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [tokenBudget, setTokenBudget] = useState("4000");
  const [selectedTask, setSelectedTask] = useState<ViewedTask | null>(null);
  const [providerName, setProviderName] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [providerEndpoint, setProviderEndpoint] = useState("");
  const [providerNotes, setProviderNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);
  const scopedTasks = useMemo(
    () => tasks.filter((task) => visibleStatuses.has(task.status) && (dateScope === "all" || isSameLocalDay(task.updatedAt, data?.generatedAt))),
    [data?.generatedAt, dateScope, tasks]
  );

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopedTasks.filter((task) => {
      const agentMatch = selectedAgent === "all" || task.agent === selectedAgent;
      if (!agentMatch) return false;
      if (!needle) return true;
      const progressText = task.progressItems?.map((item) => `${item.title} ${item.status}`).join(" ");
      return [task.title, task.description, task.projectPath, task.sourcePath, task.status, task.agent, task.model, task.provider, progressText]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [query, scopedTasks, selectedAgent]);

  const scopedSessions = useMemo(
    () => (data?.sessions ?? []).filter((session) => dateScope === "all" || isSameLocalDay(session.updatedAt, data?.generatedAt)),
    [data?.generatedAt, data?.sessions, dateScope]
  );

  const scopedActivity = useMemo(
    () => (data?.activity ?? []).filter((event) => dateScope === "all" || isSameLocalDay(event.createdAt, data?.generatedAt)),
    [data?.activity, data?.generatedAt, dateScope]
  );

  const agentCounts = useMemo(() => {
    const counts: Record<AgentKind, number> = { claude: 0, codex: 0, copilot: 0 };
    for (const task of scopedTasks) {
      counts[task.agent] += 1;
    }
    return counts;
  }, [scopedTasks]);

  const staleSessions = useMemo(() => {
    const sessions = data?.sessions ?? [];
    const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sessions.filter((session) => Date.parse(session.updatedAt ?? "1970-01-01") < staleCutoff);
  }, [data?.sessions]);

  const visibleTaskTokens = useMemo(() => filteredTasks.reduce((total, task) => total + (task.tokenEstimate?.tokens ?? 0), 0), [filteredTasks]);
  const budget = Math.max(1, Number(tokenBudget) || 0);
  const budgetPercent = Math.min(100, Math.round((visibleTaskTokens / budget) * 100));
  const budgetState = budgetPercent < 70 ? "green" : budgetPercent < 95 ? "amber" : "red";

  const handleAddProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setBusyAction("provider");
    try {
      await onAddProvider({ provider: providerName, model: providerModel, endpoint: providerEndpoint, notes: providerNotes });
      setProviderName("");
      setProviderModel("");
      setProviderEndpoint("");
      setProviderNotes("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not add provider.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteTask = async (task: ViewedTask) => {
    setActionError(null);
    setBusyAction(task.id);
    try {
      await onDeleteTask(task.id);
      setSelectedTask(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete task.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    setActionError(null);
    setBusyAction(sessionId);
    try {
      await onDeleteSession(sessionId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete session.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo full" src={logoUrl} alt="AI Coding Console" />
          <div>
            <h1 className="sr-only">AI Coding Console</h1>
            <p>Model, task, and context manager for AI coding agents.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="readonly-badge">
            <ShieldCheck size={16} aria-hidden />
            Local controls
          </span>
          <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh data">
            {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <RefreshCw size={18} aria-hidden />}
          </button>
        </div>
      </header>

      <section className="agent-strip" aria-label="Agent filters">
        <button
          className={selectedAgent === "all" ? "agent-chip active" : "agent-chip"}
          type="button"
          onClick={() => setSelectedAgent("all")}
          aria-label="Filter all agents"
        >
          <Bot size={17} aria-hidden />
          All agents
          <span>{scopedTasks.length}</span>
        </button>
        {(data?.agents ?? []).map((agent) => (
          <button
            key={agent.agent}
            className={selectedAgent === agent.agent ? "agent-chip active" : "agent-chip"}
            type="button"
            onClick={() => setSelectedAgent(agent.agent)}
            title={agent.detail}
            aria-label={`Filter ${agent.label}`}
          >
            {agent.agent === "copilot" ? <Database size={17} aria-hidden /> : <FileJson size={17} aria-hidden />}
            {agent.label}
            <span className="agent-count">{agentCounts[agent.agent]}</span>
            <span className={`health ${agent.status}`}>{agent.status}</span>
          </button>
        ))}
      </section>

      <section className="toolbar">
        <label className="search-box">
          <Search size={17} aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search task, session, path, status..." />
        </label>
        <div className="timestamp">
          {data ? `Updated ${formatDateTime(data.generatedAt)}` : "Waiting for data"}
        </div>
        <div className="scope-toggle" aria-label="Date range">
          <button className={dateScope === "today" ? "active" : ""} type="button" onClick={() => setDateScope("today")}>
            Today
          </button>
          <button className={dateScope === "all" ? "active" : ""} type="button" onClick={() => setDateScope("all")}>
            All history
          </button>
        </div>
      </section>

      {error ? <div className="notice error">{error}</div> : null}
      {actionError ? <div className="notice error">{actionError}</div> : null}

      <section className="budget-panel" aria-label="Context Budget">
        <div className="budget-copy">
          <div className="section-title">
            <Gauge size={17} aria-hidden />
            Context Budget
          </div>
          <strong>{visibleTaskTokens.toLocaleString()} tokens in visible tasks</strong>
          <span>{budgetPercent < 70 ? "Within budget" : "Context load is getting tight"}</span>
        </div>
        <div className="thermometer-shell" aria-label={`${budgetPercent}% of token budget used`}>
          <span className={`thermometer-fill ${budgetState}`} style={{ width: `${budgetPercent}%` }} />
        </div>
        <div className="budget-controls">
          <label>
            Token budget
            <input
              aria-label="Token budget"
              min={1}
              step={100}
              type="number"
              value={tokenBudget}
              onChange={(event) => setTokenBudget(event.target.value)}
            />
          </label>
          <input
            aria-label="Token budget slider"
            max={16000}
            min={500}
            step={500}
            type="range"
            value={Math.min(16000, Math.max(500, budget))}
            onChange={(event) => setTokenBudget(event.target.value)}
          />
        </div>
      </section>

      <section className="grid">
        <section className="board" aria-label="Task status board">
          {boardColumns.map((column) => {
            const columnTasks = filteredTasks.filter((task) => column.statuses.includes(task.status));
            return (
              <article className="status-column" key={column.key}>
                <header>
                  <span className={`status-dot ${column.dotStatus}`} />
                  <h2>{column.label}</h2>
                  <span>{columnTasks.length}</span>
                </header>
                <div className="task-stack">
                  {columnTasks.map((task) => (
                    <button key={task.id} className="task-card" type="button" onClick={() => setSelectedTask(task)}>
                      <span className="task-card-tags">
                        <span className={`agent-mark ${task.agent}`}>{agentLabels[task.agent]}</span>
                        {task.model ? <span className="model-badge">{task.model}</span> : null}
                        {task.tokenEstimate ? <span className="token-pill">{formatTokens(task.tokenEstimate.tokens)}</span> : null}
                      </span>
                      <strong>{task.title}</strong>
                      {task.description ? <span className="task-description">{task.description}</span> : null}
                      {task.progressItems?.length ? <span className="progress-summary">{formatProgressSummary(task)}</span> : null}
                      <span className="task-meta">
                        {task.projectPath ?? compactPath(task.sourcePath)}
                        <small>{formatDateTime(task.updatedAt)}</small>
                      </span>
                    </button>
                  ))}
                  {columnTasks.length === 0 ? <div className="empty-column">No {column.label.toLowerCase()} tasks</div> : null}
                </div>
              </article>
            );
          })}
        </section>

        <aside className="side-panel" aria-label="Sessions and activity">
          <section className="panel-section">
            <div className="section-title">
              <GitBranch size={17} aria-hidden />
              Sessions
            </div>
            <div className="session-list">
              {scopedSessions.slice(0, 8).map((session) => (
                <div className="session-row" key={session.id}>
                  <span className={`status-dot ${session.status}`} />
                  <div>
                    <strong>{session.title}</strong>
                    <span>{formatSessionMeta(session)}</span>
                  </div>
                  <small>{session.taskCount}</small>
                </div>
              ))}
              {!loading && scopedSessions.length === 0 ? <div className="quiet">No sessions in the current date range.</div> : null}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Clock3 size={17} aria-hidden />
              Timeline
            </div>
            <div className="timeline-list">
              {filteredTasks.slice(0, 8).map((task) => (
                <div className="timeline-row" key={`timeline:${task.id}`}>
                  <time>{formatDateTime(task.updatedAt)}</time>
                  <div className="timeline-track" aria-hidden>
                    <span className={`timeline-bar ${task.status}`} />
                  </div>
                  <strong>{task.title}</strong>
                </div>
              ))}
              {!loading && filteredTasks.length === 0 ? <div className="quiet">No timeline entries for this filter.</div> : null}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Activity size={17} aria-hidden />
              Live Activity
            </div>
            <div className="activity-list">
              {scopedActivity.slice(0, 10).map((event) => (
                <div className="activity-row" key={event.id}>
                  <span className={`agent-pip ${event.agent}`} />
                  <div>
                    <strong>{event.kind.replace(/_/g, " ")}</strong>
                    <span>{event.message}</span>
                  </div>
                </div>
              ))}
              {!loading && scopedActivity.length === 0 ? <div className="quiet">No activity in the current date range.</div> : null}
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Archive size={17} aria-hidden />
              Stale Sessions
            </div>
            <div className="session-list">
              {staleSessions.slice(0, 6).map((session) => (
                <div className="session-row cleanable-row" key={`stale:${session.id}`}>
                  <span className={`status-dot ${session.status}`} />
                  <div>
                    <strong>{session.title}</strong>
                    <span>{formatSessionMeta(session)}</span>
                  </div>
                  <button
                    className="icon-button compact danger"
                    type="button"
                    onClick={() => void handleDeleteSession(session.id)}
                    aria-label={`Delete stale session ${session.title}`}
                    disabled={busyAction === session.id}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
              {staleSessions.length === 0 ? <div className="quiet">No stale sessions older than 7 days.</div> : null}
            </div>
          </section>

          <section className="panel-section" aria-label="Providers and models">
            <div className="section-title">
              <Plus size={17} aria-hidden />
              Providers & Models
            </div>
            <form className="provider-form" onSubmit={(event) => void handleAddProvider(event)}>
              <input aria-label="Provider name" value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="Provider" required />
              <input aria-label="Model name" value={providerModel} onChange={(event) => setProviderModel(event.target.value)} placeholder="Model" required />
              <input aria-label="Provider endpoint" value={providerEndpoint} onChange={(event) => setProviderEndpoint(event.target.value)} placeholder="Endpoint (optional)" />
              <input aria-label="Provider notes" value={providerNotes} onChange={(event) => setProviderNotes(event.target.value)} placeholder="Notes (optional)" />
              <button type="submit" disabled={busyAction === "provider"}>
                <Plus size={15} aria-hidden />
                Add model
              </button>
            </form>
            <div className="provider-list">
              {(data?.providers ?? []).map((provider) => (
                <div className="provider-row" key={provider.id}>
                  <strong>{provider.model}</strong>
                  <span>{provider.provider}{provider.endpoint ? ` - ${provider.endpoint}` : ""}</span>
                  {provider.notes ? <small>{provider.notes}</small> : null}
                </div>
              ))}
              {(data?.providers ?? []).length === 0 ? <div className="quiet">No user-added models yet.</div> : null}
            </div>
          </section>
        </aside>
      </section>

      {selectedTask ? (
        <TaskDialog
          busy={busyAction === selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDelete={() => void handleDeleteTask(selectedTask)}
        />
      ) : null}
    </main>
  );
}

function TaskDialog({ busy, task, onClose, onDelete }: { busy: boolean; task: ViewedTask; onClose: () => void; onDelete: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="detail-dialog" role="dialog" aria-modal="true" aria-label={`${task.title} details`} onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className={`agent-mark ${task.agent}`}>{agentLabels[task.agent]}</span>
            <h2>{task.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close task detail">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="dialog-actions">
          <button className="danger-button" type="button" onClick={onDelete} disabled={busy}>
            <Trash2 size={16} aria-hidden />
            Delete from viewer
          </button>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Model</dt>
            <dd>{task.model ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabel(task.status)}</dd>
          </div>
          <div>
            <dt>Native ID</dt>
            <dd>{task.nativeId}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{task.sessionId ?? "None"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatDateTime(task.updatedAt)}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{task.tokenEstimate ? formatTokens(task.tokenEstimate.tokens) : "Unknown"}</dd>
          </div>
          <div className="wide">
            <dt>Source</dt>
            <dd>{task.sourcePath}</dd>
          </div>
          {task.projectPath ? (
            <div className="wide">
              <dt>Project</dt>
              <dd>{task.projectPath}</dd>
            </div>
          ) : null}
          {task.description ? (
            <div className="wide">
              <dt>Description</dt>
              <dd>{task.description}</dd>
            </div>
          ) : null}
        </dl>
        {task.progressItems?.length ? (
          <section className="progress-panel" aria-label="Progress">
            <h3>Progress</h3>
            <div className="progress-list">
              {task.progressItems.map((item) => (
                <div className="progress-row" key={item.id}>
                  <span className={`status-dot ${item.status}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {statusLabel(item.status)}
                      {item.updatedAt ? ` - ${formatDateTime(item.updatedAt)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {task.tokenEstimate?.breakdown?.length ? (
          <section className="token-breakdown-panel" aria-label="Token Breakdown">
            <h3>Token Breakdown</h3>
            <div className="token-breakdown-list">
              {task.tokenEstimate.breakdown.map((part) => (
                <div className="token-breakdown-row" key={part.label}>
                  <span>{part.label}</span>
                  <strong>{formatTokens(part.tokens)}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function formatProgressSummary(task: ViewedTask): string {
  const items = task.progressItems ?? [];
  const planIndex = typeof task.metadata.planIndex === "number" ? task.metadata.planIndex : undefined;
  if (planIndex && items.length > 0) {
    return `Plan step ${planIndex} of ${items.length}`;
  }
  const completed = items.filter((item) => item.status === "completed").length;
  const active = items.find((item) => item.status === "in_progress");
  const suffix = active ? ` - ${active.title}` : "";
  return `${completed}/${items.length} done${suffix}`;
}

function formatTokens(tokens: number): string {
  return `${tokens.toLocaleString()} token${tokens === 1 ? "" : "s"}`;
}

function formatSessionMeta(session: { model?: string; projectPath?: string; sourcePath: string }): string {
  const pathLabel = session.projectPath ?? compactPath(session.sourcePath);
  return session.model ? `${session.model} - ${pathLabel}` : pathLabel;
}

function statusLabel(status: TaskStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value?: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function compactPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : value;
}

function isSameLocalDay(value: string | undefined, reference: string | undefined): boolean {
  if (!value) return false;
  const candidate = new Date(value);
  const base = new Date(reference ?? Date.now());
  if (Number.isNaN(candidate.getTime()) || Number.isNaN(base.getTime())) return false;
  return candidate.getFullYear() === base.getFullYear() && candidate.getMonth() === base.getMonth() && candidate.getDate() === base.getDate();
}
