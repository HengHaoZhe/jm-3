"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import { apiFetch, getAlbumPath, getApiErrorMessage } from "@/app/lib/api";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";
import {
  ALBUM_STATUS_LABELS,
  ALBUM_STATUSES,
  ACTIVE_ALBUM_STATUSES,
  AlbumStatus,
  AlbumListResponse,
  AlbumSummary,
  createAlbumStatusCounts,
} from "@/app/lib/types";

type SortColumn = "id" | "album_id" | "title" | "status" | "page_count";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | AlbumStatus;

type Album = AlbumSummary;

function getAlbumTitle(album: Album): string {
  return album.title || "Untitled Album";
}

export default function Home() {
  const searchParams = useSearchParams();

  const { apiUrl: apiBaseUrl } = useApiBaseUrl();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingAlbumId, setDeletingAlbumId] = useState<number | null>(null);
  const [redownloadingFailed, setRedownloadingFailed] = useState(false);

  const [search, setSearch] = useState("");

  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [hoveredAlbum, setHoveredAlbum] = useState<Album | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [previewPosition, setPreviewPosition] = useState({
    x: 0,
    y: 0,
  });

  const statusCounts = useMemo(() => {
    return albums.reduce((counts, album) => {
      counts[album.status] += 1;
      return counts;
    }, createAlbumStatusCounts());
  }, [albums]);

  function getPreviewUrl(album: Album) {
    const baseUrl = apiBaseUrl || "";
    return `${baseUrl}/api${getAlbumPath(album.album_id)}/pages/1/image`;
  }

  function resetPreview() {
    setHoveredAlbum(null);
    setPreviewLoading(false);
    setPreviewError(false);
  }

  function showPreview(album: Album, clientX: number, clientY: number) {
    setHoveredAlbum(album);
    setPreviewLoading(true);
    setPreviewError(false);
    updatePreviewPosition(clientX, clientY);
  }

  function updatePreviewPosition(clientX: number, clientY: number) {
    const isMobile = window.innerWidth <= 600;

    const previewWidth = isMobile ? 210 : 240;
    const previewHeight = isMobile ? 315 : 330;
    const offset = isMobile ? 12 : 16;
    const viewportPadding = 12;
    const maxX = window.innerWidth - previewWidth - viewportPadding;
    const maxY = window.innerHeight - previewHeight - viewportPadding;

    let x = clientX + offset;
    let y = clientY + offset;

    if (x + previewWidth > window.innerWidth - viewportPadding) {
      x = clientX - previewWidth - offset;
    }

    if (y + previewHeight > window.innerHeight - viewportPadding) {
      y = clientY - previewHeight - offset;
    }

    x = Math.min(Math.max(x, viewportPadding), Math.max(viewportPadding, maxX));
    y = Math.min(Math.max(y, viewportPadding), Math.max(viewportPadding, maxY));

    setPreviewPosition({ x, y });
  }

  function handleRowMouseEnter(
    album: Album,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) {
    if (album.page_count <= 0) {
      resetPreview();
      return;
    }
    showPreview(album, event.clientX, event.clientY);
  }

  function handleRowMouseMove(event: React.MouseEvent<HTMLTableRowElement>) {
    if (!hoveredAlbum) return;
    updatePreviewPosition(event.clientX, event.clientY);
  }

  function handleRowTouchStart(
    album: Album,
    event: React.TouchEvent<HTMLTableRowElement>,
  ) {
    if (album.page_count <= 0) {
      resetPreview();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    showPreview(album, touch.clientX, touch.clientY);
  }

  function handleRowMouseLeave() {
    if (window.innerWidth <= 600) return;
    resetPreview();
  }

  function handlePageTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (window.innerWidth > 600) return;
    const target = event.target;
    if (target instanceof Element && target.closest("table")) return;
    resetPreview();
  }

  async function loadAlbums(isBackgroundPolling: boolean) {
    try {
      if (!isBackgroundPolling) {
        setLoading(true);
        setError(null);
      }
      const response = await apiFetch("/albums");
      if (!response.ok) {
        if (isBackgroundPolling) return;
        throw new Error(`Failed to fetch albums (${response.status})`);
      }
      const result: AlbumListResponse = await response.json();
      setAlbums(result.data);
    } catch (err) {
      if (isBackgroundPolling) return;
      setError(err instanceof Error ? err.message : "Failed to load albums.");
    } finally {
      if (!isBackgroundPolling) setLoading(false);
    }
  }

  function refreshAlbums() {
    return loadAlbums(true);
  }

  useEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch !== null) {
      setSearch(urlSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    loadAlbums(false);
  }, []);

  /*
   * Poll while at least one album is queued or downloading.
   */
  useEffect(() => {
    const hasActiveDownloads = albums.some((album) =>
      ACTIVE_ALBUM_STATUSES.includes(album.status),
    );

    if (!hasActiveDownloads) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshAlbums();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [albums]);

  const filteredAndSortedAlbums = useMemo(() => {
    const searchTerms = search
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = albums.filter((album) => {
      const matchesStatus =
        statusFilter === "all" || album.status === statusFilter;

      const searchableFields = [
        String(album.id),
        album.album_id,
        album.title ?? "",
      ].map((field) => field.toLowerCase());

      const matchesSearch = searchTerms.every((term) =>
        searchableFields.some((field) => field.includes(term)),
      );

      return matchesStatus && matchesSearch;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case "id":
          comparison = a.id - b.id;
          break;

        case "album_id":
          comparison = a.album_id.localeCompare(b.album_id, undefined, {
            numeric: true,
            sensitivity: "base",
          });
          break;

        case "title":
          const titleA = a.title ?? "";
          const titleB = b.title ?? "";

          comparison = titleA.localeCompare(titleB, undefined, {
            sensitivity: "base",
          });
          break;

        case "status":
          comparison = a.status.localeCompare(b.status);
          break;

        case "page_count":
          comparison = a.page_count - b.page_count;
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [albums, search, statusFilter, sortColumn, sortDirection]);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));

      return;
    }

    setSortColumn(column);
    setSortDirection("asc");
  }

  function renderSortIndicator(column: SortColumn) {
    if (sortColumn !== column) {
      return <span className={styles.sortIndicator}>↕</span>;
    }

    return (
      <span className={styles.sortIndicator}>
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  function clearReadingProgress() {
    const prefix = "jm-next-reading-progress:";

    const keysToRemove: string[] = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    window.alert("All reading progress has been cleared.");
  }

  async function handleRedownloadFailed() {
    if (statusCounts.failed === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Redownload all failed albums (${statusCounts.failed})?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionError(null);
      setRedownloadingFailed(true);

      const response = await apiFetch("/albums/redownload-failed", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            `Failed to redownload failed albums (${response.status}).`,
          ),
        );
      }

      await refreshAlbums();
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to redownload failed albums.");
      }
    } finally {
      setRedownloadingFailed(false);
    }
  }

  async function handleDeleteAlbum(album: Album) {
    const confirmed = window.confirm(
      `Delete album #${album.album_id}? This also removes its downloaded files and cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionError(null);
      setDeletingAlbumId(album.id);

      const response = await apiFetch(`/albums/${album.album_id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            `Failed to delete album (${response.status}).`,
          ),
        );
      }

      setAlbums((currentAlbums) =>
        currentAlbums.filter((currentAlbum) => currentAlbum.id !== album.id),
      );
    } catch (err) {
      if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Failed to delete album.");
      }
    } finally {
      setDeletingAlbumId(null);
    }
  }

  return (
    <main className={styles.page} onTouchStart={handlePageTouchStart}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>JM NEXT</p>

            <h1>Manga Library</h1>

            <p className={styles.subtitle}>Your downloaded manga collection.</p>
          </div>

          <div className={styles.headerActions}>
            <Link href="/albums/download" className={styles.downloadButton}>
              + Download Albums
            </Link>

            <button
              type="button"
              className={styles.clearProgressButton}
              onClick={clearReadingProgress}
            >
              Clear Reading Progress
            </button>

            <button
              type="button"
              className={styles.redownloadFailedButton}
              onClick={handleRedownloadFailed}
              disabled={redownloadingFailed || statusCounts.failed === 0}
            >
              {redownloadingFailed
                ? "Redownloading Failed..."
                : "Redownload Failed"}
            </button>

            <div className={styles.albumCount}>
              {albums.length} album
              {albums.length === 1 ? "" : "s"}
            </div>
          </div>
        </header>

        {loading && <div className={styles.message}>Loading albums...</div>}

        {error && (
          <div className={`${styles.message} ${styles.error}`}>
            <h2>Unable to load albums</h2>

            <p>{error}</p>

            <p>Make sure the Laravel API is running at:</p>

            <code>{apiBaseUrl || "http://localhost:8000"}</code>
          </div>
        )}

        {!loading && !error && albums.length === 0 && (
          <div className={styles.emptyLibrary}>
            <h2>No albums yet</h2>

            <p>Download an album to get started.</p>

            <Link href="/albums/download" className={styles.downloadButton}>
              + Download Albums
            </Link>
          </div>
        )}

        {!loading && !error && albums.length > 0 && (
          <section className={styles.librarySection}>
            <div className={styles.libraryHeader}>
              <div>
                <p className={styles.eyebrow}>LIBRARY</p>

                <h2>Albums</h2>
              </div>

              <div className={styles.libraryTools}>
                <span className={styles.resultCount}>
                  {filteredAndSortedAlbums.length} result
                  {filteredAndSortedAlbums.length === 1 ? "" : "s"}
                </span>

                <div className={styles.statusFilters}>
                  {[
                    {
                      value: "all" as const,
                      label: "All",
                      count: albums.length,
                    },
                    ...ALBUM_STATUSES.map((status) => ({
                      value: status,
                      label: ALBUM_STATUS_LABELS[status],
                      count: statusCounts[status],
                    })),
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.statusFilterButton} ${
                        statusFilter === option.value
                          ? styles.statusFilterActive
                          : ""
                      }`}
                      onClick={() => setStatusFilter(option.value)}
                    >
                      {option.label}
                      <span>{option.count}</span>
                    </button>
                  ))}
                </div>

                <div className={styles.searchWrapper}>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ID, album ID, title..."
                    className={styles.searchInput}
                    aria-label="Search albums"
                  />

                  {search && (
                    <button
                      type="button"
                      className={styles.clearSearchButton}
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {actionError && <p className={styles.inlineError}>{actionError}</p>}

            {filteredAndSortedAlbums.length === 0 ? (
              <div className={styles.emptySearch}>
                <h3>No matching albums</h3>

                <p>Try searching by database ID, album ID, or title.</p>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <SortableHeader
                        label="ID"
                        column="id"
                        currentColumn={sortColumn}
                        onSort={handleSort}
                        renderIndicator={renderSortIndicator}
                      />

                      <SortableHeader
                        label="Album ID"
                        column="album_id"
                        currentColumn={sortColumn}
                        onSort={handleSort}
                        renderIndicator={renderSortIndicator}
                      />

                      <SortableHeader
                        label="Title"
                        column="title"
                        currentColumn={sortColumn}
                        onSort={handleSort}
                        renderIndicator={renderSortIndicator}
                      />

                      <SortableHeader
                        label="Status"
                        column="status"
                        currentColumn={sortColumn}
                        onSort={handleSort}
                        renderIndicator={renderSortIndicator}
                      />

                      <SortableHeader
                        label="Pages"
                        column="page_count"
                        currentColumn={sortColumn}
                        onSort={handleSort}
                        renderIndicator={renderSortIndicator}
                        align="right"
                      />

                      <th className={styles.actionsHeader}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedAlbums.map((album) => (
                      <tr
                        key={album.id}
                        onMouseEnter={(event) =>
                          handleRowMouseEnter(album, event)
                        }
                        onMouseMove={handleRowMouseMove}
                        onMouseLeave={handleRowMouseLeave}
                        onTouchStart={(event) =>
                          handleRowTouchStart(album, event)
                        }
                      >
                        <td className={styles.idCell}>{album.id}</td>

                        <td className={styles.albumIdCell}>
                          #{album.album_id}
                        </td>

                        <td className={styles.titleCell}>
                          <Link
                            href={getAlbumPath(album.album_id)}
                            className={styles.albumLink}
                          >
                            {getAlbumTitle(album)}
                          </Link>
                        </td>

                        <td>
                          <StatusBadge status={album.status} />
                        </td>

                        <td className={styles.pageCountCell}>
                          {album.page_count}
                        </td>

                        <td className={styles.actionsCell}>
                          <Link
                            href={getAlbumPath(album.album_id)}
                            className={styles.viewButton}
                          >
                            Open
                          </Link>

                          <Link
                            href={`${getAlbumPath(album.album_id)}/edit`}
                            className={styles.editButton}
                          >
                            Edit
                          </Link>

                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => handleDeleteAlbum(album)}
                            disabled={deletingAlbumId !== null}
                          >
                            {deletingAlbumId === album.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {hoveredAlbum && hoveredAlbum.page_count > 0 && (
        <div
          className={styles.previewCard}
          style={{
            left: previewPosition.x,
            top: previewPosition.y,
          }}
        >
          <div className={styles.previewImageWrapper}>
            {previewLoading && (
              <div className={styles.previewLoading}>
                <span className={styles.previewSpinner} />

                <span className={styles.previewLoadingText}>Loading...</span>
              </div>
            )}

            {!previewError && (
              <img
                key={hoveredAlbum.id}
                src={getPreviewUrl(hoveredAlbum)}
                alt={hoveredAlbum.title || "Album preview"}
                className={`${styles.previewImage} ${
                  previewLoading ? styles.previewImageLoading : ""
                }`}
                onLoad={() => {
                  setPreviewLoading(false);
                }}
                onError={() => {
                  setPreviewLoading(false);
                  setPreviewError(true);
                }}
              />
            )}

            {previewError && (
              <div className={styles.previewError}>Unable to load preview</div>
            )}
          </div>

          <div className={styles.previewInfo}>
            <span className={styles.previewTitle}>
              {getAlbumTitle(hoveredAlbum)}
            </span>

            <span className={styles.previewPages}>
              {hoveredAlbum.page_count} pages
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function SortableHeader({
  label,
  column,
  currentColumn,
  onSort,
  renderIndicator,
  align,
}: {
  label: string;
  column: SortColumn;
  currentColumn: SortColumn;
  onSort: (column: SortColumn) => void;
  renderIndicator: (column: SortColumn) => React.ReactNode;
  align?: "right";
}) {
  const isActive = currentColumn === column;

  return (
    <th
      className={`${styles.sortableHeader} ${
        align === "right" ? styles.rightHeader : ""
      }`}
      aria-sort={isActive ? "other" : "none"}
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>

        {renderIndicator(column)}
      </button>
    </th>
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
