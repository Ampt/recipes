import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const recipes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/recipes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      source: z.enum(['photo', 'description', 'ai-chat']),
      sourceImages: z.array(image()).default([]),
      tags: z.array(z.string()).default([]),
      servings: z.number().int().positive().optional(),
      prepTime: z.string().optional(),
      cookTime: z.string().optional(),
      dateAdded: z.coerce.date(),
    }),
});

export const collections = { recipes };
