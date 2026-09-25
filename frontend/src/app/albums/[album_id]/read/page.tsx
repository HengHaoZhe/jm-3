"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import { fetchAlbum, getApiImageUrl, getAlbumPath } from "@/app/lib/api";
import { Album, AlbumResponse, Page } from "@/app/lib/types";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";

type ReaderMode = "single" | "vertical";

const PAGE_BATCH_SIZE = 50;
const PRELOADED_PAGE_RADIUS = 5;

function getProgressKey(albumId: string) {
  return `jm-next-reading-progress:${albumId}`;
}

function getReaderModeKey(albumId: string) {
  return `jm-next-reader-mode:${albumId}`;
}

function isPositiveInteger(pageNumber: number) {
  return Number.isInteger(pageNumber) && pageNumber >= 1;
}

function clampPage(pageNumber: number, pageCount: number) {
  return Math.min(Math.max(pageNumber, 1), pageCount);
}

function getPageBatch(pageNumber: number) {
  return Math.floor((pageNumber - 1) / PAGE_BATCH_SIZE) + 1;
}

function createPageMap(pages: Page[]) {
  return pages.reduce<Record<number, Page>>((mappedPages, page) => {
    mappedPages[page.sort_order] = page;
    return mappedPages;
  }, {});
}

function mergePageMap(currentPages: Record<number, Page>, pages: Page[]) {
  return pages.reduce<Record<number, Page>>(
    (mappedPages, page) => {
      mappedPages[page.sort_order] = page;
      return mappedPages;
    },
    { ...currentPages },
  );
}

