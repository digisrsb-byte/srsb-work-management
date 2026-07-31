# SRSB HRMS Desktop Suite

Structured desktop application using Electron, React, Node.js, Express and MySQL.

## Folder structure

```text
apps/desktop   Windows desktop shell
apps/frontend  React user interface
apps/backend   Node.js API
database       MySQL schema and migrations
docs           architecture and change guides
scripts        startup and installer helpers
release        generated Windows installer
```

## First setup

1. Run `npm install` in the root folder.
2. Copy `apps/backend/.env.example` to `apps/backend/.env` and enter MySQL details.
3. Copy `apps/frontend/.env.example` to `apps/frontend/.env`.
4. Import `database/schema.sql`.
5. Run `npm --workspace apps/backend run seed`.

## Development

Open three Command Prompt windows:

```bat
npm run dev:backend
npm run dev:frontend
npm run dev:desktop
```

## Build Windows installer

```bat
npm run build:desktop
```

The installer will be created in `release`.
