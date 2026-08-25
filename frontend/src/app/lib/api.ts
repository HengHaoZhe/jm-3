// const configuredApiUrl =
//   process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// const localhostApiUrl = "http://localhost:8000";

// const STORAGE_KEY = "selected_api_url";

// let cachedApiBaseUrl: string | null = null;

// /**
//  * Returns the selected server URL without /api.
//  *
//  * Priority:
//  * 1. Previously selected URL in sessionStorage
//  * 2. NEXT_PUBLIC_API_URL
//  * 3. Current browser hostname + :8000
//  * 4. localhost:8000
//  */
// export async function getApiBaseUrl(): Promise<string> {
//   if (cachedApiBaseUrl) {
//     return cachedApiBaseUrl;
//   }

//   if (typeof window !== "undefined") {
//     const savedApiUrl = sessionStorage.getItem(STORAGE_KEY);

//     if (savedApiUrl) {
//       cachedApiBaseUrl = savedApiUrl;
//       return savedApiUrl;
//     }

//     /*
//      * If the frontend is being accessed from another device,
//      * use the same hostname/IP for Laravel.
//      */
//     const browserApiUrl = `${window.location.protocol}//${window.location.hostname}:8000`;

//     const candidates = [
//       configuredApiUrl,
//       browserApiUrl,
//       localhostApiUrl,
//     ].filter((url, index, array) => array.indexOf(url) === index);

//     for (const apiUrl of candidates) {
//       try {
//         const response = await fetch(`${apiUrl}/api/albums`, {
//           method: "GET",
//           signal: AbortSignal.timeout(1500),
//         });

//         if (response.ok) {
//           cachedApiBaseUrl = apiUrl;
//           sessionStorage.setItem(STORAGE_KEY, apiUrl);

//           return apiUrl;
//         }
//       } catch {
//         // Try the next API URL.
//       }
//     }
//   }

//   /*
//    * Server-side fallback.
//    */
//   cachedApiBaseUrl = configuredApiUrl;

//   return configuredApiUrl;
// }

// /**
//  * Returns the selected server URL with /api.
//  */
// export async function getApiUrl(): Promise<string> {
//   const apiUrl = await getApiBaseUrl();

//   return `${apiUrl}/api`;
// }

// /**
//  * Fetch from the selected Laravel API.
//  */
// export async function apiFetch(
//   path: string,
//   options?: RequestInit,
// ): Promise<Response> {
//   const apiBaseUrl = await getApiUrl();

//   return fetch(`${apiBaseUrl}${path}`, options);
// }

// /**
//  * Clear the currently selected API URL.
//  *
//  * Useful if the server changes or the connection fails.
//  */
// export function clearApiUrl(): void {
//   cachedApiBaseUrl = null;

//   if (typeof window !== "undefined") {
//     sessionStorage.removeItem(STORAGE_KEY);
//   }
// }
const configuredApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STORAGE_KEY = "selected_api_url";

let cachedApiBaseUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  if (typeof window !== "undefined") {
    const savedApiUrl = sessionStorage.getItem(STORAGE_KEY);

    if (savedApiUrl) {
      cachedApiBaseUrl = savedApiUrl;
      return savedApiUrl;
    }

    const browserApiUrl = `${window.location.protocol}//${window.location.hostname}:8000`;

    const candidates = [configuredApiUrl, browserApiUrl].filter(
      (url, index, array) => array.indexOf(url) === index,
    );

    for (const apiUrl of candidates) {
      try {
        const response = await fetch(`${apiUrl}/api/albums`, {
          method: "GET",
          signal: AbortSignal.timeout(1500),
        });

        if (response.ok) {
          cachedApiBaseUrl = apiUrl;
          sessionStorage.setItem(STORAGE_KEY, apiUrl);

          return apiUrl;
        }
      } catch {
        // Try next URL.
      }
    }
  }

  cachedApiBaseUrl = configuredApiUrl;

  return configuredApiUrl;
}

export async function getApiUrl(): Promise<string> {
  const apiUrl = await getApiBaseUrl();

  return `${apiUrl}/api`;
}

export async function apiFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  /*
   * On the browser, use the cached API URL directly.
   */
  const apiBaseUrl =
    cachedApiBaseUrl ??
    (typeof window !== "undefined"
      ? sessionStorage.getItem(STORAGE_KEY)
      : null) ??
    configuredApiUrl;

  return fetch(`${apiBaseUrl}/api${path}`, options);
}

export function clearApiUrl(): void {
  cachedApiBaseUrl = null;

  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
