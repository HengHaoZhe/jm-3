"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "./api";

export function useApiBaseUrl() {
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getApiBaseUrl()
      .then((url) => {
        if (active) {
          setApiUrl(url);
        }
      })
      .catch(() => {
        if (active) {
          setError("Failed to determine API server.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { apiUrl, error };
}
