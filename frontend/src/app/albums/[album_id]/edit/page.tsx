"use client";

import Link from "next/link";
import { DragEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "../page.module.css";
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
  AlbumGroup,
  Page,
  AlbumResponse,
  AlbumStatus,
} from "@/app/lib/types";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";

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
  const { apiUrl } = useApiBaseUrl();
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

  /*
   * EDGE AUTO-SCROLL
   *
   * The animation frame keeps scrolling smoothly while the user
   * holds an item near the top/bottom edge of the viewport.
   */
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollYRef = useRef<number | null>(null);

  const EDGE_SCROLL_ZONE = 120;
  const MAX_SCROLL_SPEED = 18;

  function stopAutoScroll() {
    autoScrollYRef.current = null;

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function runAutoScroll() {
    if (autoScrollYRef.current === null) {
      autoScrollFrameRef.current = null;
      return;
    }

    const clientY = autoScrollYRef.current;
    const viewportHeight = window.innerHeight;

    let scrollAmount = 0;

    /*
     * Near the top:
     * closer to the edge = faster upward scrolling
     */
    if (clientY < EDGE_SCROLL_ZONE) {
      const distance = Math.max(clientY, 0);
      const intensity = 1 - distance / EDGE_SCROLL_ZONE;

      scrollAmount = -Math.max(2, intensity * MAX_SCROLL_SPEED);
    } else if (clientY > viewportHeight - EDGE_SCROLL_ZONE) {
      /*
       * Near the bottom:
       * closer to the edge = faster downward scrolling
       */
      const distance = Math.max(viewportHeight - clientY, 0);
      const intensity = 1 - distance / EDGE_SCROLL_ZONE;

      scrollAmount = Math.max(2, intensity * MAX_SCROLL_SPEED);
    }

    if (scrollAmount !== 0) {
      window.scrollBy({
        top: scrollAmount,
        behavior: "auto",
      });
    }

    autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
  }

  function updateAutoScroll(clientY: number) {
    autoScrollYRef.current = clientY;

    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    }
  }

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);

  useEffect(() => {
    if (!albumId) {
      return;
    }

    async function loadAlbum() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchAlbum<AlbumResponse>(
          `/albums/${albumId}/edit`,
        );
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

    loadAlbum();
  }, [albumId]);

  /*
   * PAGE DRAGGING
   *
   * Pages can now be dragged:
   * - within the same group
   * - from one group to another
   */

  function handleDragStart(event: DragEvent<HTMLDivElement>, pageId: number) {
    if (editBusy) {
      event.preventDefault();
      return;
    }

    setDraggedPageId(pageId);
    setDragOverPageId(null);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(pageId));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, pageId: number) {
    if (editBusy || draggedPageId === null) {
      return;
    }

    /*
     * Keep updating the auto-scroll position even when the
     * dragged item is currently over another page.
     */
    updateAutoScroll(event.clientY);

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

    stopAutoScroll();

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
    stopAutoScroll();

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
    if (editBusy || draggedGroupName === null) {
      return;
    }

    /*
     * Group dragging also uses the same edge auto-scroll.
     */
    updateAutoScroll(event.clientY);

    if (draggedGroupName === groupName) {
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

    stopAutoScroll();

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
      let sourceIndex = -1;
      let targetIndex = -1;

      for (let index = 0; index < currentGroups.length; index += 1) {
        const group = currentGroups[index];

        if (group.name === sourceGroupName) {
          sourceIndex = index;
        }

        if (group.name === targetGroupName) {
          targetIndex = index;
        }

        if (sourceIndex !== -1 && targetIndex !== -1) {
          break;
        }
      }

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
    stopAutoScroll();

    setDraggedGroupName(null);
    setDragOverGroupName(null);
  }

  function resetErrors() {
    setCountError(null);
    setSaveError(null);
    setImportError(null);
  }

  async function countPages() {
    try {
      setCountingPages(true);
      resetErrors();

      const response = await apiFetch(`/albums/${albumId}/count-pages`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            `Failed to count pages (${response.status}).`,
          ),
        );
      }

      const result: AlbumResponse = await response.json();

      setAlbum(result.data);
      setEditPageCount(String(result.data.page_count));
      setEditGroups(getAlbumGroups(result.data));
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
      resetErrors();

      const response = await apiFetch(`/albums/${albumId}/import-pages`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
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
    const pageIds = editGroups.flatMap((group) =>
      group.pages.map((page) => page.id),
    );
    const savedPageCount = pageIds.length === 0 ? 0 : pageCount;

    if (!Number.isInteger(pageCount) || pageCount < 0) {
      setSaveError("Page count must be a non-negative whole number.");
      return;
    }

    try {
      setSaving(true);
      resetErrors();

      const albumResponse = await apiFetch(`/albums/${albumId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editTitle,
          status: editStatus,
          page_count: savedPageCount,
        }),
      });

      if (!albumResponse.ok) {
        throw new Error(
          await getApiErrorMessage(
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
      if (pageIds.length > 0) {
        const reorderResponse = await apiFetch(
          `/albums/${albumId}/pages/order`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              page_ids: pageIds,
            }),
          },
        );

        if (!reorderResponse.ok) {
          throw new Error(
            await getApiErrorMessage(
              reorderResponse,
              `Failed to save page order (${reorderResponse.status}).`,
            ),
          );
        }
      }

      router.push("/");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update album.",
      );
    } finally {
      setSaving(false);
    }
  }

  const editBusy = saving || countingPages || importing;

  const totalPageCount = editGroups.reduce(
    (count, group) => count + group.pages.length,
    0,
  );

  const cumulativePageTotals = editGroups.reduce<number[]>((totals, group) => {
    const previousTotal = totals.length === 0 ? 0 : totals[totals.length - 1];

    totals.push(previousTotal + group.pages.length);
    return totals;
  }, []);

  function renderGroupPages(group: AlbumGroup, groupIndex: number) {
    return group.pages.map((page, pageIndex) => {
      const pageNumber =
        (cumulativePageTotals[groupIndex - 1] ?? 0) + pageIndex + 1;

      const isDragging = draggedPageId === page.id;
      const isDragOver = dragOverPageId === page.id;

      return (
        <div
          key={page.id}
          draggable={!editBusy}
          onDragStart={(event) => handleDragStart(event, page.id)}
          onDragOver={(event) => handleDragOver(event, page.id)}
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
            <i className="bx bx-grid-vertical" />
          </div>

          <div className={styles.pageOrderNumber}>{pageNumber}</div>

          <div className={styles.pageOrderThumbnail}>
            <img
              src={getApiImageUrl(apiUrl, page.url)}
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
          <Link href="/" className={styles.backLink}>
            <i className="bx bx-arrow-back" aria-hidden="true" />
            <span>Back to Library</span>
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
          <i className="bx bx-arrow-back" aria-hidden="true" />
          <span>Back to Library</span>
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
                  {totalPageCount} {totalPageCount === 1 ? "page" : "pages"}
                </span>
              </div>

              <div className={styles.pageOrderList}>
                {editGroups.map((group, groupIndex) => (
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
                      <span className={styles.pageOrderGroupTitle}>
                        <i
                          className={`bx bx-chevron-right ${styles.groupDisclosureIcon}`}
                          aria-hidden="true"
                        />
                        <strong>{group.name}</strong>
                      </span>

                      <span className="badge text-bg-light">
                        {group.pages.length}{" "}
                        {group.pages.length === 1 ? "page" : "pages"}
                      </span>
                    </summary>

                    <div className={styles.pageOrderGroupPages}>
                      {renderGroupPages(group, groupIndex)}
                    </div>
                  </details>
                ))}
              </div>
            </div>

            <div className={styles.editActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => router.push(getAlbumPath(albumId))}
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

function StatusBadge({ status }: { status: AlbumStatus }) {
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      <span className={styles.statusDot} />

      {ALBUM_STATUS_LABELS[status]}
    </span>
  );
}
