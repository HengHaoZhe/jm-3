"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import { fetchAlbum, getApiImageUrl, getAlbumPath } from "@/app/lib/api";
import { Album, AlbumResponse } from "@/app/lib/types";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";

type ReaderMode = "single" | "vertical";

const PRELOADED_PAGE_RADIUS = 4;

function getProgressKey(albumId: string) {
  return `jm-next-reading-progress:${albumId}`;
}

function getReaderModeKey(albumId: string) {
  return `jm-next-reader-mode:${albumId}`;
}

function isValidPage(pageNumber: number, pageCount: number) {
  return (
    Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount
  );
}

function clampPage(pageNumber: number, pageCount: number) {
  return Math.min(Math.max(pageNumber, 1), pageCount);
}

export function ReaderPage() {
  const params = useParams<{ album_id: string; page?: string }>();
  const albumId = params.album_id;
  const router = useRouter();
  const pageParam = params.page ?? null;

  const [album, setAlbum] = useState<Album | null>(null);
  const { apiUrl, error: apiError } = useApiBaseUrl();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [readerMode, setReaderMode] = useState<ReaderMode>("single");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressRestored, setProgressRestored] = useState(false);
  const [modeRestored, setModeRestored] = useState(false);
  const activePageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!albumId) {
      return;
    }

    let cancelled = false;

    async function loadAlbum() {
      try {
        setLoading(true);
        setError(null);

        if (cancelled) {
          return;
        }

        const result = await fetchAlbum<AlbumResponse>(
          `/albums/${albumId}/reader`,
        );

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

    loadAlbum();

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

      if (isValidPage(requestedPage, album.pages.length)) {
        restoredPage = requestedPage;
      }
    }

    if (restoredPage === 1) {
      const savedPage = localStorage.getItem(getProgressKey(album.album_id));

      if (savedPage) {
        const pageNumber = Number(savedPage);

        if (isValidPage(pageNumber, album.pages.length)) {
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

    setModeRestored(true);
  }, [album]);

  useEffect(() => {
    if (!album || !modeRestored) {
      return;
    }

    localStorage.setItem(getReaderModeKey(album.album_id), readerMode);
  }, [album, readerMode, modeRestored]);

  useEffect(() => {
    if (!album || !apiUrl || readerMode !== "single") {
      return;
    }

    const firstPage = Math.max(currentPage - 1 - PRELOADED_PAGE_RADIUS, 0);

    const lastPage = Math.min(
      currentPage - 1 + PRELOADED_PAGE_RADIUS + 1,
      album.pages.length,
    );

    album.pages.slice(firstPage, lastPage).forEach((preloadedPage) => {
      const image = new Image();
      image.src = getApiImageUrl(apiUrl, preloadedPage.url);
    });
  }, [album, apiUrl, currentPage, readerMode]);

  useEffect(() => {
    if (!album || !progressRestored) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToActivePage();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [album, currentPage, progressRestored, readerMode]);

  function scrollToActivePage() {
    activePageRef.current?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }

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

    const page = clampPage(pageNumber, album.pages.length);

    setCurrentPage(page);
    router.replace(`${getAlbumPath(albumId)}/read/${page}`, { scroll: false });
  }

  function submitPageInput() {
    const pageNumber = Number(pageInput);

    if (!Number.isInteger(pageNumber)) {
      setPageInput(String(currentPage));
      return;
    }

    goToPage(pageNumber);
  }

  function toggleReaderMode() {
    setReaderMode((current) => (current === "single" ? "vertical" : "single"));
  }

  if (loading && !apiError) {
    return (
      <main className={styles.reader}>
        {" "}
        <div className={styles.message}>Loading reader...</div>{" "}
      </main>
    );
  }

  if (error || apiError || !album) {
    return (
      <main className={styles.reader}>
        {" "}
        <div className={styles.message}>
          {" "}
          <h1>Unable to open reader</h1>
          <p>{error ?? apiError ?? "Album not found."}</p>
          <Link href={getAlbumPath(albumId)} className={styles.backButton}>
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
            This album is currently <strong>{album.status}</strong>.
          </p>
          <Link href={getAlbumPath(albumId)} className={styles.backButton}>
            ← Back to Album
          </Link>
        </div>
      </main>
    );
  }

  const page = album.pages[currentPage - 1];

  const progress =
    album.pages.length > 0 ? (currentPage / album.pages.length) * 100 : 0;
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === album.pages.length;

  return (
    <main className={styles.reader}>
      {" "}
      <header className={styles.toolbar}>
        {" "}
        <div className={styles.toolbarLeft}>
          {" "}
          <Link href={getAlbumPath(albumId)} className={styles.toolbarButton}>
            ←<span className={styles.backText}>Back</span>{" "}
          </Link>
          <div className={styles.title}>
            <span>{album.title || `Album ${album.album_id}`}</span>

            <small>#{album.album_id}</small>
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
      <div className={styles.readerBody}>
        <NavigationControls
          currentPage={currentPage}
          pageCount={album.pages.length}
          pageInput={pageInput}
          onPageInputChange={setPageInput}
          onPageInputSubmit={submitPageInput}
          onGoToPage={goToPage}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
        />

        {readerMode === "single" ? (
          <div className={styles.singlePage}>
            <button
              type="button"
              className={`${styles.pageNavigation} ${styles.pageNavigationLeft}`}
              onClick={() => goToPage(currentPage - 1)}
              disabled={isFirstPage}
              aria-label="Previous page"
            />

            {page && apiUrl && (
              <figure ref={activePageRef} className={styles.singlePageItem}>
                <img
                  src={getApiImageUrl(apiUrl, page.url)}
                  alt={`Page ${page.sort_order}`}
                  onLoad={scrollToActivePage}
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
              disabled={isLastPage}
              aria-label="Next page"
            />
          </div>
        ) : (
          <div className={styles.verticalReader}>
            <div className={styles.pages}>
              {album.pages.map((readerPage, index) => (
                <figure
                  key={`${readerPage.file_path}-${index}`}
                  ref={currentPage === index + 1 ? activePageRef : undefined}
                  className={`${styles.verticalPage} ${
                    currentPage === index + 1 ? styles.verticalPageActive : ""
                  }`}
                  onClick={() => goToPage(index + 1)}
                >
                  {apiUrl && (
                    <img
                      src={getApiImageUrl(apiUrl, readerPage.url)}
                      alt={`Page ${readerPage.sort_order}`}
                      loading={index < 2 ? "eager" : "lazy"}
                      onLoad={
                        currentPage === index + 1
                          ? scrollToActivePage
                          : undefined
                      }
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

        <NavigationControls
          currentPage={currentPage}
          pageCount={album.pages.length}
          pageInput={pageInput}
          onPageInputChange={setPageInput}
          onPageInputSubmit={submitPageInput}
          onGoToPage={goToPage}
          isFirstPage={isFirstPage}
          isLastPage={isLastPage}
        />
      </div>
    </main>
  );
}

function NavigationControls({
  currentPage,
  pageCount,
  pageInput,
  onPageInputChange,
  onPageInputSubmit,
  onGoToPage,
  isFirstPage,
  isLastPage,
}: {
  currentPage: number;
  pageCount: number;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onPageInputSubmit: () => void;
  onGoToPage: (pageNumber: number) => void;
  isFirstPage: boolean;
  isLastPage: boolean;
}) {
  return (
    <nav className={styles.bodyNavigation} aria-label="Page navigation">
      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(1)}
        disabled={isFirstPage}
        aria-label="First page"
        title="First page"
      >
        «{" "}
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(currentPage - 1)}
        disabled={isFirstPage}
        aria-label="Previous page"
      >
        ←
      </button>

      <form
        className={styles.pageJump}
        onSubmit={(event) => {
          event.preventDefault();
          onPageInputSubmit();
        }}
      >
        <input
          value={pageInput}
          onChange={(event) => onPageInputChange(event.target.value)}
          onBlur={onPageInputSubmit}
          aria-label="Page number"
          inputMode="numeric"
        />

        <span>/ {pageCount}</span>
      </form>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(currentPage + 1)}
        disabled={isLastPage}
        aria-label="Next page"
      >
        →
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(pageCount)}
        disabled={isLastPage}
        aria-label="Last page"
        title="Last page"
      >
        »
      </button>
    </nav>
  );
}

export default function ReaderRoute() {
  return null;
}
