# Contributing

Issues and pull requests are welcome. For anything bigger than a fix, open an issue first so
we can agree on the approach.

## Setup and checks

See [Development](README.md#development). Before a pull request:

```bash
npm test
npm run lint
npm run build
```

Logic that both clients share lives in `core/` and gets a test in `tests/core`. Add a
screenshot to the pull request for anything you can see.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), subject line only:

```
feat(plan): add a calendar view
fix(import): keep the selection after preview
docs(readme): document the pwa install
```

- Types: `feat` `fix` `refactor` `perf` `docs` `style` `test` `build` `ci` `chore` `revert`.
- Scope is the area you touched. Imperative, lowercase, no trailing period.
- One logical change per commit. A body only to explain a why the diff cannot show.
- Pull request titles follow the same rules.

## Style

Hyphens, not em dashes, in docs and UI text. Keep the tone plain.

## Contributor license agreement

Sumry is AGPL-3.0, and Elyes Ghazel wants to keep the option of changing the license later
(for example to a more permissive one, or dual licensing). That needs the right to relicense
every contribution, so pull requests are accepted under these terms:

1. You wrote the contribution, or otherwise have the right to submit it.
2. You license it under the AGPL-3.0, like the rest of the project.
3. You also grant Elyes Ghazel a perpetual, worldwide, non-exclusive, royalty-free and
   irrevocable right to use, modify, sublicense and relicense the contribution under other
   terms.
4. You keep the copyright to your contribution.

Tick the box in the pull request template to agree. Without it the pull request cannot be
merged.
