# LumaTodo

LumaTodo is a local-first task app built with React, TypeScript, Vite, Tailwind CSS, Dexie, Framer Motion, lucide-react, and tsParticles.

## Features

- Create, edit, complete, restore, and permanently delete tasks.
- Browse focused views for today, all tasks, important tasks, completed tasks, overdue tasks, and trash.
- Add priority, due date, description, and tags to each task.
- Search across task titles, descriptions, and tags.
- Store data locally in IndexedDB through Dexie.
- Export and import tasks as JSON.
- Use the included Windows launcher to start the local dev server.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Local Development

Install dependencies, then start Vite:

```bash
npm install
npm run dev
```

On Windows, you can also run `启动 LumaTodo.bat` from the project folder. It starts the dev server and opens the app at `http://127.0.0.1:5173`.

## Deployment

This project is configured for GitHub Pages at:

```text
https://otterpp.github.io/luma-todo/
```

The workflow in `.github/workflows/deploy.yml` builds the app and publishes `dist` whenever changes are pushed to `main`.

## Data

Tasks are saved in the browser's IndexedDB database named `lumaTodo`. Export tasks before clearing browser storage if you want to keep a backup.
