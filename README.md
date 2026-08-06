# SRSB Work Management

Current source release: **1.2.0**

Read [README-V1.2.0.md](README-V1.2.0.md) before deployment.

Windows build:

```text
Build-SRSB-v1.2.0.bat
```

Expected installer:

```text
release\SRSB-Work-Management-Setup-1.2.0.exe
```

The existing GitHub repository, Railway backend and Railway MySQL database are reused. Production database changes are applied by the safe additive backend migration; never run `database/schema.sql` on Railway.
