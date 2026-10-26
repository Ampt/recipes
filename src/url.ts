/** Prefix a site path with the configured base, e.g. url('add/') -> '/recipes/add/'. */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return base + path.replace(/^\//, '');
}
