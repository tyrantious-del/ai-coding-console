<img width="1600" height="520" alt="image" src="https://github.com/user-attachments/assets/6f0c049b-8558-4bbc-a7c6-07f7953ab517" />

AI Coding Console is a local dashboard for keeping track of AI coding agent work across Claude, Codex, and GitHub Copilot. It scans local task/session stores, normalizes them into one Kanban-style view, estimates context size, and lets you keep a small local registry of providers and models you want to use.

<img width="1181" height="901" alt="image" src="https://github.com/user-attachments/assets/7f11099d-568d-4483-8e14-d0cd932bad9f" />

The app is local-first. It reads the native agent stores on your machine and keeps its own viewer-only state for cleanup actions such as hiding tasks or stale sessions. It does not delete or mutate Claude, Codex, or Copilot source files.

## Why

AI coding work tends to get scattered across several tools:

- Claude task JSON under `.claude`
- Codex JSONL sessions under `.codex`
- GitHub Copilot local SQLite stores under `.copilot`
- Model names, providers, context size, and task progress all shown differently

AI Coding Console pulls those signals into one place so you can see what is active, what finished, which model was used, and how much visible context you are carrying.

## Features

- Unified task board for Claude, Codex, and GitHub Copilot
- Today and All history scopes
- Agent filters and search
- Individual Codex plan steps rendered as task cards
- Model badges on task cards and session rows
- Session and activity side rail
- Stale session cleanup with trash buttons
- Viewer-local task delete/hide action
- User-managed Providers & Models registry
- Approximate token estimates using `Math.ceil(characterCount / 4)`
- Context Budget thermometer with adjustable budget
- Detail drawer with source paths, progress items, and token breakdowns
- Server-sent events plus polling fallback for fast local refresh

## Attribution

AI Coding Console was inspired by [tyrantious-del/claude-task-viewer](https://github.com/tyrantious-del/claude-task-viewer). That project established the useful idea of a local dashboard for Claude task visibility. AI Coding Console builds on that concept by expanding the view across Claude, Codex, and GitHub Copilot, adding context budgeting, model metadata, provider/model tracking, and viewer-local cleanup controls.

This project does not copy the single-file implementation from `claude-task-viewer`; it uses a TypeScript Node API plus React/Vite frontend and separate read-only adapters.

## Safety Model

AI Coding Console has two kinds of data access:

- Native agent stores are read-only.
- Viewer controls write only to `.ai-coding-console/state.json`.

Delete/trash actions hide items from this dashboard. They do not delete Claude task files, Codex JSONL logs, Copilot SQLite rows, or any project source files.

## Data Sources

Default paths on Windows:

- Claude: `%USERPROFILE%\.claude\tasks` and `%USERPROFILE%\.claude\projects`
- Codex: `%USERPROFILE%\.codex\sessions` and `%USERPROFILE%\.codex\archived_sessions`
- GitHub Copilot: `%USERPROFILE%\.copilot\data.db` and `%USERPROFILE%\.copilot\session-store.db`

The app also stores viewer-only state at:

```text
.ai-coding-console/state.json
```

That state file is gitignored by default.

## Requirements

- Node.js 24 or newer
- npm
- Local Claude, Codex, or GitHub Copilot data if you want real tasks to appear

## Run Locally

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

The API listens on:

```text
http://127.0.0.1:3456
```

## API

Read endpoints:

- `GET /api/health`
- `GET /api/agents`
- `GET /api/tasks`
- `GET /api/sessions`
- `GET /api/activity`
- `GET /api/providers`
- `GET /api/events`

Viewer-local write endpoints:

- `POST /api/providers`
- `DELETE /api/tasks/:taskId`
- `DELETE /api/sessions/:sessionId`

These write endpoints only update the local AI Coding Console state file.

## Path Overrides

Use environment variables for alternate local data stores or tests:

```powershell
$env:MODEL_MANAGER_CLAUDE_DIR="C:\path\to\.claude"
$env:MODEL_MANAGER_CODEX_DIR="C:\path\to\.codex"
$env:MODEL_MANAGER_COPILOT_DIR="C:\path\to\.copilot"
$env:AI_CODING_CONSOLE_STATE="C:\path\to\state.json"
$env:MODEL_MANAGER_WATCH="0"
```

## Verification

```powershell
npm test
npm run lint
npm run build
```

## Project Structure

```text
server/     Express API, SSE, local-state, and read-only adapters
shared/     Normalized shared types
src/        React/Vite dashboard
tests/      Adapter, API, token, and UI tests
```

## Roadmap

- Exact tokenizer support per model family
- Project/branch-aware task scopes
- Better stale-session grouping
- Import/export for provider and model presets
- Optional screenshots and browser smoke reports

## License

MIT
