"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  AlbumGroup,
  EditAlbum,
  EditAlbumResponse,
  Page,
  AlbumStatus,
} from "@/app/lib/types";
import { useApiBaseUrl } from "@/app/lib/useApiBaseUrl";

const groupDragId = (groupName: string) => `group:${groupName}`;
const pageDragId = (pageId: number) => `page:${pageId}`;

function getPageId(dragId: string): number | null {
  if (!dragId.startsWith("page:")) return null;

  const pageId = Number(dragId.slice("page:".length));
  return Number.isInteger(pageId) ? pageId : null;
}

function getGroupName(dragId: string): string | null {
  return dragId.startsWith("group:") ? dragId.slice("group:".length) : null;
}

function findPageGroup(groups: AlbumGroup[], pageId: number) {
  return groups.find((group) =>
    group.pages.some((page) => page.id === pageId),
  );
}

export default function EditAlbumPage() {
  const params = useParams<{ album_id: string }>();
  const albumId = params.album_id;
  const router = useRouter();

  const [album, setAlbum] = useState<EditAlbum | null>(null);
  const { apiUrl } = useApiBaseUrl();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<AlbumStatus>("completed");
  const [editPageCount, setEditPageCount] = useState("");
  const [editGroups, setEditGroups] = useState<AlbumGroup[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!albumId) {
      return;
    }

    async function loadAlbum() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchAlbum<EditAlbumResponse>(
          `/albums/${albumId}/edit`,
        );
        const loadedAlbum = result.data;

        setAlbum(loadedAlbum);
        setEditTitle(loadedAlbum.title ?? "");
        setEditStatus(loadedAlbum.status);
        setEditPageCount(String(loadedAlbum.page_count));
        setEditGroups(loadedAlbum.groups);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load album.");
      } finally {
        setLoading(false);
      }
    }

    loadAlbum();
  }, [albumId]);

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const finalOverId = event.over ? String(event.over.id) : null;

    if (!finalOverId) {
      return;
    }

    const activeGroupName = getGroupName(activeId);

    if (activeGroupName !== null) {
      setEditGroups((currentGroups) => {
        const targetPageId = getPageId(finalOverId);
        const targetGroupName =
          getGroupName(finalOverId) ??
          (targetPageId === null
            ? null
            : findPageGroup(currentGroups, targetPageId)?.name ?? null);
        const sourceIndex = currentGroups.findIndex(
          (group) => group.name === activeGroupName,
        );
        const targetIndex = currentGroups.findIndex(
          (group) => group.name === targetGroupName,
        );

        if (sourceIndex === -1 || targetIndex === -1) return currentGroups;

        return arrayMove(currentGroups, sourceIndex, targetIndex);
      });
      return;
    }

    const activePageId = getPageId(activeId);

    if (activePageId !== null) {
      setEditGroups((currentGroups) => {
        const sourceGroup = findPageGroup(currentGroups, activePageId);
        const overPageId = getPageId(finalOverId);
        const targetGroup =
          overPageId !== null
            ? findPageGroup(currentGroups, overPageId)
            : currentGroups.find(
                (group) => group.name === getGroupName(finalOverId),
              );

        if (!sourceGroup || !targetGroup) {
          return currentGroups;
        }

        const sourcePage = sourceGroup.pages.find(
          (page) => page.id === activePageId,
        );
        const sourceIndex = sourceGroup.pages.findIndex(
          (page) => page.id === activePageId,
        );
        const targetIndex =
          overPageId === null
            ? sourceGroup === targetGroup
              ? targetGroup.pages.length - 1
              : targetGroup.pages.length
            : targetGroup.pages.findIndex((page) => page.id === overPageId);

        if (!sourcePage || sourceIndex === -1 || targetIndex === -1) {
          return currentGroups;
        }

        if (sourceGroup !== targetGroup) {
          return currentGroups.map((group) => {
            if (group.name === sourceGroup.name) {
              return {
                ...group,
                pages: group.pages.filter((page) => page.id !== activePageId),
              };
            }

            if (group.name === targetGroup.name) {
              const pages = [...group.pages];
              pages.splice(targetIndex, 0, sourcePage);
              return { ...group, pages };
            }

            return group;
          });
        }

        return currentGroups.map((group) =>
          group.name === sourceGroup.name
            ? {
                ...group,
                pages: arrayMove(group.pages, sourceIndex, targetIndex),
              }
            : group,
        );
      });
    }

  }

  function resetErrors() {
    setSaveError(null);
    setImportError(null);
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

      const result: EditAlbumResponse = await response.json();

      setAlbum(result.data);
      setEditPageCount(String(result.data.page_count));
      setEditGroups(result.data.groups);

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

    if (!Number.isInteger(pageCount) || pageCount < 0 || pageCount > 65535) {
      setSaveError("Page count must be a whole number between 0 and 65535.");
      return;
    }

    try {
      setSaving(true);
      resetErrors();

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

      router.push("/");
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update album.",
      );
    } finally {
      setSaving(false);
    }
  }

  const editBusy = saving || importing;

  const totalPageCount = editGroups.reduce(
    (count, group) => count + group.pages.length,
    0,
  );

  const cumulativePageTotals = editGroups.reduce<number[]>((totals, group) => {
    const previousTotal = totals.length === 0 ? 0 : totals[totals.length - 1];

    totals.push(previousTotal + group.pages.length);
    return totals;
  }, []);

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

          <StatusBadge status={editStatus} />
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

              <input
                type="number"
                min="0"
                max="65535"
                step="1"
                value={editPageCount}
                onChange={(event) => setEditPageCount(event.target.value)}
                disabled={editBusy}
              />
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

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                autoScroll
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={editGroups.map((group) => groupDragId(group.name))}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={styles.pageOrderList}>
                    {editGroups.map((group, groupIndex) => (
                      <SortablePageGroup
                        key={group.name}
                        group={group}
                        startingPageNumber={
                          cumulativePageTotals[groupIndex - 1] ?? 0
                        }
                        apiUrl={apiUrl}
                        disabled={editBusy}
                        canReorderGroups={editGroups.length > 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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

function SortablePageGroup({
  group,
  startingPageNumber,
  apiUrl,
  disabled,
  canReorderGroups,
}: {
  group: AlbumGroup;
  startingPageNumber: number;
  apiUrl: string | null;
  disabled: boolean;
  canReorderGroups: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: groupDragId(group.name),
    data: { type: "group", groupName: group.name },
    disabled: disabled || !canReorderGroups,
  });

  return (
    <details
      ref={setNodeRef}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      className={[
        styles.pageOrderGroup,
        isDragging ? styles.pageOrderGroupDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <summary className={styles.pageOrderGroupHeader}>
        <span className={styles.pageOrderGroupTitle}>
          <i
            className={`bx bx-chevron-right ${styles.groupDisclosureIcon}`}
            aria-hidden="true"
          />
          <strong>{group.name}</strong>
        </span>

        <span className={styles.pageOrderGroupActions}>
          <span className={styles.pageOrderGroupCount}>
            {group.pages.length} {group.pages.length === 1 ? "page" : "pages"}
          </span>

          {canReorderGroups && (
            <button
              ref={setActivatorNodeRef}
              type="button"
              className={styles.groupDragHandle}
              aria-label={`Reorder ${group.name} group`}
              disabled={disabled}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              {...attributes}
              {...listeners}
            >
              <i className="bx bx-grid-vertical" aria-hidden="true" />
            </button>
          )}
        </span>
      </summary>

      {isOpen && (
        <SortableContext
          items={group.pages.map((page) => pageDragId(page.id))}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.pageOrderGroupPages}>
            {group.pages.map((page, pageIndex) => (
              <SortablePageItem
                key={page.id}
                page={page}
                pageNumber={startingPageNumber + pageIndex + 1}
                apiUrl={apiUrl}
                disabled={disabled}
              />
            ))}

            {group.pages.length === 0 && (
              <div className={styles.emptyPageOrderGroup}>Drop pages here</div>
            )}
          </div>
        </SortableContext>
      )}
    </details>
  );
}

function SortablePageItem({
  page,
  pageNumber,
  apiUrl,
  disabled,
}: {
  page: Page;
  pageNumber: number;
  apiUrl: string | null;
  disabled: boolean;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: pageDragId(page.id),
    data: { type: "page", pageId: page.id },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.pageOrderItem,
        isDragging ? styles.pageOrderItemDragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className={styles.dragHandle}
        aria-label={`Move page ${pageNumber}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <i className="bx bx-grid-vertical" aria-hidden="true" />
      </button>

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
}

function StatusBadge({ status }: { status: AlbumStatus }) {
  return (
    <span className={`${styles.status} ${styles[`status-${status}`]}`}>
      <span className={styles.statusDot} />

      {ALBUM_STATUS_LABELS[status]}
    </span>
  );
}
