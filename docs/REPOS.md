# Repositories and how work moves

One source repository, one deploy target, one way between them.

| Repository | Role | Who writes to it |
| --- | --- | --- |
| **`AbdelrahmenSalama256/ShamahClinic`** | **The source.** Full history, tests, docs, migrations. Every change lands here first, through a pull request into `main`. | People, through PRs |
| `AbdelrahmenSalama256/newshamah-cpanel` | **The deploy artifact.** A stripped copy (no tests, no heavy docs) that cPanel pulls. | `scripts/release.ps1` only |
| `AbdelrahmenSalama256/ShamahClinicsMobileApp` | The mobile app; a separate project. | — |

## Branches in `ShamahClinic`

- `main`: the code that is (or is about to be) live. Always green: `npm run typecheck`, `npm test`, `npm run build`.
- `feature/<short-name>`, `fix/<short-name>`: one topic each, branched from `main`, merged by PR, deleted after merging.
- `archive/*` **tags** (not branches) keep experiments that were abandoned but are worth keeping
  (`archive/sitedash-prototype`, `archive/payload-wp-retire`, `archive/sitedash-install`). A tag
  does not show up as clutter in the branch list and cannot be committed to by accident.

Nothing else lives as a long-running branch. A "snapshot" or "wip" branch is a commit on a feature branch instead.

## Local layout (Windows)

- One clone, `D:\shamah_cms`, whose `origin` is GitHub (not another folder on the same disk).
- Parallel work goes in `git worktree`s of that clone, not in copies of the folder.
- `.gitattributes` forces LF in every checkout, so tests and migration checksums behave the same on
  Windows, on GitHub and on the cPanel server, whatever `core.autocrlf` says.

## Releasing to cPanel

```powershell
pwsh scripts/release.ps1 "Release: <what changed>" -DryRun   # rehearse in a temp clone
pwsh scripts/release.ps1 "Release: <what changed>"           # publish to newshamah-cpanel/main
```

The script mirrors `src/` and the runtime files into `cpanel-upload/`, validates them with `npm ci`,
`copy:check`, `typecheck` and `build`, then commits to the deploy clone and pushes. Release from
`main` only. After pulling on the server, run `npm run db:migrate -- --apply`. Migration `015`, for
example, adds the testimonials list.
