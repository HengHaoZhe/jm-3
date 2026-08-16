"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { apiFetch } from "@/app/lib/api";

interface Album {
  album_id: string;
  title: string;
}

interface CreateAlbumResponse {
  data: Album;
}

function parseAlbumIds(input: string) {
  const tokens = input
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const validIds: string[] = [];
  const invalidValues: string[] = [];

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      invalidValues.push(token);
      continue;
    }

    if (Number(token) <= 0) {
      invalidValues.push(token);
      continue;
    }

    validIds.push(token);
  }

  const uniqueIds = Array.from(new Set(validIds));

  return {
    validIds: uniqueIds,
    invalidValues,
  };
}

export default function DownloadAlbumsPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const parsed = useMemo(() => parseAlbumIds(input), [input]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (parsed.validIds.length === 0) {
      setQueueError("No valid album IDs were found.");
      return;
    }

    setQueueError(null);
    setQueueing(true);

    try {
      const queueResults = await Promise.all(
        parsed.validIds.map(async (albumId) => {
          try {
            const response = await apiFetch("/albums", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                album_id: albumId,
              }),
            });

            if (!response.ok) {
              let message = `Failed (${response.status})`;

              try {
                const result = await response.json();

                if (result.message) {
                  message = result.message;
                }

                if (result.errors?.album_id?.[0]) {
                  message = result.errors.album_id[0];
                }
              } catch {
                // Keep default error.
              }

              return {
                albumId,
                success: false,
                message,
              };
            }

            const result: CreateAlbumResponse = await response.json();

            return {
              albumId,
              success: true,
              message: `Queued ${result.data.title || `Album #${albumId}`}.`,
            };
          } catch (error) {
            return {
              albumId,
              success: false,
              message:
                error instanceof Error ? error.message : "Request failed.",
            };
          }
        }),
      );

      const anySucceeded = queueResults.some((result) => result.success);

      if (!anySucceeded) {
        setQueueError(
          queueResults[0]?.message || "Unable to queue the selected album IDs.",
        );
        return;
      }

      if (parsed.invalidValues.length === 0) {
        setInput("");
      }

      router.push("/");
    } finally {
      setQueueing(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>
          ← Back to Library
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>DOWNLOAD</p>

          <h1>Download Albums</h1>

          <p className={styles.subtitle}>
            Queue one or multiple JMComic album IDs for download.
          </p>
        </header>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Album IDs</h2>

            <p>Separate IDs using commas, spaces, or new lines.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className={styles.input}
              placeholder={`Example:

123456
123457, 123458
123459 123460`}
              disabled={queueing}
              rows={10}
              spellCheck={false}
            />

            <div className={styles.preview}>
              <div>
                <strong>{parsed.validIds.length}</strong>

                <span>
                  valid ID
                  {parsed.validIds.length === 1 ? "" : "s"}
                </span>
              </div>

              {parsed.invalidValues.length > 0 && (
                <div className={styles.invalid}>
                  <strong>{parsed.invalidValues.length}</strong>

                  <span>
                    invalid value
                    {parsed.invalidValues.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}
            </div>

            {parsed.invalidValues.length > 0 && (
              <div className={styles.validationMessage}>
                Invalid values will not be submitted:
                <div>
                  {parsed.invalidValues.map((value, index) => (
                    <code key={`${value}-${index}`}>{value}</code>
                  ))}
                </div>
              </div>
            )}

            {queueError && (
              <div className={styles.validationMessage}>{queueError}</div>
            )}

            <div className={styles.actions}>
              <Link href="/" className={styles.cancelButton}>
                Cancel
              </Link>

              <button
                type="submit"
                className={styles.queueButton}
                disabled={queueing || parsed.validIds.length === 0}
              >
                {queueing
                  ? "Queueing..."
                  : `Queue ${parsed.validIds.length} Album${
                      parsed.validIds.length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
