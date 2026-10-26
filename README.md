# Recipes

Our family recipe catalog. A static Astro site on GitHub Pages; recipes are added from the site's Add page (photo, description, or pasted AI chat) and turned into Markdown by a GitHub Action using Claude. See [DESIGN.md](DESIGN.md).

Site: https://ampt.github.io/recipes/

## Develop

Node 22.

```sh
npm install
npm run dev      # http://localhost:4321/recipes/ (search falls back to title matching in dev)
npm run build    # astro build + Pagefind index into dist/
npm run preview  # serve dist/ with working search
npm run check    # type check
```

Recipes are Markdown files in `src/content/recipes/`; editing one by hand and pushing to `main` redeploys the site.

## Setup

1. **Secret:** Settings → Secrets and variables → Actions → New repository secret `ANTHROPIC_API_KEY`.
2. **Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Tokens:** each person creates a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) for `Ampt/recipes` only, with **Contents: Read and write** and **Actions: Read-only**, and pastes it on the site's Settings page.
