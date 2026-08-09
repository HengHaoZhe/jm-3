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
    return [
      'sort_order' => $this->sort_order,
      'file_path' => $this->file_path,
      'url' => route('pages.image', [
        'album_id' => $this->album_id,
        'sort_order' => $this->sort_order,
      ]),
    ];
  }
}
