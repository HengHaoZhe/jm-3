const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getApiBaseUrl(): Promise<string> {
  return configuredApiUrl;
}

export async function getApiUrl(): Promise<string> {
  return `${configuredApiUrl}/api`;
}

export async function apiFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  return fetch(`${configuredApiUrl}/api${path}`, options);
}

export async function fetchAlbum<T>(path: string): Promise<T> {
  const response = await apiFetch(path);

  if (response.status === 404) {
    throw new Error("Album not found.");
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch album (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export async function getApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const result = await response.json();

    const firstError = result.errors
      ? Object.values(result.errors)
          .flat()
          .find((value) => typeof value === "string")
      : null;

    return firstError || result.message || fallback;
  } catch {
    return fallback;
  }
}

export function getApiImageUrl(apiUrl: string | null, url: string): string {
  if (!apiUrl) {
    return url;
  }

  const parsedUrl = new URL(url);

  return `${apiUrl}${parsedUrl.pathname}${parsedUrl.search}`;
}

export function getAlbumPath(albumId: string): string {
  return `/albums/${encodeURIComponent(albumId)}`;
}

export function clearApiUrl(): void {
  // No cached API URL to clear.
}
