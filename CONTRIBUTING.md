# Contributing

## Development Setup

Requirements: Node.js >= 18, npm

```bash
git clone https://github.com/barissozudogru/envdrift.git
cd envdrift
npm install
npm run build
```

To run the CLI from source during development:

```bash
node dist/cli.js .env .env.staging
```

The project has no runtime dependencies. Dev dependencies are TypeScript and `@types/node`.

## Project Structure

```
src/
  types.ts    - TypeScript interfaces and type aliases
  index.ts    - Core logic: parseEnvFile, inferType, compareEnvFiles
  cli.ts      - CLI entry point, argument parsing, output formatting
dist/         - Compiled output (generated, not committed)
```

## Making Changes

1. Edit files in `src/`
2. Run `npm run build` to compile
3. Test manually with `node dist/cli.js <files>`

There are no automated tests yet. If you are adding a new feature, include a description of how you verified it in your pull request.

## Commit Convention

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
feat: add --strict flag to treat anomalies as errors
fix: handle env files with Windows line endings
docs: update CI integration example
chore: bump typescript to 5.4
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

Keep the subject line under 72 characters. No period at the end.

## Release Process

Releases are published to the GitHub Package Registry.

1. Update the version in `package.json` following semver
2. Add a section to `CHANGELOG.md` under the new version
3. Commit: `chore: release v0.x.0`
4. Create a GitHub release tagged `v0.x.0`
5. The `release.yml` workflow publishes the package automatically

## Pull Requests

- Keep pull requests focused on a single change
- Reference any related issues in the PR description
- Ensure `npm run build` passes before opening a PR
