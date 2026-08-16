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
    return [
      'id' => $this->id,
      'album_id' => $this->album_id,
      'title' => $this->title,
      'status' => $this->status,
      'page_count' => $this->page_count,
      'pages' => PageResource::collection($this->whenLoaded('pages')),
      'created_at' => $this->created_at,
    ];
  }
}
