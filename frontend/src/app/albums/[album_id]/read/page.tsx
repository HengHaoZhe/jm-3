"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { apiFetch, getApiBaseUrl } from "@/app/lib/api";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";
type ReaderMode = "single" | "vertical";

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

function getReaderModeKey(albumId: string) {
  return `jm-next-reader-mode:${albumId}`;
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

  const [readerMode, setReaderMode] = useState<ReaderMode>("single");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressRestored, setProgressRestored] = useState(false);

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

  useEffect(() => {
    if (!albumId) {
      return;
    }

    let cancelled = false;

    async function fetchAlbum() {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch(`/albums/${albumId}/reader`);

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

  useEffect(() => {
    if (!album || !progressRestored) {
      return;
    }

    localStorage.setItem(getProgressKey(album.album_id), String(currentPage));
  }, [album, currentPage, progressRestored]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!album) {
      return;
    }

    const savedMode = localStorage.getItem(getReaderModeKey(album.album_id));

    if (savedMode === "single" || savedMode === "vertical") {
      setReaderMode(savedMode);
    }
  }, [album]);

  useEffect(() => {
    if (!album) {
      return;
    }

    localStorage.setItem(getReaderModeKey(album.album_id), readerMode);
  }, [album, readerMode]);

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

  function goToPage(pageNumber: number) {
    if (!album || album.pages.length === 0) {
      return;
    }

    const page = Math.min(Math.max(pageNumber, 1), album.pages.length);

    setCurrentPage(page);
  }

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

  function toggleReaderMode() {
    setReaderMode((current) => (current === "single" ? "vertical" : "single"));
  }

  if (loading) {
    return (
      <main className={styles.reader}>
        {" "}
        <div className={styles.message}>Loading reader...</div>{" "}
      </main>
    );
  }

  if (error || !album) {
    return (
      <main className={styles.reader}>
        {" "}
        <div className={styles.message}>
          {" "}
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
        {" "}
        <div className={styles.message}>
          {" "}
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
      {" "}
      <header className={styles.toolbar}>
        {" "}
        <div className={styles.toolbarLeft}>
          <Link href={`/albums/${albumId}`} className={styles.toolbarButton}>
            ←<span className={styles.backText}>Back</span>{" "}
          </Link>

          <div className={styles.title}>
            <span>{album.title || `Album ${album.album_id}`}</span>

            <small>#{album.album_id}</small>
          </div>
        </div>
        <div className={styles.toolbarCenter}>
          <div className={styles.navigation}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              aria-label="First page"
              title="First page"
            >
              «
            </button>

            <button
              type="button"
              className={styles.navButton}
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
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
              aria-label="Next page"
            >
              →
            </button>

            <button
              type="button"
              className={styles.navButton}
              onClick={() => goToPage(album.pages.length)}
              disabled={currentPage === album.pages.length}
              aria-label="Last page"
              title="Last page"
            >
              »
            </button>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={`${styles.modeButton} ${
              readerMode === "vertical" ? styles.modeButtonActive : ""
            }`}
            onClick={toggleReaderMode}
            aria-pressed={readerMode === "vertical"}
          >
            <span className={styles.modeIcon}>
              {readerMode === "vertical" ? "▤" : "▯"}
            </span>

            <span className={styles.modeText}>
              {readerMode === "vertical" ? "Vertical" : "Single"}
            </span>
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
      {readerMode === "single" ? (
        <>
          <div className={styles.singlePage}>
            <button
              type="button"
              className={`${styles.pageNavigation} ${styles.pageNavigationLeft}`}
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
            />

            {page && apiUrl && (
              <figure className={styles.singlePageItem}>
                <img
                  src={getImageUrl(apiUrl, page.url)}
                  alt={`Page ${page.sort_order}`}
                />

                <div className={styles.singlePageNumber}>
                  Page {page.sort_order}
                </div>
              </figure>
            )}

            <button
              type="button"
              className={`${styles.pageNavigation} ${styles.pageNavigationRight}`}
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === album.pages.length}
              aria-label="Next page"
            />
          </div>

          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.footerButton}
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
            >
              First
            </button>

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

            <button
              type="button"
              className={styles.footerButton}
              onClick={() => goToPage(album.pages.length)}
              disabled={currentPage === album.pages.length}
            >
              Last
            </button>
          </footer>
        </>
      ) : (
        <div className={styles.verticalReader}>
          <div className={styles.pages}>
            {album.pages.map((readerPage, index) => (
              <figure
                key={`${readerPage.file_path}-${index}`}
                className={`${styles.verticalPage} ${
                  currentPage === index + 1 ? styles.verticalPageActive : ""
                }`}
                onClick={() => goToPage(index + 1)}
              >
                {apiUrl && (
                  <img
                    src={getImageUrl(apiUrl, readerPage.url)}
                    alt={`Page ${readerPage.sort_order}`}
                    loading={index < 2 ? "eager" : "lazy"}
                  />
                )}

                <div className={styles.pageNumber}>
                  Page {readerPage.sort_order}
                </div>
              </figure>
            ))}
          </div>
        </div>
      )}
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
