"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { apiFetch, getApiBaseUrl } from "@/app/lib/api";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";

type SortColumn = "id" | "album_id" | "title" | "status" | "page_count";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | AlbumStatus;

interface Album {
  id: number;
  album_id: string;
  title: string;
  status: AlbumStatus;
  page_count: number;
  created_at: string;
}

interface AlbumsResponse {
  data: Album[];
  links?: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta?: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    total: number;
  };
}

const API_URL = await getApiBaseUrl();

export default function Home() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [redownloadFailedError, setRedownloadFailedError] = useState<
    string | null
  >(null);
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
    return albums.reduce(
      (counts, album) => {
        counts[album.status] += 1;

        return counts;
      },
      {
        queued: 0,
        downloading: 0,
        completed: 0,
        failed: 0,
      } as Record<AlbumStatus, number>,
    );
  }, [albums]);

  function getPreviewUrl(album: Album) {
    return `${API_URL}/api/albums/${encodeURIComponent(
      album.album_id,
    )}/pages/1/image`;
  }

  function updatePreviewPosition(event: React.MouseEvent<HTMLTableRowElement>) {
    const previewWidth = 240;
    const previewHeight = 330;
    const offset = 16;

    let x = event.clientX + offset;
    let y = event.clientY + offset;

    if (x + previewWidth > window.innerWidth - 12) {
      x = event.clientX - previewWidth - offset;
    }

    if (y + previewHeight > window.innerHeight - 12) {
      y = window.innerHeight - previewHeight - 12;
    }

    if (y < 12) {
      y = 12;
    }

    setPreviewPosition({
      x,
      y,
    });
  }

  function handleRowMouseEnter(
    album: Album,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) {
    if (album.page_count <= 0) {
      setHoveredAlbum(null);
      setPreviewLoading(false);
      setPreviewError(false);

      return;
    }

    setHoveredAlbum(album);
    setPreviewLoading(true);
    setPreviewError(false);

    updatePreviewPosition(event);
  }

  function handleRowMouseMove(event: React.MouseEvent<HTMLTableRowElement>) {
    if (!hoveredAlbum) {
      return;
    }

    updatePreviewPosition(event);
  }

  function handleRowMouseLeave() {
    setHoveredAlbum(null);
    setPreviewLoading(false);
    setPreviewError(false);
  }

  async function refreshAlbums() {
    try {
      const response = await apiFetch("/albums");

      if (!response.ok) {
        return;
      }

      const result: AlbumsResponse = await response.json();

      setAlbums(result.data);
    } catch {
      // Ignore background polling errors.
    }
  }

  async function fetchAlbums() {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch("/albums");

      if (!response.ok) {
        throw new Error(`Failed to fetch albums (${response.status})`);
      }

      const result: AlbumsResponse = await response.json();

      setAlbums(result.data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load albums.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlbums();
  }, []);

  /*
   * Poll while at least one album is queued or downloading.
   */
  useEffect(() => {
    const hasActiveDownloads = albums.some(
      (album) => album.status === "queued" || album.status === "downloading",
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

  /*
   * Search + sorting.
   *
   * Search only checks:
   * - database ID
   * - album ID
   * - title
   *
   * Status is deliberately excluded.
   */
  const filteredAndSortedAlbums = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const filtered = albums.filter((album) => {
      const matchesStatus =
        statusFilter === "all" || album.status === statusFilter;

      const matchesSearch =
        !searchTerm ||
        String(album.id).toLowerCase().includes(searchTerm) ||
        album.album_id.toLowerCase().includes(searchTerm) ||
        (album.title ?? "").toLowerCase().includes(searchTerm);

      return matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
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
      setRedownloadFailedError(null);
      setDeleteError(null);
      setRedownloadingFailed(true);

      const response = await apiFetch("/albums/redownload-failed", {
        method: "POST",
      });

      if (!response.ok) {
        let message = `Failed to redownload failed albums (${response.status}).`;

        try {
          const result = await response.json();

          if (result.message) {
            message = result.message;
          }
        } catch {
          // Use default error message.
        }

        throw new Error(message);
      }

      await refreshAlbums();
    } catch (err) {
      if (err instanceof Error) {
        setRedownloadFailedError(err.message);
      } else {
        setRedownloadFailedError("Failed to redownload failed albums.");
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
      setDeleteError(null);
      setDeletingAlbumId(album.id);

      const response = await apiFetch(`/albums/${album.album_id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let message = `Failed to delete album (${response.status}).`;

        try {
          const result = await response.json();

          if (result.message) {
            message = result.message;
          }
        } catch {
          // Use default error message.
        }

        throw new Error(message);
      }

      setAlbums((currentAlbums) =>
        currentAlbums.filter((currentAlbum) => currentAlbum.id !== album.id),
      );
    } catch (err) {
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete album.");
      }
    } finally {
      setDeletingAlbumId(null);
    }
  }

  return (
    <main className={styles.page}>
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

            <code>{API_URL}</code>
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
                  <button
                    type="button"
                    className={`${styles.statusFilterButton} ${
                      statusFilter === "all" ? styles.statusFilterActive : ""
                    }`}
                    onClick={() => setStatusFilter("all")}
                  >
                    All
                    <span>{albums.length}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.statusFilterButton} ${
                      statusFilter === "queued" ? styles.statusFilterActive : ""
                    }`}
                    onClick={() => setStatusFilter("queued")}
                  >
                    Queued
                    <span>{statusCounts.queued}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.statusFilterButton} ${
                      statusFilter === "downloading"
                        ? styles.statusFilterActive
                        : ""
                    }`}
                    onClick={() => setStatusFilter("downloading")}
                  >
                    Downloading
                    <span>{statusCounts.downloading}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.statusFilterButton} ${
                      statusFilter === "completed"
                        ? styles.statusFilterActive
                        : ""
                    }`}
                    onClick={() => setStatusFilter("completed")}
                  >
                    Completed
                    <span>{statusCounts.completed}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.statusFilterButton} ${
                      statusFilter === "failed" ? styles.statusFilterActive : ""
                    }`}
                    onClick={() => setStatusFilter("failed")}
                  >
                    Failed
                    <span>{statusCounts.failed}</span>
                  </button>
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

            {(deleteError || redownloadFailedError) && (
              <p className={styles.inlineError}>
                {deleteError ?? redownloadFailedError}
              </p>
            )}

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
                      >
                        <td className={styles.idCell}>{album.id}</td>

                        <td className={styles.albumIdCell}>
                          #{album.album_id}
                        </td>

                        <td className={styles.titleCell}>
                          <Link
                            href={`/albums/${album.album_id}`}
                            className={styles.albumLink}
                          >
                            {album.title || "Untitled Album"}
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
                            href={`/albums/${album.album_id}`}
                            className={styles.viewButton}
                          >
                            Open
                          </Link>

                          <Link
                            href={`/albums/${album.album_id}/edit`}
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
              {hoveredAlbum.title || "Untitled Album"}
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
  const labels: Record<AlbumStatus, string> = {
    queued: "Queued",
    downloading: "Downloading",
    completed: "Completed",
    failed: "Failed",
  };

  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      <span className={styles.statusDot} />

      {labels[status]}
    </span>
  );
}