function getLoadedPages(pagesByNumber: Record<number, Page>) {
  return Object.values(pagesByNumber).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

export function ReaderPage() {
  const params = useParams<{ album_id: string; page?: string }>();
  const albumId = params.album_id;
  const router = useRouter();
  const pageParam = params.page ?? null;
  const initialPageParamRef = useRef(pageParam);

  const [album, setAlbum] = useState<Album | null>(null);
  const [pagesByNumber, setPagesByNumber] = useState<Record<number, Page>>({});
  const [loadedBatches, setLoadedBatches] = useState<number[]>([]);
  const { apiUrl, error: apiError } = useApiBaseUrl();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const [readerMode, setReaderMode] = useState<ReaderMode>("single");

  const [loading, setLoading] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressRestored, setProgressRestored] = useState(false);
  const [modeRestored, setModeRestored] = useState(false);
  const activePageRef = useRef<HTMLElement | null>(null);
  const verticalLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const inFlightBatchesRef = useRef(new Set<number>());
  const preloadedImagesRef = useRef(new Map<string, HTMLImageElement>());

  useEffect(() => {
    if (!albumId) {
      return;
    }

    let cancelled = false;

    async function loadInitialBatch() {
      try {
        setLoading(true);
        setError(null);
        setProgressRestored(false);
        setModeRestored(false);
        setPagesByNumber({});
        setLoadedBatches([]);
        inFlightBatchesRef.current.clear();
        preloadedImagesRef.current.clear();

        const pageFromUrl =
          initialPageParamRef.current !== null
            ? Number(initialPageParamRef.current)
            : NaN;
        const savedPage = Number(localStorage.getItem(getProgressKey(albumId)));
        const preferredPage = isPositiveInteger(pageFromUrl)
          ? pageFromUrl
          : isPositiveInteger(savedPage)
            ? savedPage
            : 1;

        let result = await fetchAlbum<AlbumResponse>(
          `/albums/${albumId}?per_page=${PAGE_BATCH_SIZE}&page=${getPageBatch(
            preferredPage,
          )}`,
        );

        if (cancelled) {
          return;
        }

        const pageCount = result.data.page_count;
        const restoredPage =
          pageCount > 0 ? clampPage(preferredPage, pageCount) : 1;
        const restoredBatch = getPageBatch(restoredPage);
        const fetchedBatch = getPageBatch(preferredPage);

        if (pageCount > 0 && restoredBatch !== fetchedBatch) {
          result = await fetchAlbum<AlbumResponse>(
            `/albums/${albumId}?per_page=${PAGE_BATCH_SIZE}&page=${restoredBatch}`,
          );

          if (cancelled) {
            return;
          }
        }

        setAlbum({ ...result.data, pages: [] });
        setPagesByNumber(createPageMap(result.data.pages));
        setLoadedBatches([restoredBatch]);
        setCurrentPage(restoredPage);
        setPageInput(String(restoredPage));
        setProgressRestored(true);

        const savedMode = localStorage.getItem(getReaderModeKey(albumId));

        if (savedMode === "single" || savedMode === "vertical") {
          setReaderMode(savedMode);
        }

        setModeRestored(true);
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

    loadInitialBatch();

    return () => {
      cancelled = true;
    };
  }, [albumId]);

  useEffect(() => {
    if (!album || !progressRestored) {
      return;
    }

    localStorage.setItem(getProgressKey(album.album_id), String(currentPage));
  }, [album, currentPage, progressRestored]);

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

    const firstPage = Math.max(currentPage - PRELOADED_PAGE_RADIUS, 1);
    const lastPage = Math.min(
      currentPage + PRELOADED_PAGE_RADIUS,
      album.page_count,
    );

    const missingBatches = new Set<number>();

    for (
      let pageNumber = firstPage;
      pageNumber <= lastPage;
      pageNumber += 1
    ) {
      const cachedPage = pagesByNumber[pageNumber];

      if (cachedPage) {
        preloadPageImage(cachedPage);
      } else {
        const batch = getPageBatch(pageNumber);

        if (!loadedBatches.includes(batch)) {
          missingBatches.add(batch);
        }
      }
    }

    missingBatches.forEach((batch) => {
      void ensureBatchLoaded(batch);
    });
  }, [album, apiUrl, currentPage, loadedBatches, pagesByNumber, readerMode]);

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

  useEffect(() => {
    if (!album || readerMode !== "vertical" || !verticalLoadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry?.isIntersecting) {
          void loadNextVerticalBatch();
        }
      },
      {
        rootMargin: "800px 0px",
      },
    );

    observer.observe(verticalLoadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [album, loadedBatches, loadingPages, readerMode]);

  function scrollToActivePage() {
    activePageRef.current?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }

  function preloadPageImage(page: Page) {
    if (!apiUrl) {
      return;
    }

    const imageUrl = getApiImageUrl(apiUrl, page.url);

    if (preloadedImagesRef.current.has(imageUrl)) {
      return;
    }

    const image = new Image();
    image.src = imageUrl;
    preloadedImagesRef.current.set(imageUrl, image);
  }

  async function fetchPageBatch(batch: number) {
    const result = await fetchAlbum<AlbumResponse>(
      `/albums/${albumId}?per_page=${PAGE_BATCH_SIZE}&page=${batch}`,
    );

    setAlbum((currentAlbum) => {
      if (!currentAlbum) {
        return { ...result.data, pages: [] };
      }

      return {
        ...currentAlbum,
        ...result.data,
        pages: [],
      };
    });

    setPagesByNumber((currentPages) =>
      mergePageMap(currentPages, result.data.pages),
    );

    setLoadedBatches((currentBatches) =>
      currentBatches.includes(batch)
        ? currentBatches
        : [...currentBatches, batch].sort((a, b) => a - b),
    );
  }

  async function ensureBatchLoaded(batch: number) {
    if (
      loadedBatches.includes(batch) ||
      inFlightBatchesRef.current.has(batch)
    ) {
      return;
    }

    try {
      inFlightBatchesRef.current.add(batch);
      setLoadingPages(true);
      await fetchPageBatch(batch);
    } catch {
      // Keep page navigation responsive; visible fetch failures are handled by img tags.
    } finally {
      inFlightBatchesRef.current.delete(batch);
      setLoadingPages(false);
    }
  }

  async function ensurePageBatchLoaded(pageNumber: number) {
    await ensureBatchLoaded(getPageBatch(pageNumber));
  }

  async function loadNextVerticalBatch() {
    if (!album || loadingPages) {
      return;
    }

    const highestLoadedBatch = loadedBatches.length
      ? Math.max(...loadedBatches)
      : 0;
    const nextBatch = highestLoadedBatch + 1;
    const lastBatch = Math.ceil(album.page_count / PAGE_BATCH_SIZE);

    if (nextBatch > lastBatch || loadedBatches.includes(nextBatch)) {
      return;
    }

    try {
      setLoadingPages(true);
      await fetchPageBatch(nextBatch);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more pages.",
      );
    } finally {
      setLoadingPages(false);
    }
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
    if (!album || album.page_count === 0) {
      return;
    }

    const page = clampPage(pageNumber, album.page_count);

    setCurrentPage(page);
    setPageInput(String(page));
    void ensurePageBatchLoaded(page);
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
        <div className={styles.message}>Loading reader...</div>
      </main>
    );
  }

  if (error || apiError || !album) {
    return (
      <main className={styles.reader}>
        <div className={styles.message}>
          <h1>Unable to open reader</h1>
          <p>{error ?? apiError ?? "Album not found."}</p>
          <Link href={getAlbumPath(albumId)} className={styles.backButton}>
            Back to Album
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
            This album is currently <strong>{album.status}</strong>.
          </p>
          <Link href={getAlbumPath(albumId)} className={styles.backButton}>
            Back to Album
          </Link>
        </div>
      </main>
    );
  }

  const page = pagesByNumber[currentPage];
  const loadedPages = getLoadedPages(pagesByNumber);
  const progress =
    album.page_count > 0 ? (currentPage / album.page_count) * 100 : 0;
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === album.page_count;
  const canLoadMoreVertical =
    loadedBatches.length > 0 &&
    Math.max(...loadedBatches) < Math.ceil(album.page_count / PAGE_BATCH_SIZE);

  return (
    <main className={styles.reader}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href={getAlbumPath(albumId)} className={styles.toolbarButton}>
            <i className="bx bx-chevron-left" aria-hidden="true" />
            <span className={styles.backText}>Back</span>
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
              <i
                className={
                  readerMode === "vertical" ? "bx bx-arrow-to-bottom" : "bx bx-file"
                }
                aria-hidden="true"
              />
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
          pageCount={album.page_count}
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

            {page && apiUrl ? (
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
            ) : (
              <div className={styles.pageLoading}>
                {loadingPages ? "Loading page..." : "Page unavailable"}
              </div>
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
              {loadedPages.map((readerPage) => (
                <figure
                  key={readerPage.id}
                  ref={
                    currentPage === readerPage.sort_order
                      ? activePageRef
                      : undefined
                  }
                  className={`${styles.verticalPage} ${
                    currentPage === readerPage.sort_order
                      ? styles.verticalPageActive
                      : ""
                  }`}
                  onClick={() => goToPage(readerPage.sort_order)}
                >
                  {apiUrl && (
                    <img
                      src={getApiImageUrl(apiUrl, readerPage.url)}
                      alt={`Page ${readerPage.sort_order}`}
                      loading={readerPage.sort_order <= 2 ? "eager" : "lazy"}
                      onLoad={
                        currentPage === readerPage.sort_order
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

            <div ref={verticalLoadMoreRef} className={styles.verticalLoadMore}>
              {loadingPages
                ? "Loading more pages..."
                : canLoadMoreVertical
                  ? "More pages load as you scroll"
                  : "End of album"}
            </div>
          </div>
        )}

        <NavigationControls
          currentPage={currentPage}
          pageCount={album.page_count}
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
        <i className="bx bx-chevrons-left" aria-hidden="true" />
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(currentPage - 1)}
        disabled={isFirstPage}
        aria-label="Previous page"
      >
        <i className="bx bx-chevron-left" aria-hidden="true" />
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
        <i className="bx bx-chevron-right" aria-hidden="true" />
      </button>

      <button
        type="button"
        className={styles.navButton}
        onClick={() => onGoToPage(pageCount)}
        disabled={isLastPage}
        aria-label="Last page"
        title="Last page"
      >
        <i className="bx bx-chevrons-right" aria-hidden="true" />
      </button>
    </nav>
  );
}

export default function ReaderRoute() {
  return null;
}
