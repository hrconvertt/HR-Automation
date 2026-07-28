---
description: Audit recent changes across all 4 roles (HR_ADMIN / MANAGER / EMPLOYEE / EXECUTIVE) for access control, data leaks, overlapping functionality, and typecheck/build errors. Fixes issues found and pushes to main.
argument-hint: [feature-name or commit-range, optional]
---

Dispatch the `role-auditor` subagent to walk through recent changes across all 4 roles in the Convertt HR app.

If `$ARGUMENTS` is provided, audit that specific feature/scope.
If not provided, audit the most recent commit on `main`.

The auditor will:
1. Read recent git log + diff to understand what changed
2. Walk through every affected module × every role
3. Check role-based access control, data leak surfaces, salary confidentiality
4. Find duplicate/overlapping sidebar entries or modules
5. Run `npx tsc --noEmit` + `npx prisma generate` and fix any errors
6. If fixes were needed: commit + push to `main` (Vercel auto-deploys)
7. Report findings in a concise table

Use the `Agent` tool with `subagent_type: 'role-auditor'` and pass the scope as the prompt. Wait for the result and surface the report to the user.
