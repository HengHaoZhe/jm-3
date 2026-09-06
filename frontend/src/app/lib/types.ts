export const ALBUM_STATUSES = [
  "queued",
  "downloading",
  "completed",
  "failed",
] as const;

export const ACTIVE_ALBUM_STATUSES: AlbumStatus[] = ["queued", "downloading"];

export type AlbumStatus = (typeof ALBUM_STATUSES)[number];

export const ALBUM_STATUS_LABELS: Record<AlbumStatus, string> = {
  queued: "Queued",
  downloading: "Downloading",
  completed: "Completed",
  failed: "Failed",
};

export interface Page {
  id: number;
  sort_order: number;
  file_path: string;
  url: string;
}

export interface AlbumGroup {
  name: string;
  pages: Page[];
}

export interface Album {
  album_id: string;
  title: string;
  status: AlbumStatus;
  page_count: number;
  pages: Page[];
  created_at: string;
  groups?: AlbumGroup[];
}

export interface AlbumSummary {
  id: number;
  album_id: string;
  title: string;
  status: AlbumStatus;
  page_count: number;
  created_at: string;
}

export interface AlbumPaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  has_more: boolean;
}

export interface AlbumResponse {
  data: Album;
  meta?: AlbumPaginationMeta;
}

export interface AlbumListResponse {
  data: AlbumSummary[];
}

export function createAlbumStatusCounts(): Record<AlbumStatus, number> {
  return ALBUM_STATUSES.reduce(
    (counts, status) => {
      counts[status] = 0;
      return counts;
    },
    {} as Record<AlbumStatus, number>,
  );
}
