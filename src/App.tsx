import { useCallback, useEffect, useRef, useState } from "react";
import { addProvider, deleteSession, deleteTask, fetchDashboardData, type DashboardData } from "./api";
import { Dashboard } from "./Dashboard";

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      setError(null);
      const next = await fetchDashboardData();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load AI Coding Console data.");
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      await deleteTask(taskId);
      await refresh();
    },
    [refresh]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      await refresh();
    },
    [refresh]
  );

  const handleAddProvider = useCallback(
    async (input: { provider: string; model: string; endpoint?: string; notes?: string }) => {
      await addProvider(input);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let events: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      events = new EventSource("/api/events");
      events.addEventListener("refresh", () => {
        void refresh();
      });
      events.onerror = () => {
        events?.close();
        events = null;
        reconnectTimer = setTimeout(connect, 1000);
      };
    };
    connect();
    const pollTimer = setInterval(() => {
      void refresh();
    }, 2000);
    return () => {
      events?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
    };
  }, [refresh]);

  return (
    <Dashboard
      data={data}
      loading={loading}
      error={error}
      onAddProvider={handleAddProvider}
      onDeleteSession={handleDeleteSession}
      onDeleteTask={handleDeleteTask}
      onRefresh={refresh}
    />
  );
}
