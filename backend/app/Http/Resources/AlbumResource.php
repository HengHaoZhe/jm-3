<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AlbumResource extends JsonResource
{
  /**
   * Transform the resource into an array.
   *
   * @return array<string, mixed>
   */
  public function toArray(Request $request): array
  {
    $pages = $this->relationLoaded('pages') ? $this->pages : collect();
    return [
      'id' => $this->id,
      'album_id' => $this->album_id,
      'title' => $this->title,
      'status' => $this->status,
      'page_count' => $this->page_count,
      'pages' => PageResource::collection($this->whenLoaded('pages')),
      'groups' => $pages
        ->groupBy(function ($page) {
          $path = str_replace('\\', '/', $page->file_path);
          return str_contains($path, '/') ? explode('/', $path, 2)[0] : 'Root';
        })
        ->map(fn($groupPages, $name) => [
          'name' => $name,
          'pages' => PageResource::collection($groupPages),
        ])
        ->values(),
      'created_at' => $this->created_at,
    ];
  }
}
