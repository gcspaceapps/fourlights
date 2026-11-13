# Rules that bind the build

1. **No project work before 09:00 Sat 14 Nov 2026 (AEST).** Official Space Apps rule. This repo's first commit is after that time. Before the start we wrote a plan, a data contract and prompts, and mirrored raw NASA files unmodified as an outage fallback; all code and data processing happened during the event. The README says so in one line.
2. **Open data, every source cited.** NASA (and partner agency) open data is the backbone. Every dataset used has a `_datasets/` card and a line in the README credits before it ships.
3. **Our own data only if published openly**, with a documented licence (CC BY 4.0), before we use it. No exact home or station locations: strip GPS from photo EXIF.
4. **Pre-existing work is declared** on the project page: the plan written before the start, the raw-data mirror, any tooling we brought. A separate, earlier side project on the same theme (a small educational game about the lunar south pole) shares no code or assets with this repo, and we say so.
5. **AI use is disclosed only where the rules require it** (2026 Submission Guide): the submission form's AI-use question; one short line under "How we built it" in the README, repeated in the project description; and a visible watermark on any AI-made image or video, which we avoid needing because there are **no AI-generated images, video or audio** anywhere. No AI attribution anywhere else: commits, PRs, code comments, file headers, docs, slides.
6. **No likeness of anyone under 18** in the demo or project.
7. **One demo moment beats five features.** Cut scope, not polish on the moment that matters.
8. **The build log is written as we go** (`stages/02_build/output/build-log.md`), never reconstructed later.
9. **Public-safe always.** The repo is private until Sunday 19:30 AEST, then public. Write everything as if it were public now: no personal contact details, no customer or client data, nothing from commercial client projects, no secrets.
10. **Licences:** code Apache-2.0 (`LICENSE`); docs, images and published data CC BY 4.0 (`LICENSE-docs.md`).
