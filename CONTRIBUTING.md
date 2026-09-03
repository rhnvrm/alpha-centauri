# Contributing

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/).
Use this format:

```text
<type>[optional scope]: <description>
```

Common types include:

- `feat`: add or extend user-facing functionality
- `fix`: correct a bug
- `docs`: documentation-only changes
- `style`: formatting or presentation changes with no behavior change
- `refactor`: code restructuring without changing behavior
- `test`: add or update tests
- `chore`: maintenance and tooling changes

Examples:

```text
feat(webmcp): expose the colony status tool
fix: preserve mission state after reload
docs: clarify local development setup
```

Keep the subject concise, use the imperative mood, and put breaking changes in
the footer with `BREAKING CHANGE:` or mark the type with `!`.
