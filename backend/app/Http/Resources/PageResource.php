<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PageResource extends JsonResource
{
  /**
   * Transform the resource into an array.
   *
   * @return array<string, mixed>
   */
  public function toArray(Request $request): array
  {
    $imageUrl = url(
      "/api/albums/{$this->album_id}/pages/{$this->sort_order}/image"
    );

    if ($this->updated_at) {
      $imageUrl .= '?v=' . $this->updated_at->timestamp;
    }

    return [
      'id' => $this->id,
      'sort_order' => $this->sort_order,
      'file_path' => $this->file_path,
      'url' => $imageUrl,
    ];
    // return [
    //   'id' => $this->id,
    //   'sort_order' => $this->sort_order,
    //   'file_path' => $this->file_path,
    //   'url' => route('pages.image', [
    //     'album_id' => $this->album_id,
    //     'sort_order' => $this->sort_order,
    //   ]),
    // ];
  }
}
