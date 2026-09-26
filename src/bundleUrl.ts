import { accessToken } from "./accessToken";

/** `/api/bundle/<name>`, carrying the access token when the page has one. */
export function bundleUrl(name: string): string {
  const token = accessToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/bundle/${encodeURIComponent(name)}${query}`;
}
