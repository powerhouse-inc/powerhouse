---
title: Todo List
---

# Todo List (reference implementation)

The Todo List is the worked example used throughout the Build track. Rather than repeat it here, this page points you to the finished code so you can clone, run, and compare against your own work.

You build the Todo List step by step in two places:

- [**Manual Todo tutorial**](/academy/Build/ManualTodoTutorial/ExploreDemoPackage) — build a basic Todo package by hand: document model, reducers, tests, and editor.
- [**Document Model Creation (Mastery Track)**](/academy/Build/DocumentModelCreation/WhatIsADocumentModel) — the theory behind those steps, plus the advanced extensions: computed `stats`, the [Drive Explorer](/academy/Build/BuildingUserExperiences/BuildingADriveExplorer), and a shared stats component.

## The reference repository

The full implementation lives at [powerhouse-inc/todo-tutorial](https://github.com/powerhouse-inc/todo-tutorial). It uses one branch per step so you can start anywhere or compare your work:

- Each step has a starting branch (`step-1-…`) and a completed branch (`step-1-complete-…`).
- The `step-1-` branch matches what `ph init todo-tutorial` produces.
- To compare your work against a checkpoint: `git diff your-branch step-1-complete-…`, or use "compare with branch" in the GitHub UI.

Fork the repository (uncheck "copy the main branch only" so you keep every step branch), `git clone` your fork, then `pnpm install`.

## What the finished package demonstrates

- A `TodoList` document model with state schema and operations
- Reducer operation handlers and their unit tests
- A document editor wired to the model's operations
- A custom Drive Explorer for managing many Todo Lists in a drive
- A shared component that displays Todo List stats in both the editor and the Drive Explorer
