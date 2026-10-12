# Project instructions

## Top priority: understand the project at the start of every new chat
- Before making changes, read the project's documentation, existing instructions, source code, configuration, and tests to understand what has already been built and how the project works.
- Review the Git history and current working-tree changes to understand previous work and any work in progress. Preserve existing user changes.
- Identify the active project directory and distinguish it from backups or older copies before editing files.
- Read all relevant project material first; do not treat a quick glance at a few files as sufficient context. Exclude dependency folders, generated output, Git internals, and binary files from source-code reading; consult binary documents when they contain relevant project requirements.
- Establish the existing behavior and implementation before deciding what to change. If important context is missing or contradictory, investigate and clarify before making dependent changes.

## Second priority: development
- Follow the existing code style and folder structure.
- Keep changes focused on the requested task.
- Ask before adding new dependencies.

## Third priority: read READMEFIRST
- Please take a look at READMEFIRST. Those are what was left unfinished (if nothing, move on to the next step).
- Read `D:\DPP-ITE\Internship\Geardrop\2026-09-14\hel\work\GearDrop\READMEFIRST` before starting project work. Use it alongside the existing documentation to understand outstanding tasks, current progress, and the next steps.
- If it says "Nothing to continue", or has no outstanding work, move on to the next step. Outstanding tasks do not override the user's current request or existing approval boundaries.

## Validation
- Use the validation commands defined by the active project's configuration and documentation.
- Run relevant lint checks and tests after code changes.

## UI
- Reuse existing components.
- Make layouts work on mobile and desktop.

## Boundaries
- Do not modify .env files or commit secrets.
- Do not deploy unless explicitly requested.

## Communication
- Before making changes, tell the user clearly and briefly exactly what you will do, including the scope, main steps, and how you will check the result. Update the plan if the scope changes.
- Suggest useful optional extras the user could consider, even when they were not requested. Explain their benefit briefly, keep suggestions relevant to the task, and make clear that they are optional. Do not implement these extras unless the user authorizes them.
- Explain what changed and how it was checked.
- When making changes in a new chat, also explain what was initially built, contrast the previous behavior or implementation with the changes made, and state how those changes were checked.

## Last priority: maintain the READMEFIRST handoff
- If I have to cut short, record everything that's left to do and write it as READMEFIRST. Save it in `D:\DPP-ITE\Internship\Geardrop\2026-09-14\hel\work\GearDrop`.
- Include enough context to continue: completed work, all unfinished tasks, exact next steps, relevant files, validation results, and any pending user action or approval. Keep it current when ending a session with unfinished work.
- If everything is finished, update READMEFIRST to exactly "Nothing to continue". Do not mark it finished while required work or external setup remains outstanding.
