# SRSB Work Management Desktop Application — Start Here

This source package uses React, Vite, Node.js, Express, MySQL and Electron.
It already includes role-based login, dashboards, task/work progress, reports and database-connected charts.

## 1. Requirements for Windows

Install:
- Node.js 20 LTS or newer
- MySQL 8
- MySQL Workbench (recommended)
- Visual Studio Code

## 2. Database setup

1. Open MySQL Workbench.
2. Open `database/schema.sql`.
3. Run the complete script. It creates the `srsb_hrms` database.

## 3. Configure the backend

Open `apps/backend/.env` and set your MySQL password:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=srsb_hrms
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=8h
CORS_ORIGIN=http://localhost:5173
```

## 4. Install dependencies

Open Command Prompt inside the project folder and run:

```bat
npm install
```

## 5. Create the first Super Admin

```bat
npm --workspace apps/backend run seed
```

Demo login created by the seed command:
- Employee ID: `SRSB001`
- Password: `Admin@123`

Change this password after first login.

## 6. Run the desktop application during development

Double-click:

```text
scripts\start-development.bat
```

It starts the backend, frontend and Electron desktop window.

You can also run them manually in three Command Prompt windows:

```bat
npm run dev:backend
npm run dev:frontend
npm run dev:desktop
```

## 7. Build the Windows installer

```bat
npm run build:desktop
```

The installer will be generated in the `release` folder.

## Main MVP features

- Login and logout
- JWT authentication
- Role-based access
- Super Admin/Admin and Employee dashboards
- Employee/user management
- Work/task assignment
- Progress percentage and status updates
- Due dates and priorities
- Work reports
- PDF report export
- Charts connected to MySQL API data
- Electron Windows desktop shell

## Important

The desktop interface still requires the Node.js backend and MySQL database to be running. For the first internal SRSB version, run the backend locally on the office computer/server. A later production version can start the backend automatically or connect to a hosted API.


## Final release changes
- SRSB logo replaced with the supplied logo.
- Finance disabled for this release.
- Login fields are empty.
- Email OTP password reset is ready; configure SMTP in `apps/backend/.env`.
- See `EMAIL_AND_HOSTING_SETUP.md`.
