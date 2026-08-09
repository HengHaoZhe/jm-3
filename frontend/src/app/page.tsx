"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";

interface Album {
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
    to: number | null;
    total: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function Home() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAlbums() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_URL}/api/albums`);

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

    fetchAlbums();
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>JM NEXT</p>
            <h1>Manga Library</h1>
            <p className={styles.subtitle}>Your downloaded manga collection.</p>
          </div>

          <div className={styles.albumCount}>
            {albums.length} album{albums.length === 1 ? "" : "s"}
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
          <div className={styles.message}>
            <h2>No albums yet</h2>
            <p>
              Download an album through the Laravel API and it will appear here.
            </p>
          </div>
        )}

        {!loading && !error && albums.length > 0 && (
          <section className={styles.grid}>
            {albums.map((album) => (
              <Link
                key={album.album_id}
                href={`/albums/${album.album_id}`}
                className={styles.card}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.albumId}>#{album.album_id}</span>

                  <StatusBadge status={album.status} />
                </div>

                <div className={styles.cardBody}>
                  <h2>{album.title || "Untitled Album"}</h2>

                  <div className={styles.metadata}>
                    <span>
                      {album.page_count}{" "}
                      {album.page_count === 1 ? "page" : "pages"}
                    </span>

                    <span>Album ID: {album.album_id}</span>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  <span>Open album</span>
                  <span className={styles.arrow}>→</span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
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
