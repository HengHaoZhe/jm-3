<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EditAlbumResource extends JsonResource
{
    /**
     * Transform the resource into the edit-page response.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $pages = $this->pages
            ->sortBy('sort_order')
            ->values();

        $groups = $pages
            ->groupBy(fn ($page) => $this->pageDirectory($page->file_path))
            ->map(fn ($groupPages, $name) => [
                'name' => $name,
                'pages' => PageResource::collection($groupPages->values()),
            ])
            ->values();

        return [
            'album_id' => $this->album_id,
            'title' => $this->title,
            'status' => $this->status,
            'page_count' => $this->page_count,
            'groups' => $groups,
            'created_at' => $this->created_at,
        ];
    }

    private function pageDirectory(string $filePath): string
    {
        $normalizedPath = trim(str_replace('\\', '/', $filePath), '/');
        $lastSeparator = strrpos($normalizedPath, '/');

        if ($lastSeparator === false) {
            return 'Root';
        }

        $directory = substr($normalizedPath, 0, $lastSeparator);

        return $directory !== '' ? $directory : 'Root';
    }
}
