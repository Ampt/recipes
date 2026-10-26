// Turn each inbox/<id>/ folder (input.json + optional photos) into a recipe
// Markdown file under src/content/recipes/, using Claude to read the input.
//
// Run by .github/workflows/import-recipe.yml. Successful folders are deleted;
// failed ones get an error.txt the Add page shows (and can retry). Writes the
// commit message for the workflow to COMMIT_MSG.
//
//   ANTHROPIC_API_KEY=... node scripts/import-recipe.mjs

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const INBOX = 'inbox';
const RECIPES = 'src/content/recipes';
const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `You turn recipes into clean, structured data for a family recipe website.

The input is one of: photos of a recipe (cookbook pages, handwritten or printed cards, screenshots), a short description someone typed, or a pasted conversation with an AI assistant that contains a recipe. There may also be notes from the person adding it.

Rules:
- Transcribe faithfully. Keep the recipe's own quantities, ingredients and method; fix obvious OCR or typing mistakes, but don't "improve" the recipe.
- For a description, fill in a sensible complete recipe consistent with what was described.
- For an AI chat, use the final version of the recipe the conversation settled on, including any changes the person asked for.
- Each ingredient is one line starting with its quantity when there is one, e.g. "2 1/2 cups flour", "1 (15 oz) can black beans, drained". Use plain numbers and fractions like 1/2, not words.
- Group ingredients only when the source does (e.g. "Crust", "Filling"); otherwise use a single group with a null heading.
- Steps are complete sentences without leading numbers.
- Times use compact forms: "15m", "1h", "1h 30m". Use null if unknown.
- Tags: 2 to 6 short lowercase tags such as meal (breakfast, dinner, dessert), main ingredient (chicken, beans), cuisine (mexican, thai) and practical traits (quick, one-pot, freezer-friendly, vegetarian).
- Notes: tips, variations or storage advice from the source, plus the person's own notes if given. null if there are none.
- If the input does not contain a recipe at all, or the photos are unreadable, set "error" to a short explanation for the person and fill the other fields with empty values. Otherwise "error" is null.`;

const nullable = (type) => ({ anyOf: [{ type }, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'title', 'tags', 'servings', 'prepTime', 'cookTime', 'ingredientGroups', 'steps', 'notes'],
  properties: {
    error: nullable('string'),
    title: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    servings: nullable('integer'),
    prepTime: nullable('string'),
    cookTime: nullable('string'),
    ingredientGroups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'items'],
        properties: {
          heading: nullable('string'),
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    notes: nullable('string'),
  },
};

const LABELS = { photo: 'photos of a recipe', description: 'a description of a recipe', 'ai-chat': 'a conversation with an AI assistant' };

const client = new Anthropic();

async function extract(dir, input) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "The ANTHROPIC_API_KEY secret isn't set on the repo (Settings → Secrets and variables → Actions). Add it, then tap Try again.",
    );
  }
  const content = [];
  for (const name of input.images ?? []) {
    const data = (await readFile(path.join(dir, name))).toString('base64');
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  }
  let prompt = `Here are ${LABELS[input.type] ?? 'details of a recipe'}.`;
  if (input.text) prompt += `\n\n<input>\n${input.text}\n</input>`;
  if (input.notes) prompt += `\n\n<notes_from_person_adding_it>\n${input.notes}\n</notes_from_person_adding_it>`;
  content.push({ type: 'text', text: prompt });

  // Server-side fallback re-runs the request on another model if a safety
  // classifier declines it (rare for recipes, but cheap insurance).
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error("Claude declined to process this input. Try a different photo or description.");
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The recipe was too long to finish reading. Try splitting it up.');
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No output from Claude (stop reason: ${response.stop_reason}).`);
  const recipe = JSON.parse(text);
  if (recipe.error) throw new Error(recipe.error);
  if (!recipe.title || recipe.steps.length === 0) throw new Error("Couldn't find a complete recipe in that input.");
  return recipe;
}

function slugify(title) {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'recipe'
  );
}

function uniqueSlug(base) {
  let slug = base;
  for (let n = 2; existsSync(path.join(RECIPES, `${slug}.md`)); n++) slug = `${base}-${n}`;
  return slug;
}

const yaml = (v) => JSON.stringify(v); // JSON scalars and flow arrays are valid YAML

function toMarkdown(recipe, { source, images, dateAdded }) {
  const fm = [
    `title: ${yaml(recipe.title)}`,
    `source: ${yaml(source)}`,
    `sourceImages: ${yaml(images.map((f) => `./${f}`))}`,
    `tags: ${yaml([...new Set(recipe.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))])}`,
    recipe.servings ? `servings: ${recipe.servings}` : null,
    recipe.prepTime ? `prepTime: ${yaml(recipe.prepTime)}` : null,
    recipe.cookTime ? `cookTime: ${yaml(recipe.cookTime)}` : null,
    `dateAdded: ${dateAdded}`,
  ].filter(Boolean);

  const body = ['## Ingredients', ''];
  for (const group of recipe.ingredientGroups) {
    if (group.heading) body.push(`### ${group.heading}`, '');
    body.push(...group.items.map((i) => `- ${i}`), '');
  }
  body.push('## Steps', '', ...recipe.steps.map((s, i) => `${i + 1}. ${s}`), '');
  if (recipe.notes) body.push('## Notes', '', recipe.notes, '');

  return `---\n${fm.join('\n')}\n---\n${body.join('\n')}`;
}

