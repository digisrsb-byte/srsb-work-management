# How to change the application safely

## Change colours

Edit only:

```text
frontend/src/styles/theme.css
```

## Change logo

Replace:

```text
frontend/public/company-logo.png
```

Keep the same filename, or update `BrandLogo.jsx`.

## Add a new page

1. Create a page in `frontend/src/pages`.
2. Register it in `frontend/src/routes/AppRoutes.jsx`.
3. Add a menu item in `frontend/src/config/navigation.js`.
4. Create an API service function if the page needs backend data.

## Add a new backend module

Recommended files:

```text
backend/src/controllers/<module>Controller.js
backend/src/services/<module>Service.js
backend/src/routes/<module>Routes.js
backend/src/validators/<module>Validator.js
```

Register its route in `backend/src/routes/index.js`.

## Change database structure

Never delete the live database. Add a migration such as:

```text
database/migrations/002_add_payroll.sql
```

Record every database update in a new numbered migration.

## Release process

1. Work in a feature branch.
2. Test against a copy of the database.
3. Back up the live database.
4. Apply the migration.
5. Deploy backend changes.
6. Deploy frontend changes.
7. Verify login, permissions and reports.
