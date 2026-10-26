# Recipe site design

A recipe catalog for Matt and his wife. Static site on GitHub Pages, private repo (`Ampt/recipes`, GitHub paid plan). No backend, no review step: imports commit straight to `main`, git history is the undo.

## Recipe format

One Markdown file per recipe at `src/content/recipes/<slug>.md`, original source images next to it.

```yaml
---
title: Grandma's Chili
source: photo            # photo | description | ai-chat
sourceImages: [./grandmas-chili-1.jpg]
tags: [dinner, beef, freezer-friendly]
servings: 6
prepTime: 20m
cookTime: 2h
dateAdded: 2026-10-26
---
## Ingredients
- 2 lb ground beef
## Steps
1. Brown the beef...
## Notes
Better the next day.
```

We don't track who added a recipe (decided 2026-10-26), so there is no `addedBy` field or filter.

## Site (Astro, deployed to Pages via Actions)

- **Home:** card grid, Pagefind search, tag chips.
- **Recipe page:** tap-to-check ingredients, numbered steps, collapsible original photo, servings scaler, Cook Mode (Wake Lock API), print stylesheet, Delete button (commits the deletion via the GitHub API).
- **Add page:** three tabs: Photo (multiple images), Describe it, Paste AI chat, plus an optional notes box.
- **Settings:** paste a fine-grained GitHub PAT (this repo only; Contents read/write, Actions read), stored in localStorage. Without a token the site is read-only.

## Import pipeline

1. Add page resizes images client-side (about 2000px JPEG, handle HEIC by drawing to canvas) and commits `inbox/<id>/` (images + `input.json` with type, text, notes) as one commit (Git Data API: blobs, tree, commit, ref update).
2. Workflow `import-recipe.yml` triggers on push to `inbox/**`, `concurrency: import` (serialized). For each inbox folder it calls Claude (`claude-sonnet-5-5`, vision, structured output matching the schema above, server-side refusal fallback), writes the recipe + images, deletes the inbox folder, commits, pushes (rebase on conflict). The commit message carries `Inbox: <id>` / `Recipe: <slug>` lines.
3. Pushes made with `GITHUB_TOKEN` don't trigger other workflows, so `import-recipe.yml` calls `deploy.yml` as a reusable workflow after a successful import. `deploy.yml` also runs on its own for any other push to `main` outside `inbox/`.
4. The Add page tracks progress by polling: the commits touching `inbox/<id>` (for the `Recipe:` line), `inbox/<id>/error.txt` (for a failure), and the Actions run for its commit SHA (for status). Once the slug is known it waits for the recipe page to return 200 on the live site, then links to it.
5. If Claude can't read the input (or it isn't a recipe), the workflow leaves the inbox folder in place and commits an `error.txt` beside it. The Add page shows that message; Retry deletes `error.txt` and bumps `attempt` in `input.json`, and that push re-runs the import.

Secret: `ANTHROPIC_API_KEY` in repo Actions secrets.

## Notes

- Pages on a private repo still serves a **public** site (private Pages needs Enterprise). URL is unlisted; that's accepted. Pages also send `noindex`.
- A pasted AI conversation is just text; share links aren't fetched.
- Later: OAuth sign-in via a small Cloudflare Worker, meal plan / grocery list, "made it" log, import from URL.
