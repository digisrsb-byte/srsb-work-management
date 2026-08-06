# SRSB Work Management — Start Here

This project uses React/Vite, Node.js/Express, MySQL and Electron.

## Windows requirements

- Node.js 20 or newer
- Git
- A MySQL database for local development
- Visual Studio Code (recommended)

## Install dependencies

```bat
npm install
```

## Local environment

Copy:

```text
apps\backend\.env.example
```

to:

```text
apps\backend\.env
```

Enter local/test database and JWT values. Never commit `.env` files or production Railway secrets.

## Run locally

Use three Command Prompt windows:

```bat
npm run dev:backend
npm run dev:frontend
npm run dev:desktop
```

## Validate version 1.2.0

```bat
npm run validate:v120
```

## Build Windows installer

```bat
Build-SRSB-v1.2.0.bat
```

## Production rules

- Work in a feature branch and merge through review.
- Push approved backend code to the existing repository.
- Railway deploys from the existing `main` branch.
- Do not share production passwords, database URLs or API tokens.
- Do not run `database/schema.sql` on Railway.
- Configure invoice bank details inside the Super Admin Invoice Settings page.
