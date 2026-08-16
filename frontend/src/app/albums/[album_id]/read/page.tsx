"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { apiFetch, getApiBaseUrl } from "@/app/lib/api";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";

interface Page {
  sort_order: number;
  file_path: string;
  url: string;
}

interface Album {
  album_id: string;
  title: string;
  status: AlbumStatus;
  page_count: number;
  pages: Page[];
  created_at: string;
}

interface AlbumResponse {
  data: Album;
}

function getImageUrl(apiUrl: string, url: string) {
  const parsedUrl = new URL(url);

  return `${apiUrl}${parsedUrl.pathname}${parsedUrl.search}`;
}

function getProgressKey(albumId: string) {
  return `jm-next-reading-progress:${albumId}`;
}

export default function ReaderPage() {
  const params = useParams<{ album_id: string }>();
  const albumId = params.album_id;

  const searchParams = useSearchParams();
  const pageParam = searchParams.get("page");

  const [album, setAlbum] = useState<Album | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressRestored, setProgressRestored] = useState(false);

  /*
   * Resolve API URL on the client.
   */
  useEffect(() => {
    let cancelled = false;

    async function resolveApiUrl() {
      try {
        const url = await getApiBaseUrl();

        if (!cancelled) {
          setApiUrl(url);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to determine API server.");
          setLoading(false);
        }
      }
    }

    resolveApiUrl();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Fetch album.
   */
  useEffect(() => {
    if (!albumId) {
      return;
    }

    let cancelled = false;

    async function fetchAlbum() {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch(`/albums/${albumId}`);

        if (cancelled) {
          return;
        }

        if (response.status === 404) {
          throw new Error("Album not found.");
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch album (${response.status}).`);
        }

        const result: AlbumResponse = await response.json();

        if (!cancelled) {
          setAlbum(result.data);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load album.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAlbum();

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  /*
   * Restore reading position.
   *
   * Priority:
   *
   * 1. Valid ?page= query parameter
   * 2. Saved localStorage position
   * 3. Page 1
   */
  useEffect(() => {
    if (!album) {
      return;
    }

    let restoredPage = 1;

    if (pageParam !== null) {
      const requestedPage = Number(pageParam);

      if (
        Number.isInteger(requestedPage) &&
        requestedPage >= 1 &&
        requestedPage <= album.pages.length
      ) {
        restoredPage = requestedPage;
      } else {
        const savedPage = localStorage.getItem(getProgressKey(album.album_id));

        if (savedPage) {
          const pageNumber = Number(savedPage);

          if (
            Number.isInteger(pageNumber) &&
            pageNumber >= 1 &&
            pageNumber <= album.pages.length
          ) {
            restoredPage = pageNumber;
          }
        }
      }
    } else {
      const savedPage = localStorage.getItem(getProgressKey(album.album_id));

      if (savedPage) {
        const pageNumber = Number(savedPage);

        if (
          Number.isInteger(pageNumber) &&
          pageNumber >= 1 &&
          pageNumber <= album.pages.length
        ) {
          restoredPage = pageNumber;
        }
      }
    }

    setCurrentPage(restoredPage);
    setProgressRestored(true);
  }, [album, pageParam]);

  /*
   * Save current reading position.
   */
  useEffect(() => {
    if (!album || !progressRestored) {
      return;
    }

    localStorage.setItem(getProgressKey(album.album_id), String(currentPage));
  }, [album, currentPage, progressRestored]);

  /*
   * Keep page input synchronized.
   */
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  /*
   * Keyboard navigation.
   */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!album || !progressRestored) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "arrowright" || key === "d") {
        goToPage(currentPage + 1);
      }

      if (key === "arrowleft" || key === "a") {
        goToPage(currentPage - 1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [album, currentPage, progressRestored]);

  /*
   * Navigate to a page.
   */
  function goToPage(pageNumber: number) {
    if (!album) {
      return;
    }

    const page = Math.min(Math.max(pageNumber, 1), album.pages.length);

    setCurrentPage(page);
  }

  /*
   * Page input.
   */
  function submitPageInput() {
    const pageNumber = Number(pageInput);

    if (
      !Number.isInteger(pageNumber) ||
      !album ||
      pageNumber < 1 ||
      pageNumber > album.pages.length
    ) {
      setPageInput(String(currentPage));
      return;
    }

    goToPage(pageNumber);
  }

  if (loading) {
    return (
      <main className={styles.reader}>
        <div className={styles.message}>Loading reader...</div>
      </main>
    );
  }

  if (error || !album) {
    return (
      <main className={styles.reader}>
        <div className={styles.message}>
          <h1>Unable to open reader</h1>

          <p>{error ?? "Album not found."}</p>

          <Link href={`/albums/${albumId}`} className={styles.backButton}>
            ← Back to Album
          </Link>
        </div>
      </main>
    );
  }

  if (album.status !== "completed") {
    return (
      <main className={styles.reader}>
        <div className={styles.message}>
          <h1>Album is not ready</h1>

          <p>
            This album is currently{" "}
            <strong>{formatStatus(album.status)}</strong>.
          </p>

          <Link href={`/albums/${albumId}`} className={styles.backButton}>
            ← Back to Album
          </Link>
        </div>
      </main>
    );
  }

  const page = album.pages[currentPage - 1];

  const progress =
    album.pages.length > 0 ? (currentPage / album.pages.length) * 100 : 0;

  return (
    <main className={styles.reader}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href={`/albums/${albumId}`} className={styles.toolbarButton}>
            ←<span className={styles.backText}>Back</span>
          </Link>

          <div className={styles.title}>
            <span>{album.title || `Album ${album.album_id}`}</span>

            <small>#{album.album_id}</small>
          </div>
        </div>

        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ←
          </button>

          <form
            className={styles.pageJump}
            onSubmit={(event) => {
              event.preventDefault();
              submitPageInput();
            }}
          >
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={submitPageInput}
              aria-label="Page number"
              inputMode="numeric"
            />

            <span>/ {album.pages.length}</span>
          </form>

          <button
            type="button"
            className={styles.navButton}
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === album.pages.length}
          >
            →
          </button>
        </div>
      </header>

      <div className={styles.progressTrack}>
        <div
          className={styles.progressBar}
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <div className={styles.singlePage}>
        {page && apiUrl && (
          <figure className={styles.page}>
            <img
              src={getImageUrl(apiUrl, page.url)}
              alt={`Page ${page.sort_order}`}
            />

            <div className={styles.pageNumber}>Page {page.sort_order}</div>
          </figure>
        )}
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.footerButton}
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ← Previous
        </button>

        <span>
          Page {currentPage} of {album.pages.length}
        </span>

        <button
          type="button"
          className={styles.footerButton}
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === album.pages.length}
        >
          Next →
        </button>
      </footer>
    </main>
  );
}

function formatStatus(status: AlbumStatus) {
  return {
    queued: "queued",
    downloading: "downloading",
    completed: "completed",
    failed: "failed",
  }[status];
}
