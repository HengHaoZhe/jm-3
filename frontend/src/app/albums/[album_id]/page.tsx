"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

const API_URL = await getApiBaseUrl();

function getImageUrl(url: string) {
  const parsedUrl = new URL(url);

  return `${API_URL}${parsedUrl.pathname}${parsedUrl.search}`;
}

export default function AlbumPage() {
  const params = useParams<{ album_id: string }>();
  const albumId = params.album_id;

  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<AlbumStatus>("completed");
  const [editPageCount, setEditPageCount] = useState("");

  useEffect(() => {
    async function fetchAlbum() {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch(`/albums/${albumId}`);

        if (response.status === 404) {
          throw new Error("Album not found.");
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch album (${response.status}).`);
        }

        const result: AlbumResponse = await response.json();

        setAlbum(result.data);
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
      fetchAlbum();
    }
  }, [albumId]);

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
        const response = await apiFetch(`/albums/${albumId}`);

        if (!response.ok) {
          return;
        }

        const result: AlbumResponse = await response.json();

        setAlbum(result.data);
      } catch {
        // Ignore background polling errors.
      }
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [album, albumId]);

  function startEditing() {
    if (!album) {
      return;
    }

    setEditTitle(album.title);
    setEditStatus(album.status);
    setEditPageCount(String(album.page_count));
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setSaveError(null);
    setEditing(false);
  }

  async function saveChanges() {
    if (!album) {
      return;
    }

    const pageCount = Number(editPageCount);

    if (!Number.isInteger(pageCount) || pageCount < 0) {
      setSaveError("Page count must be a non-negative whole number.");
      return;
    }

    try {
      setSaving(true);
      setSaveError(null);

      const response = await apiFetch(`/albums/${albumId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          status: editStatus,
          page_count: pageCount,
        }),
      });

      if (!response.ok) {
        let message = `Failed to update album (${response.status}).`;

        try {
          const result = await response.json();

          if (result.message) {
            message = result.message;
          }

          if (result.errors) {
            const firstError = Object.values(result.errors)
              .flat()
              .find((value) => typeof value === "string");

            if (firstError) {
              message = firstError;
            }
          }
        } catch {
          // Use the default error message.
        }

        throw new Error(message);
      }

      const result: AlbumResponse = await response.json();

      setAlbum(result.data);
      setEditing(false);
    } catch (err) {
      if (err instanceof Error) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to update album.");
      }
    } finally {
      setSaving(false);
    }
  }

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
            {!editing && (
              <button
                type="button"
                className={styles.editButton}
                onClick={startEditing}
              >
                Edit
              </button>
            )}

            {album.status === "completed" && !editing && (
              <Link
                href={`/albums/${album.album_id}/read`}
                className={styles.readButton}
              >
                Read
              </Link>
            )}

            <StatusBadge status={album.status} />
          </div>
        </header>

        {editing && (
          <section className={styles.editSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>EDIT</p>

                <h2>Album Details</h2>
              </div>
            </div>

            <div className={styles.editForm}>
              <label className={styles.formField}>
                <span>Title</span>

                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  maxLength={255}
                  disabled={saving}
                />
              </label>

              <label className={styles.formField}>
                <span>Status</span>

                <select
                  value={editStatus}
                  onChange={(event) =>
                    setEditStatus(event.target.value as AlbumStatus)
                  }
                  disabled={saving}
                >
                  <option value="queued">Queued</option>
                  <option value="downloading">Downloading</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </label>

              <label className={styles.formField}>
                <span>Page Count</span>

                <input
                  type="number"
                  min="0"
                  max="65535"
                  step="1"
                  value={editPageCount}
                  onChange={(event) => setEditPageCount(event.target.value)}
                  disabled={saving}
                />
              </label>

              {saveError && <div className={styles.saveError}>{saveError}</div>}

              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={saveChanges}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className={styles.infoGrid}>
          <div className={styles.infoCard}>
            <span className={styles.infoLabel}>Status</span>

            <strong>{formatStatus(album.status)}</strong>
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

            <p>The download could not be completed.</p>
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
                {album.pages.length}{" "}
                {album.pages.length === 1 ? "page" : "pages"}
              </span>
            </div>

            <div className={styles.pagePreviewList}>
              {album.pages.map((page) => (
                <figure key={page.sort_order} className={styles.pagePreview}>
                  <Link
                    href={`/albums/${album.album_id}/read?page=${page.sort_order}`}
                    className={styles.pagePreviewLink}
                  >
                    <div className={styles.pageLabel}>
                      Page {page.sort_order}
                    </div>

                    <img
                      src={getImageUrl(page.url)}
                      alt={`Page ${page.sort_order}`}
                      loading={page.sort_order <= 2 ? "eager" : "lazy"}
                    />
                  </Link>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function formatStatus(status: AlbumStatus) {
  return {
    queued: "Queued",
    downloading: "Downloading",
    completed: "Completed",
    failed: "Failed",
  }[status];
}

function StatusBadge({ status }: { status: AlbumStatus }) {
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      <span className={styles.statusDot} />

      {formatStatus(status)}
    </span>
  );
}
