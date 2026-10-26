// Minimal GitHub REST client for the browser, authenticated with the
// fine-grained PAT saved on the Settings page.
import { REPO } from '../config';

const TOKEN_KEY = 'recipes.githubToken';
const API = 'https://api.github.com';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode); the site stays read-only.
  }
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new GitHubError(401, 'No GitHub token saved. Add one on the Settings page.');
  const res = await fetch(`${API}${path.replace('{repo}', `repos/${REPO.owner}/${REPO.name}`)}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.message) message = `${message}: ${body.message}`;
    } catch {}
    throw new GitHubError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type FileChange =
  | { path: string; base64: string } // add or replace
  | { path: string; delete: true };

/**
 * Commit a set of file changes to the default branch as a single commit
 * (Git Data API: blobs, tree, commit, ref update). Retries if the branch
 * moved underneath us. Returns the new commit SHA.
 */
export async function commitChanges(message: string, changes: FileChange[]): Promise<string> {
  const tree = await Promise.all(
    changes.map(async (c) => {
      if ('delete' in c) return { path: c.path, mode: '100644', type: 'blob', sha: null };
      const blob = await gh<{ sha: string }>('/{repo}/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: c.base64, encoding: 'base64' }),
      });
      return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha };
    }),
  );

  for (let attempt = 0; ; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(`/{repo}/git/ref/heads/${REPO.branch}`);
    const parent = await gh<{ tree: { sha: string } }>(`/{repo}/git/commits/${ref.object.sha}`);
    const newTree = await gh<{ sha: string }>('/{repo}/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const commit = await gh<{ sha: string }>('/{repo}/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
    });
    try {
      await gh(`/{repo}/git/refs/heads/${REPO.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha }),
      });
      return commit.sha;
    } catch (err) {
      // 422 = not a fast-forward: someone else pushed. Rebuild on the new head.
      if (err instanceof GitHubError && err.status === 422 && attempt < 3) continue;
      throw err;
    }
  }
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
