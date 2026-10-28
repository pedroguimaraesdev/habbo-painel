# Repository Guidelines

## Project Structure & Module Organization

This workspace currently contains no application source, assets, tests, or package manifests. Only environment-managed directories (`.agents/`, `.aws/`, `.codex/`, and `.git/`) are present. Do not treat these directories as application modules or modify them as part of feature work.

When introducing the application, establish clear locations for source code, tests, and static assets, and update this guide with the actual paths. Keep related functionality together and avoid adding speculative directory structures before they are needed.

## Build, Test, and Development Commands

No development, build, lint, or test commands are currently configured. Do not assume that `npm install`, `npm test`, or `make build` applies.

When adding tooling, commit its manifest and configuration, document prerequisites and exact commands, and verify those commands from the repository root. Include local startup instructions and any required environment variables in a README.

## Coding Style & Naming Conventions

No language, formatter, or lint configuration has been established. Follow the conventions of the language selected for the application and use consistent indentation within each file. Prefer descriptive names that reflect a module's responsibility.

Configure formatting and linting alongside the first implementation. Keep unrelated formatting changes out of feature patches.

## Testing Guidelines

No test framework or coverage threshold is configured. Add tests with new behavior once the implementation stack is selected. Name tests after the behavior they verify, cover failure paths where relevant, and document how contributors can run them. Report any checks that could not be run.

## Commit & Pull Request Guidelines

Git history is unavailable in this workspace, so no existing commit convention can be confirmed. Use concise, imperative commit subjects, such as `Add login form validation`.

Pull requests should describe the change, its purpose, and validation performed. Link relevant issues and include screenshots for interface changes. Keep changes focused and document setup changes.

## Security & Configuration

Never commit credentials, tokens, or private configuration. Provide placeholder values in example configuration files and keep local secrets out of version control.
