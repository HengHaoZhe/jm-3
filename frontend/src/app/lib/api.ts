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
  const url = `${configuredApiUrl}/api${path}`;
  const method = (options?.method || "GET").toUpperCase();
  const startedAt = performance.now();

  try {
    const response = await fetch(url, options);
    const durationMs = Math.round(performance.now() - startedAt);
    const logDetails = { method, url, status: response.status, durationMs };

    if (response.ok) {
      console.info("[API] Request completed", logDetails);
    } else {
      console.error("[API] Request failed", logDetails);
    }

    return response;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);

    console.error("[API] Request error", { method, url, durationMs, error });
    throw error;
  }
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
