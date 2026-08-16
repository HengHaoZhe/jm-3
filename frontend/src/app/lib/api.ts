const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const localhostApiUrl = "http://localhost:8000";

const STORAGE_KEY = "selected_api_url";

/**
 * Returns the selected server URL without /api.
 */
export async function getApiBaseUrl(): Promise<string> {
  if (typeof window !== "undefined") {
    const savedApiUrl = sessionStorage.getItem(STORAGE_KEY);

    if (savedApiUrl) {
      return savedApiUrl;
    }
  }

  // Test the configured server only once.
  try {
    await fetch(`${configuredApiUrl}/api/albums`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });

    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, configuredApiUrl);
    }

    return configuredApiUrl;
  } catch {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, localhostApiUrl);
    }

    return localhostApiUrl;
  }
}

/**
 * Returns the selected server URL with /api.
 */
export async function getApiUrl(): Promise<string> {
  const apiUrl = await getApiBaseUrl();

  return `${apiUrl}/api`;
}

/**
 * Fetch from the selected Laravel API.
 */
export async function apiFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const apiBaseUrl = await getApiUrl();

  return fetch(`${apiBaseUrl}${path}`, options);
}
