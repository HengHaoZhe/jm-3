"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import { apiFetch, getApiBaseUrl } from "@/app/lib/api";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";

type SortColumn = "id" | "album_id" | "title" | "status" | "page_count";
type SortDirection = "asc" | "desc";

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

  const [search, setSearch] = useState("");

  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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
      if (!searchTerm) {
        return true;
      }

      return (
        String(album.id).toLowerCase().includes(searchTerm) ||
        album.album_id.toLowerCase().includes(searchTerm) ||
        album.title.toLowerCase().includes(searchTerm)
      );
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
          comparison = a.title.localeCompare(b.title, undefined, {
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
  }, [albums, search, sortColumn, sortDirection]);

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
                      <tr key={album.id}>
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
