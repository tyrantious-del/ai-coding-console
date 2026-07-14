import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar, { type FSWatcher } from "chokidar";
import cors from "cors";
import express, { type Express, type Response } from "express";
import type { AppConfig } from "./config.js";
import { createConfig } from "./config.js";
import { exists } from "./fs-utils.js";
import { addUserModelProvider, deleteSessionFromViewer, deleteTaskFromViewer, readConsoleState } from "./local-state.js";
import { readViewerSnapshot } from "./snapshot.js";

type SseClient = Response;

export function createApp(overrides: Partial<AppConfig> = {}): Express {
  const config = createConfig(overrides);
  const app = express();
  const clients = new Set<SseClient>();
  let debounce: NodeJS.Timeout | null = null;

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", async (_req, res, next) => {
    try {
      const snapshot = await readViewerSnapshot(config);
      res.json({
        ok: true,
        readOnly: false,
        generatedAt: snapshot.generatedAt,
        agents: snapshot.agents,
        providers: snapshot.providers,
        tokenSummary: snapshot.tokenSummary
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agents", async (_req, res, next) => {
    try {
      const snapshot = await readViewerSnapshot(config);
      res.json({ agents: snapshot.agents, tokenSummary: snapshot.tokenSummary, readOnly: false, generatedAt: snapshot.generatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", async (_req, res, next) => {
    try {
      const snapshot = await readViewerSnapshot(config);
      res.json({ tasks: snapshot.tasks, tokenSummary: snapshot.tokenSummary, readOnly: false, generatedAt: snapshot.generatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions", async (_req, res, next) => {
    try {
      const snapshot = await readViewerSnapshot(config);
      res.json({ sessions: snapshot.sessions, tokenSummary: snapshot.tokenSummary, readOnly: false, generatedAt: snapshot.generatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/activity", async (_req, res, next) => {
    try {
      const snapshot = await readViewerSnapshot(config);
      res.json({ activity: snapshot.activity, tokenSummary: snapshot.tokenSummary, readOnly: false, generatedAt: snapshot.generatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", async (_req, res) => {
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ readOnly: false, at: new Date().toISOString() })}\n\n`);
    clients.add(res);
    res.on("close", () => {
      clients.delete(res);
    });
  });

  app.get("/api/providers", async (_req, res, next) => {
    try {
      const state = await readConsoleState(config.statePath);
      res.json({ providers: state.providers, readOnly: false, generatedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/providers", async (req, res, next) => {
    try {
      const provider = await addUserModelProvider(config.statePath, {
        provider: parseString(req.body?.provider) ?? "",
        model: parseString(req.body?.model) ?? "",
        endpoint: parseString(req.body?.endpoint),
        notes: parseString(req.body?.notes)
      });
      broadcastRefresh(clients);
      res.status(201).json({ provider });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId", async (req, res, next) => {
    try {
      await deleteTaskFromViewer(config.statePath, req.params.taskId);
      broadcastRefresh(clients);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/sessions/:sessionId", async (req, res, next) => {
    try {
      await deleteSessionFromViewer(config.statePath, req.params.sessionId);
      broadcastRefresh(clients);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  if (config.watch) {
    void setupWatcher(config).then((createdWatcher) => {
      createdWatcher?.on("all", () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => broadcastRefresh(clients), 300);
      });
    });
  }

  serveStaticApp(app);

  return app;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function setupWatcher(config: AppConfig): Promise<FSWatcher | null> {
  const roots = [
    path.join(config.claudeDir, "tasks"),
    path.join(config.claudeDir, "projects"),
    path.join(config.codexDir, "sessions"),
    path.join(config.codexDir, "archived_sessions"),
    path.join(config.copilotDir, "data.db"),
    path.join(config.copilotDir, "session-store.db")
  ];
  const existingRoots = [];
  for (const root of roots) {
    if (await exists(root)) existingRoots.push(root);
  }
  if (existingRoots.length === 0) return null;
  return chokidar.watch(existingRoots, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
  });
}

function broadcastRefresh(clients: Set<SseClient>): void {
  const payload = JSON.stringify({ type: "refresh", at: new Date().toISOString() });
  for (const client of clients) {
    client.write(`event: refresh\ndata: ${payload}\n\n`);
  }
}

function serveStaticApp(app: Express): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(here, "..", "..", "dist");
  app.use(express.static(staticDir));
  app.get(/^\/(?!api).*/, (_req, res, next) => {
    if (_req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"), (error) => {
      if (error) next();
    });
  });
}
