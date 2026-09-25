<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Album;
use App\Models\Page;
use App\Http\Resources\PageResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PageController extends Controller
{
  public function image(Request $request, string $album_id, int $sort_order)
  {
    $page = Page::where('album_id', $album_id)->where('sort_order', $sort_order)->firstOrFail();

    $albumDirectory = config('manga.storage_path') . DIRECTORY_SEPARATOR . $album_id;

    $filePath = $albumDirectory . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $page->file_path);

    if (!is_file($filePath)) {
      abort(404, 'Page image not found.');
    }

    $response = response()->file($filePath);

    $response->setPrivate();
    $response->setMaxAge(31536000);
    $response->setEtag(sha1($page->album_id . ':' . $page->sort_order . ':' . optional($page->updated_at)->timestamp));
    $response->headers->set('Cache-Control', 'private, max-age=31536000, immutable');

    if ($page->updated_at) {
      $response->setLastModified($page->updated_at);
    }

    $response->isNotModified($request);

    return $response;
  }

  public function albumPages(string $album_id)
  {
    $pages = Page::where('album_id', $album_id)->paginate(50);

    return PageResource::collection($pages);
  }

  public function reorder(Request $request, string $album_id)
  {
    $start = microtime(true);
    $album = Album::where('album_id', $album_id)->firstOrFail();
    logger()->info('PAGE REORDER: find album', [
      'time' => microtime(true) - $start,
    ]);
    $validated = $request->validate([
      'page_ids' => ['present', 'array'],
      'page_ids.*' => ['required', 'integer', 'distinct'],
    ]);
    logger()->info('PAGE REORDER: validation', [
      'time' => microtime(true) - $start,
    ]);
    $pageIds = $validated['page_ids'];

    if (empty($pageIds)) {
      if ($album->pages()->exists()) {
        throw ValidationException::withMessages(['page_ids' => 'The submitted pages do not match the album pages.',]);
      }

      logger()->info('PAGE REORDER: no pages to reorder', [
        'time' => microtime(true) - $start,
      ]);

      return response()->json([
        'message' => 'Page order updated successfully.',
      ]);
    }

    /*
     * Make sure the submitted page IDs exactly match
     * the pages belonging to this album.
     */
    $albumPageIds = $album->pages()->pluck('id')->sort()->values()->all();
    logger()->info('PAGE REORDER: get album pages', [
      'time' => microtime(true) - $start,
    ]);
    $submittedPageIds = collect($pageIds)->sort()->values()->all();

    if ($albumPageIds !== $submittedPageIds) {
      throw ValidationException::withMessages(['page_ids' => 'The submitted pages do not match the album pages.',]);
    }
    logger()->info('PAGE REORDER: validation comparison', [
      'time' => microtime(true) - $start,
    ]);
    DB::transaction(function () use ($album, $pageIds) {
      // Create a temporary table containing:
      DB::statement('
            CREATE TEMPORARY TABLE temporary_page_order (
                page_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                sort_order INT UNSIGNED NOT NULL
            ) ENGINE=MEMORY
        ');

      //  Insert the desired order in chunks.
      //  This avoids creating one enormous INSERT statement.

      foreach (array_chunk($pageIds, 500) as $chunkIndex => $chunk) {
        $values = [];
        $bindings = [];

        foreach ($chunk as $index => $pageId) {
          $sortOrder = ($chunkIndex * 500) + $index + 1;

          $values[] = '(?, ?)';
          $bindings[] = $pageId;
          $bindings[] = $sortOrder;
        }

        DB::statement(
          'INSERT INTO temporary_page_order (page_id, sort_order) VALUES ' . implode(',', $values),
          $bindings
        );
      }

      //  Move the current sort orders away from the final range.
      //  This protects us if sort_order has a UNIQUE constraint.

      $temporaryOffset = ((int) $album->pages()->max('sort_order')) + count($pageIds) + 1;

      $album->pages()->update(['sort_order' => DB::raw("sort_order + {$temporaryOffset}"),]);

      //  Apply the final order in one MySQL UPDATE.

      DB::statement('
            UPDATE pages
            INNER JOIN temporary_page_order
                ON pages.id = temporary_page_order.page_id
            SET pages.sort_order = temporary_page_order.sort_order
            WHERE pages.album_id = ?
        ', [$album->album_id,]);

      //  Temporary tables are automatically removed when
      //  the database connection ends, but explicitly drop it
      //  here for clarity.

      DB::statement('DROP TEMPORARY TABLE temporary_page_order');
    });
    logger()->info('PAGE REORDER: transaction complete', [
      'time' => microtime(true) - $start,
    ]);
    return response()->json([
      'message' => 'Page order updated successfully.',
    ]);
  }
}
