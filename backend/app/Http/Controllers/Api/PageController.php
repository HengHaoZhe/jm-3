<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Page;
use App\Http\Resources\PageResource;

class PageController extends Controller
{
  public function image(string $album_id, int $sort_order)
  {
    $page = Page::where('album_id', $album_id)->where('sort_order', $sort_order)->firstOrFail();

    $albumDirectory = config('manga.storage_path') . DIRECTORY_SEPARATOR . $album_id;

    $filePath = $albumDirectory . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $page->file_path);

    if (!is_file($filePath)) {
      abort(404, 'Page image not found.');
    }

    return response()->file($filePath);
  }

  public function albumPages(string $album_id)
  {
    $pages = Page::where('album_id', $album_id)->orderBy('sort_order')->paginate(50);
    return PageResource::collection($pages);
  }
}
