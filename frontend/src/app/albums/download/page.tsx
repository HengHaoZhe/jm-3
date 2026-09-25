"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { apiFetch, getApiErrorMessage } from "@/app/lib/api";

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
      const response = await apiFetch("/albums/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          album_ids: parsed.validIds,
        }),
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            `Failed to queue albums (${response.status})`,
          ),
        );
      }

      const result = await response.json();

      const queuedCount = result.data?.queued?.length ?? 0;
      const existingCount = result.data?.existing?.length ?? 0;
      const existingAlbums = result.data?.existing ?? [];

      console.log(
        `Queued ${queuedCount} album(s). ${existingCount} already existed.`,
      );

      setInput("");

      if (
        parsed.validIds.length === 1 &&
        queuedCount === 0 &&
        existingCount === 1 &&
        existingAlbums[0] === parsed.validIds[0]
      ) {
        router.push(`/?search=${encodeURIComponent(parsed.validIds[0])}`);
        return;
      }

      router.push("/");
    } catch (error) {
      setQueueError(
        error instanceof Error
          ? error.message
          : "Unable to queue the selected albums.",
      );
    } finally {
      setQueueing(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/" className={styles.backLink}>
          <i className="bx bx-arrow-back" aria-hidden="true" />
          <span>Back to Library</span>
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
