// @ts-check
import { defineConfig } from 'astro/config';

// The Pages workflow passes SITE and BASE from actions/configure-pages.
export default defineConfig({
  site: process.env.SITE ?? 'https://ampt.github.io',
  base: process.env.BASE ?? '/recipes',
  trailingSlash: 'always',
});