async function importFolder(id) {
  const dir = path.join(INBOX, id);
  const input = JSON.parse(await readFile(path.join(dir, 'input.json'), 'utf8'));
  const recipe = await extract(dir, input);

  const slug = uniqueSlug(slugify(recipe.title));
  const images = [];
  for (const [i, name] of (input.images ?? []).entries()) {
    const target = `${slug}-${i + 1}${path.extname(name) || '.jpg'}`;
    await rename(path.join(dir, name), path.join(RECIPES, target));
    images.push(target);
  }
  const dateAdded = (input.createdAt ?? new Date().toISOString()).slice(0, 10);
  const source = input.type === 'photo' ? 'photo' : input.type === 'ai-chat' ? 'ai-chat' : 'description';
  await writeFile(path.join(RECIPES, `${slug}.md`), toMarkdown(recipe, { source, images, dateAdded }));
  await rm(dir, { recursive: true, force: true });
  return { slug, title: recipe.title };
}

async function main() {
  await mkdir(RECIPES, { recursive: true });
  const ids = existsSync(INBOX)
    ? (await readdir(INBOX, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && existsSync(path.join(INBOX, d.name, 'input.json')))
        .filter((d) => !existsSync(path.join(INBOX, d.name, 'error.txt')))
        .map((d) => d.name)
        .sort()
    : [];

  const lines = [];
  for (const id of ids) {
    try {
      const { slug, title } = await importFolder(id);
      console.log(`Imported ${id} -> ${slug}`);
      lines.push({ id, slug, title });
    } catch (err) {
      const message = err instanceof Anthropic.APIError ? `Claude API error (${err.status}): ${err.message}` : err.message;
      console.error(`Failed ${id}: ${message}`);
      await writeFile(path.join(INBOX, id, 'error.txt'), `${message}\n`);
      lines.push({ id, error: message });
    }
  }

  // Commit message for the workflow. The Add page finds the new recipe through
  // the "Inbox:" / "Recipe:" lines of the commit that touched its inbox folder.
  const ok = lines.filter((l) => l.slug);
  const failed = lines.filter((l) => l.error);
  const subject =
    ok.length === 1 && failed.length === 0 ? `Add recipe: ${ok[0].title}`
    : ok.length > 0 ? `Add ${ok.length} recipe${ok.length > 1 ? 's' : ''}${failed.length ? `, ${failed.length} failed` : ''}`
    : `Recipe import failed (${failed.length})`;
  const trailers = lines.flatMap((l) => (l.slug ? [`Inbox: ${l.id}`, `Recipe: ${l.slug}`] : [`Inbox: ${l.id}`, `Failed: ${l.error.split('\n')[0]}`]));
  if (lines.length) await writeFile('COMMIT_MSG', `${subject}\n\n${trailers.join('\n')}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `imported=${ok.length > 0}\nchanged=${lines.length > 0}\n`, { flag: 'a' });
  }
}

await main();
