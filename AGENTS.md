# Guidance for AI Agents

This file is for any AI coding agent working in this repository. Keep changes focused, preserve existing behavior unless the task explicitly asks for a change, and prefer the project's established patterns over new abstractions.

## Project Overview

Vivliostyle CLI is a TypeScript ESM command-line tool for creating and previewing publications, especially PDF/EPUB/web publication output through Vivliostyle. The package is managed with pnpm workspaces.

Key areas:

- `src/cli.ts` and `src/commands/`: command-line entry points and option parsing.
- `src/core/`: core command workflows.
- `src/config/`: configuration loading, resolving, merging, and schema handling.
- `src/output/`: PDF, EPUB, webbook, image, and post-processing output logic.
- `src/processor/`: Markdown, HTML, theme, asset, and compile processing.
- `src/vite/` and `src/vite-adapter.ts`: Vite integration and preview/build server plugins.
- `packages/create-book/`: `create-book` workspace package.
- `docs/` and `docs/ja/`: English and Japanese user documentation.
- `examples/`, `templates/`, and `tests/fixtures/`: sample projects, project templates, and test fixtures.

## Development Commands

Use pnpm. The repository declares `pnpm@10.28.2` and requires Node `>=22.12.0`.

- Install dependencies: `pnpm install`
- Build everything: `pnpm build` (bundles the CLI and create-book with tsdown, then builds docs; it does not type-check)
- Build the CLI only: `pnpm build:cli`
- Typecheck: `pnpm typecheck` (uses tsgo, the TypeScript native preview; run it separately because the build no longer type-checks)
- Run tests: `pnpm test`
- Watch CLI sources and typecheck: `pnpm dev`
- Build docs generated from the code: `pnpm build:docs`
- Generate publication schema types: `pnpm generate:schema`

For narrower validation, prefer targeted Vitest runs, for example:

- `pnpm vitest run tests/config.test.ts`
- `pnpm vitest run tests/pdf.test.ts`

## Coding Conventions

- The codebase uses TypeScript and ESM. Formatting is handled by oxfmt and linting by oxlint (the oxc toolchain).
- Follow `.oxfmtrc.json`: single quotes, semicolons, trailing commas, and arrow parens. Run `pnpm fmt` to format and `pnpm lint` to lint (`pnpm lint:fix` to auto-fix).
- Keep imports and module boundaries consistent with nearby files.
- Avoid broad refactors while fixing localized behavior.
- Prefer typed helpers and existing config/schema utilities over ad hoc object or string manipulation.
- Snapshot tests live under `tests/__snapshots__`; update snapshots only when the output change is intentional.

## Testing Notes

- Vitest includes `**/src/__tests__/*.+(ts|tsx|js)` and `**/tests/*.test.(ts|tsx|js)`.
- Coverage is collected for `schemas/**` and `src/**`.
- Tests set `NO_COLOR=true`, clear mocks, and use a global cleanup setup in `tests/global-setup/clean.ts`.
- On Linux, Vitest uses the `forks` pool because native dependencies can segfault in thread mode.

## Documentation and Examples

- Keep English and Japanese docs aligned when changing user-facing behavior.
- Update examples or templates when CLI behavior, generated config, or recommended project structure changes.
- Do not regenerate docs, schemas, or browser version data unless the task requires it; generated diffs can be large.

## Change Safety

- Check the current worktree before editing and avoid overwriting unrelated user changes.
- When changing command behavior, consider parser files, command implementation, docs, examples, and tests together.
- When changing output generation, verify the relevant output tests and snapshots.
- When changing schemas or config resolution, run typecheck and targeted config/schema tests.
- When adding dependencies, ensure they belong in the correct workspace and package section.
