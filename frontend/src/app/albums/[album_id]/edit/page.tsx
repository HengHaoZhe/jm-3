"use client";

import Link from "next/link";
import { DragEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "../page.module.css";
import { apiFetch, getApiBaseUrl } from "@/app/lib/api";

type AlbumStatus = "queued" | "downloading" | "completed" | "failed";

interface Page {
  id: number;
  sort_order: number;
  file_path: string;
  url: string;
}

interface AlbumGroup {
  name: string;
  pages: Page[];
}

interface Album {
  album_id: string;
  title: string;
  status: AlbumStatus;
  page_count: number;
  pages: Page[];
  groups?: AlbumGroup[];
}

interface AlbumResponse {
  data: Album;
}

function getImageUrl(apiUrl: string | null, url: string) {
  if (!apiUrl) {
    return url;
  }

  const parsedUrl = new URL(url);

  return `${apiUrl}${parsedUrl.pathname}${parsedUrl.search}`;
}

function getPageGroupName(filePath: string) {
  const pathParts = filePath.split(/[\\/]/);

  return pathParts.length > 1 ? pathParts[0] : "Root";
}

function groupPages(pages: Page[]): AlbumGroup[] {
  const groups = new Map<string, Page[]>();

  pages.forEach((page) => {
    const groupName = getPageGroupName(page.file_path);
    const groupedPages = groups.get(groupName) ?? [];

    groupedPages.push(page);
    groups.set(groupName, groupedPages);
  });

  return Array.from(groups, ([name, groupedPages]) => ({
    name,
    pages: groupedPages,
  }));
}

function getAlbumGroups(album: Album) {
  return album.groups?.length ? album.groups : groupPages(album.pages ?? []);
}

export default function EditAlbumPage() {
  const params = useParams<{ album_id: string }>();
  const albumId = params.album_id;
  const router = useRouter();

  const [album, setAlbum] = useState<Album | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [countingPages, setCountingPages] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<AlbumStatus>("completed");
  const [editPageCount, setEditPageCount] = useState("");
  const [editGroups, setEditGroups] = useState<AlbumGroup[]>([]);

  const [draggedPageId, setDraggedPageId] = useState<number | null>(null);
  const [dragOverPageId, setDragOverPageId] = useState<number | null>(null);

  const [draggedGroupName, setDraggedGroupName] = useState<string | null>(null);
  const [dragOverGroupName, setDragOverGroupName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    getApiBaseUrl()
      .then((url) => {
        if (!cancelled) {
          setApiUrl(url);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!albumId) {
      return;
    }

    async function fetchAlbum() {
      try {
        setLoading(true);
        setError(null);

        const response = await apiFetch(`/albums/${albumId}/edit`);

        if (response.status === 404) {
          throw new Error("Album not found.");
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch album (${response.status}).`);
        }

        const result: AlbumResponse = await response.json();
        const loadedAlbum = result.data;

        setAlbum(loadedAlbum);
        setEditTitle(loadedAlbum.title ?? "");
        setEditStatus(loadedAlbum.status);
        setEditPageCount(String(loadedAlbum.page_count));
        setEditGroups(getAlbumGroups(loadedAlbum));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load album.");
      } finally {
        setLoading(false);
      }
    }

    fetchAlbum();
  }, [albumId]);

  /*
   * PAGE DRAGGING
   *
   * Pages can now be dragged:
   * - within the same group
   * - from one group to another
   */

  function handleDragStart(
    event: DragEvent<HTMLDivElement>,
    groupName: string,
    pageId: number,
  ) {
    if (editBusy) {
      event.preventDefault();
      return;
    }

    setDraggedPageId(pageId);
    setDragOverPageId(null);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(pageId));
    event.dataTransfer.setData("application/x-album-page", String(pageId));
    event.dataTransfer.setData("application/x-album-group", groupName);
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
    groupName: string,
    pageId: number,
  ) {
    if (editBusy || draggedPageId === null) {
      return;
    }

    if (pageId === draggedPageId) {
      return;
    }

    /*
     * We intentionally do NOT check the source group here.
     *
     * This allows pages to be dragged between different groups.
     */
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    setDragOverPageId(pageId);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetGroupName: string,
    targetPageId: number,
  ) {
    event.preventDefault();

    const sourcePageId = draggedPageId;

    if (editBusy || sourcePageId === null || sourcePageId === targetPageId) {
      handleDragEnd();
      return;
    }

    setEditGroups((currentGroups) => {
      let sourcePage: Page | null = null;
      let sourceGroupName: string | null = null;

      /*
       * Find the dragged page in whichever group currently contains it.
       */
      for (const group of currentGroups) {
        const page = group.pages.find(
          (candidate) => candidate.id === sourcePageId,
        );

        if (page) {
          sourcePage = page;
          sourceGroupName = group.name;
          break;
        }
      }

      if (!sourcePage || !sourceGroupName) {
        return currentGroups;
      }

      /*
       * Remove the page from its source group.
       */
      const groupsWithoutSource = currentGroups.map((group) => {
        if (group.name !== sourceGroupName) {
          return group;
        }

        return {
          ...group,
          pages: group.pages.filter((page) => page.id !== sourcePageId),
        };
      });

      /*
       * Insert the page immediately before the target page.
       */
      return groupsWithoutSource.map((group) => {
        if (group.name !== targetGroupName) {
          return group;
        }

        const targetIndex = group.pages.findIndex(
          (page) => page.id === targetPageId,
        );

        if (targetIndex === -1) {
          return group;
        }

        const updatedPages = [...group.pages];

        updatedPages.splice(targetIndex, 0, sourcePage!);

        return {
          ...group,
          pages: updatedPages,
        };
      });
    });

    handleDragEnd();
  }

  function handleDragEnd() {
    setDraggedPageId(null);
    setDragOverPageId(null);
  }

  /*
   * GROUP DRAGGING
   */

  function handleGroupDragStart(
    event: DragEvent<HTMLElement>,
    groupName: string,
  ) {
    if (editBusy || editGroups.length < 2) {
      event.preventDefault();
      return;
    }

    setDraggedGroupName(groupName);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", groupName);
    event.dataTransfer.setData("application/x-album-group-reorder", groupName);
  }

  function handleGroupDragOver(
    event: DragEvent<HTMLElement>,
    groupName: string,
  ) {
    if (
      editBusy ||
      draggedGroupName === null ||
      draggedGroupName === groupName
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverGroupName(groupName);
  }

  function handleGroupDrop(
    event: DragEvent<HTMLElement>,
    targetGroupName: string,
  ) {
    event.preventDefault();

    const sourceGroupName = draggedGroupName;

    if (
      editBusy ||
      sourceGroupName === null ||
      sourceGroupName === targetGroupName
    ) {
      handleGroupDragEnd();
      return;
    }

    setEditGroups((currentGroups) => {
      const sourceIndex = currentGroups.findIndex(
        (group) => group.name === sourceGroupName,
      );

      const targetIndex = currentGroups.findIndex(
        (group) => group.name === targetGroupName,
      );

      if (sourceIndex === -1 || targetIndex === -1) {
        return currentGroups;
      }

      const updatedGroups = [...currentGroups];
      const [movedGroup] = updatedGroups.splice(sourceIndex, 1);

      updatedGroups.splice(targetIndex, 0, movedGroup);

      return updatedGroups;
    });

    handleGroupDragEnd();
  }

  function handleGroupDragEnd() {
    setDraggedGroupName(null);
    setDragOverGroupName(null);
  }

  async function countPages() {
    try {
      setCountingPages(true);
      setCountError(null);
      setSaveError(null);
      setImportError(null);

      const response = await apiFetch(`/albums/${albumId}/count-pages`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            `Failed to count pages (${response.status}).`,
          ),
        );
      }

      const result: AlbumResponse = await response.json();

      setAlbum(result.data);
      setEditPageCount(String(result.data.page_count));

      if (result.data.pages?.length || result.data.groups?.length) {
        setEditGroups(getAlbumGroups(result.data));
      }
    } catch (err) {
      setCountError(
        err instanceof Error ? err.message : "Failed to count pages.",
      );
    } finally {
      setCountingPages(false);
    }
  }

  async function importPages() {
    try {
      setImporting(true);
      setImportError(null);
      setCountError(null);
      setSaveError(null);

      const response = await apiFetch(`/albums/${albumId}/import-pages`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            `Failed to import files (${response.status}).`,
          ),
        );
      }

      const result: AlbumResponse = await response.json();

      setAlbum(result.data);
      setEditPageCount(String(result.data.page_count));
      setEditGroups(getAlbumGroups(result.data));

      handleDragEnd();
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import files.",
      );
    } finally {
      setImporting(false);
    }
  }

  async function saveChanges() {
    const pageCount = Number(editPageCount);

    if (!Number.isInteger(pageCount) || pageCount < 0) {
      setSaveError("Page count must be a non-negative whole number.");
      return;
    }

    try {
      setSaving(true);
      setSaveError(null);
      setCountError(null);
      setImportError(null);

      console.time("SAVE TOTAL");
      console.time("ALBUM UPDATE");

      const albumResponse = await apiFetch(`/albums/${albumId}`, {
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

      console.timeEnd("ALBUM UPDATE");

      if (!albumResponse.ok) {
        throw new Error(
          await getErrorMessage(
            albumResponse,
            `Failed to update album (${albumResponse.status}).`,
          ),
        );
      }

      /*
       * Flatten the groups in their current order.
       *
       * This means:
       * - group order determines the major ordering
       * - page order inside each group determines the minor ordering
       * - pages moved between groups are saved correctly
       */
      const pageIds = editGroups.flatMap((group) =>
        group.pages.map((page) => page.id),
      );

      console.log("PAGE COUNT:", pageIds.length);
      console.time("PAGE REORDER");

      const reorderResponse = await apiFetch(`/albums/${albumId}/pages/order`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_ids: pageIds,
        }),
      });

      console.timeEnd("PAGE REORDER");

      if (!reorderResponse.ok) {
        throw new Error(
          await getErrorMessage(
            reorderResponse,
            `Failed to save page order (${reorderResponse.status}).`,
          ),
        );
      }

      console.timeEnd("SAVE TOTAL");

      router.push(`/albums/${albumId}`);
    } catch (err) {
      console.timeEnd("SAVE TOTAL");
      setSaveError(
        err instanceof Error ? err.message : "Failed to update album.",
      );
    } finally {
      setSaving(false);
    }
  }

  const editBusy = saving || countingPages || importing;

  function renderGroupPages(group: AlbumGroup, groupIndex: number) {
    return group.pages.map((page, pageIndex) => {
      const pageNumber =
        editGroups
          .slice(0, groupIndex)
          .reduce(
            (count, previousGroup) => count + previousGroup.pages.length,
            0,
          ) +
        pageIndex +
        1;

      const isDragging = draggedPageId === page.id;
      const isDragOver = dragOverPageId === page.id;

      return (
        <div
          key={page.id}
          draggable={!editBusy}
          onDragStart={(event) => handleDragStart(event, group.name, page.id)}
          onDragOver={(event) => handleDragOver(event, group.name, page.id)}
          onDrop={(event) => handleDrop(event, group.name, page.id)}
          onDragEnd={handleDragEnd}
          className={[
            styles.pageOrderItem,
            isDragging ? styles.pageOrderItemDragging : "",
            isDragOver ? styles.pageOrderItemDragOver : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className={styles.dragHandle} aria-hidden="true">
            ⋮⋮
          </div>

          <div className={styles.pageOrderNumber}>{pageNumber}</div>

          <div className={styles.pageOrderThumbnail}>
            <img
              src={getImageUrl(apiUrl, page.url)}
              alt={`Page ${pageNumber}`}
              loading="lazy"
            />
          </div>

          <div className={styles.pageOrderInfo}>
            <strong>Page {pageNumber}</strong>
            <span>{page.file_path}</span>
          </div>
        </div>
      );
    });
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
          <Link href={`/albums/${albumId}`} className={styles.backLink}>
            ← Back to Album
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
        <Link href={`/albums/${album.album_id}`} className={styles.backLink}>
          ← Back to Album
        </Link>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ALBUM / EDIT</p>

            <h1>Edit Album</h1>

            <p className={styles.albumId}>ID: {album.album_id}</p>
          </div>

          <StatusBadge status={album.status} />
        </header>

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
                disabled={editBusy}
              />
            </label>

            <label className={styles.formField}>
              <span>Status</span>

              <select
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(event.target.value as AlbumStatus)
                }
                disabled={editBusy}
              >
                <option value="queued">Queued</option>
                <option value="downloading">Downloading</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </label>

            <label className={styles.formField}>
              <span>Page Count</span>

              <div className={styles.pageCountInput}>
                <input
                  type="number"
                  min="0"
                  max="65535"
                  step="1"
                  value={editPageCount}
                  onChange={(event) => setEditPageCount(event.target.value)}
                  disabled={editBusy}
                />

                <button
                  type="button"
                  className={styles.countPagesButton}
                  onClick={countPages}
                  disabled={editBusy}
                >
                  {countingPages ? "Counting..." : "Count Pages"}
                </button>
              </div>
            </label>

            <div className={styles.importField}>
              <div>
                <span className={styles.importLabel}>Import Files</span>

                <p className={styles.importDescription}>
                  Import image files from the album folder and rebuild the page
                  list.
                </p>
              </div>

              <button
                type="button"
                className={styles.importButton}
                onClick={importPages}
                disabled={editBusy}
              >
                {importing ? "Importing..." : "Import Files"}
              </button>
            </div>

            {importError && (
              <div className={styles.saveError}>{importError}</div>
            )}

            {countError && <div className={styles.saveError}>{countError}</div>}

            {saveError && <div className={styles.saveError}>{saveError}</div>}

            <div className={styles.pageOrderSection}>
              <div className={styles.pageOrderHeader}>
                <div>
                  <span className={styles.importLabel}>Page Order</span>

                  <p className={styles.importDescription}>
                    Drag pages within a group or move pages between groups to
                    change their reading order.
                  </p>
                </div>

                <span className={styles.pageOrderCount}>
                  {editGroups.reduce(
                    (count, group) => count + group.pages.length,
                    0,
                  )}{" "}
                  {editGroups.reduce(
                    (count, group) => count + group.pages.length,
                    0,
                  ) === 1
                    ? "page"
                    : "pages"}
                </span>
              </div>

              <div className={styles.pageOrderList}>
                {editGroups.map((group, groupIndex) =>
                  editGroups.length > 1 ? (
                    <details key={group.name} className={styles.pageOrderGroup}>
                      <summary
                        draggable={editGroups.length > 1 && !editBusy}
                        onDragStart={(event) =>
                          handleGroupDragStart(event, group.name)
                        }
                        onDragOver={(event) =>
                          handleGroupDragOver(event, group.name)
                        }
                        onDrop={(event) => handleGroupDrop(event, group.name)}
                        onDragEnd={handleGroupDragEnd}
                        className={[
                          styles.pageOrderGroupHeader,
                          "d-flex",
                          "align-items-center",
                          "justify-content-between",
                          draggedGroupName === group.name
                            ? styles.pageOrderGroupDragging
                            : "",
                          dragOverGroupName === group.name
                            ? styles.pageOrderGroupDragOver
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <strong>{group.name}</strong>

                        <span className="badge text-bg-light">
                          {group.pages.length}{" "}
                          {group.pages.length === 1 ? "page" : "pages"}
                        </span>
                      </summary>

                      <div className={styles.pageOrderGroupPages}>
                        {renderGroupPages(group, groupIndex)}
                      </div>
                    </details>
                  ) : (
                    <section key={group.name} className={styles.pageOrderGroup}>
                      {renderGroupPages(group, groupIndex)}
                    </section>
                  ),
                )}
              </div>
            </div>

            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => router.push(`/albums/${albumId}`)}
                disabled={editBusy}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.saveButton}
                onClick={saveChanges}
                disabled={editBusy}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const result = await response.json();

    const firstError = result.errors
      ? Object.values(result.errors)
          .flat()
          .find((value) => typeof value === "string")
      : null;

    return firstError || result.message || fallback;
  } catch {
    return fallback;
  }
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
