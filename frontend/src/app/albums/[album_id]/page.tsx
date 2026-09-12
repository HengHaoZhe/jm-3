"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import {
  apiFetch,
  fetchAlbum,
  getApiErrorMessage,
  getApiImageUrl,
  getAlbumPath,
} from "@/app/lib/api";
import {
  ALBUM_STATUS_LABELS,
  Album,
  AlbumResponse,
  AlbumStatus,
} from "@/app/lib/types";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";

export default function AlbumPage() {
  const params = useParams<{ album_id: string }>();
  const albumId = params.album_id;

  const [album, setAlbum] = useState<Album | null>(null);
  const { apiUrl } = useApiBaseUrl();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [redownloading, setRedownloading] = useState(false);
  const [redownloadError, setRedownloadError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /*
   * Fetch first page of album pages.
   */
  useEffect(() => {
    async function loadAlbum() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchAlbum<AlbumResponse>(
          `/albums/${albumId}?per_page=20&page=1`,
        );

        setAlbum(result.data);
        setCurrentPage(result.meta?.current_page ?? 1);
        setHasMorePages(result.meta?.has_more ?? false);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load album.");
        }
      } finally {
        setLoading(false);
      }
    }

    if (albumId) {
      loadAlbum();
    }
  }, [albumId]);

  /*
   * Poll downloading albums.
   *
   * Only the first page is needed while an album is being
   * downloaded. Once completed, the user can load more pages.
   */
  useEffect(() => {
    if (!album) {
      return;
    }

    const isDownloading =
      album.status === "queued" || album.status === "downloading";

    if (!isDownloading) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const result = await fetchAlbum<AlbumResponse>(
          `/albums/${albumId}?per_page=20&page=1`,
        );

        setAlbum(result.data);
        setCurrentPage(result.meta?.current_page ?? 1);
        setHasMorePages(result.meta?.has_more ?? false);
      } catch {
        // Ignore background polling errors.
      }
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [album, albumId]);

  /*
   * Load the next batch of pages.
   */
  async function loadMorePages() {
    if (!album || loadingMore || !hasMorePages) {
      return;
    }

    try {
      setLoadingMore(true);
      setError(null);

      const nextPage = currentPage + 1;

      const response = await apiFetch(
        `/albums/${albumId}?per_page=20&page=${nextPage}`,
      );

      if (!response.ok) {
        throw new Error(`Failed to load more pages (${response.status}).`);
      }

      const result: AlbumResponse = await response.json();

      setAlbum((currentAlbum) => {
        if (!currentAlbum) {
          return result.data;
        }

        return {
          ...currentAlbum,
          pages: [...currentAlbum.pages, ...result.data.pages],
        };
      });

      setCurrentPage(result.meta?.current_page ?? nextPage);
      setHasMorePages(result.meta?.has_more ?? false);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load more pages.");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  /*
   * Redownload.
   */
  async function redownloadAlbum() {
    if (!album) {
      return;
    }

    try {
      setRedownloading(true);
      setRedownloadError(null);

      const response = await apiFetch(`/albums/${albumId}/redownload`, {
        method: "POST",
      });

      if (!response.ok) {
        let message = `Failed to redownload album (${response.status}).`;

        try {
          message = await getApiErrorMessage(response, message);
        } catch {
          // Use default message.
        }

        throw new Error(message);
      }

      const result: AlbumResponse = await response.json();

      setAlbum(result.data);
      setCurrentPage(result.meta?.current_page ?? 1);
      setHasMorePages(result.meta?.has_more ?? false);
    } catch (err) {
      if (err instanceof Error) {
        setRedownloadError(err.message);
      } else {
        setRedownloadError("Failed to redownload album.");
      }
    } finally {
      setRedownloading(false);
    }
  }

  const headerBusy = redownloading;

  /*
   * Always sort pages by sort_order before rendering.
   *
   * Create a copy so the original album.pages array is not mutated.
   */
  const sortedPages = album?.pages ?? [];

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loading}>Loading album...</p>
        </div>
      </main>
    );
  }

  if (error || !album) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href="/" className={styles.backLink}>
            ← Back to Library
          </Link>

          <div className={styles.message}>
            <h1>Unable to load album</h1>

            <p>{error ?? "Album not found."}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>
          ← Back to Library
        </Link>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ALBUM</p>

            <h1>{album.title || `Album ${album.album_id}`}</h1>

            <p className={styles.albumId}>ID: {album.album_id}</p>
          </div>

          <div className={styles.headerActions}>
            <Link
              href={`${getAlbumPath(album.album_id)}/edit`}
              className={styles.editButton}
            >
              Edit
            </Link>

            <button
              type="button"
              className={styles.redownloadButton}
              onClick={redownloadAlbum}
              disabled={headerBusy}
            >
              {redownloading ? "Re-downloading..." : "Redownload"}
            </button>

            {album.status === "completed" && (
              <Link
                href={`${getAlbumPath(album.album_id)}/read`}
                className={styles.readButton}
              >
                Read
              </Link>
            )}

            <StatusBadge status={album.status} />
          </div>
        </header>

        {redownloadError && (
          <div className={styles.actionError}>{redownloadError}</div>
        )}

        <section className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <span className={styles.infoLabel}>Status</span>

            <strong>{ALBUM_STATUS_LABELS[album.status]}</strong>
          </div>

          <div className={styles.infoCard}>
            <span className={styles.infoLabel}>Pages</span>

            <strong>{album.page_count}</strong>
          </div>

          <div className={styles.infoCard}>
            <span className={styles.infoLabel}>Album ID</span>

            <strong>{album.album_id}</strong>
          </div>
        </section>

        {album.status === "queued" && (
          <div className={styles.message}>
            <h2>Download queued</h2>

            <p>This album is waiting for the download worker to start.</p>
          </div>
        )}

        {album.status === "downloading" && (
          <div className={styles.message}>
            <h2>Downloading album...</h2>

            <p>
              The album is currently being downloaded. This page will update
              automatically.
            </p>
          </div>
        )}

        {album.status === "failed" && (
          <div className={styles.message}>
            <h2>Download failed</h2>

            <p>
              The download could not be completed. You can place your own files
              in the album folder and use Import Files from Edit.
            </p>
          </div>
        )}

        {album.status === "completed" && (
          <section className={styles.pagesSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>CONTENT</p>

                <h2>Pages</h2>
              </div>

              <span className={styles.pageCount}>
                {sortedPages.length}{" "}
                {sortedPages.length === 1 ? "page" : "pages"}
              </span>
            </div>

            <div className={styles.pagePreviewList}>
              {sortedPages.map((page) => (
                <figure key={page.id} className={styles.pagePreview}>
                  <Link
                    href={`${getAlbumPath(album.album_id)}/read/${page.sort_order}`}
                    className={styles.pagePreviewLink}
                  >
                    <div className={styles.pageLabel}>
                      Page {page.sort_order}
                    </div>

                    <img
                      src={getApiImageUrl(apiUrl, page.url)}
                      alt={`Page ${page.sort_order}`}
                      loading={page.sort_order <= 2 ? "eager" : "lazy"}
                    />
                  </Link>
                </figure>
              ))}
            </div>

            <div className={styles.loadMoreContainer}>
              {hasMorePages && (
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  onClick={loadMorePages}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : "Load More Pages"}
                </button>
              )}

              <span className={styles.loadMoreInfo}>
                Showing {sortedPages.length} of {album.page_count} pages
              </span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: AlbumStatus }) {
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      <span className={styles.statusDot} />

      {ALBUM_STATUS_LABELS[status]}
    </span>
  );
}
