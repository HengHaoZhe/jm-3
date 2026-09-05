<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BulkStoreAlbumRequest;
use App\Http\Requests\StoreAlbumRequest;
use App\Http\Requests\UpdateAlbumRequest;
use App\Http\Resources\AlbumResource;
use App\Jobs\DownloadAlbumJob;
use App\Models\Album;
use App\Services\AlbumImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

class AlbumController extends Controller
{
  /**
   * Display a listing of the resource.
   */
  public function index()
  {
    $albums = Album::orderBy('id', 'desc')->get();
    return AlbumResource::collection($albums);
  }

  /**
   * Store a newly created resource in storage.
   */
  public function store(StoreAlbumRequest $request)
  {
    $requestStart = microtime(true);
    $albumId = $request->album_id;

    $dbStart = microtime(true);
    File::ensureDirectoryExists(
      config('manga.storage_path') . DIRECTORY_SEPARATOR . $albumId
    );

    $album = Album::create([
      'album_id' => $albumId,
      'title' => '',
      'status' => 'queued',
    ]);
    $albumDbInsertTime = microtime(true) - $dbStart;

    $dispatchStart = microtime(true);
    DownloadAlbumJob::dispatch($album);
    $jobDispatchTime = microtime(true) - $dispatchStart;

    logger()->info('ALBUM CREATE: request complete', [
      'album_id' => $albumId,
      'album_db_insert_time' => $albumDbInsertTime,
      'job_dispatch_time' => $jobDispatchTime,
      'total_album_create_request_time' => microtime(true) - $requestStart,
    ]);

    return new AlbumResource($album);
  }

  /**
   * Display the specified resource.
   */
  public function show(Request $request, Album $album)
  {
    $perPage = min(
      max((int) $request->query('per_page', 20), 1),
      100
    );

    $pages = $album->pages()
      ->orderBy('sort_order', 'asc')
      ->paginate($perPage);

    $album->setRelation('pages', $pages->getCollection());

    $resource = new AlbumResource($album);

    return $resource->additional([
      'meta' => [
        'current_page' => $pages->currentPage(),
        'last_page' => $pages->lastPage(),
        'per_page' => $pages->perPage(),
        'total' => $pages->total(),
        'has_more' => $pages->hasMorePages(),
      ],
    ]);
  }

  public function edit(Album $album)
  {
    return new AlbumResource($album->load('pages'));
  }

  /**
   * Update the specified resource in storage.
   */
  public function update(UpdateAlbumRequest $request, Album $album)
  {
    $album->update($request->validated());
    return response()->json(['message' => 'Album updated successfully.']);
  }

  /**
   * Remove the specified resource from storage.
   */
  public function destroy(Album $album)
  {
    $albumDirectory = config('manga.storage_path') . DIRECTORY_SEPARATOR . $album->album_id;

    // Delete database record (foreign key cascade deletes pages automatically).
    $album->delete();

    // Delete the physical album directory.
    if (File::isDirectory($albumDirectory)) {
      File::deleteDirectory($albumDirectory);
    }

    return response()->json([
      'message' => 'Album deleted successfully.',
    ]);
  }

  public function countPages(Album $album, AlbumImportService $importService)
  {
    try {
      $importService->countPages($album);
    } catch (RuntimeException $e) {
      return response()->json([
        'message' => $e->getMessage(),
      ], 422);
    }

    return new AlbumResource($album->fresh());
  }

  public function bulkStore(BulkStoreAlbumRequest $request)
  {
    $requestStart = microtime(true);
    $albumIds = array_unique($request->validated('album_ids'));

    // Single query to identify existing records
    $existing = Album::whereIn('album_id', $albumIds)->pluck('album_id')->toArray();

    // Native array operations replace double foreach loops
    $newAlbumIds = array_values(array_diff($albumIds, $existing));

    $queued = [];

    if (!empty($newAlbumIds)) {
      $timestamp = now();

      $albumRows = array_map(fn($id) => [
        'album_id' => $id,
        'title' => '',
        'status' => 'queued',
        'page_count' => 0,
        'created_at' => $timestamp,
        'updated_at' => $timestamp,
      ], $newAlbumIds);

      $dbStart = microtime(true);

      // Prevent race conditions with ignore
      DB::table('albums')->insertOrIgnore($albumRows);

      $albumDbInsertTime = microtime(true) - $dbStart;

      // Query model instances directly once to avoid re-querying
      $createdAlbums = Album::whereIn('album_id', $newAlbumIds)->get();

      foreach ($createdAlbums as $album) {
        $dispatchStart = microtime(true);

        // Pass model instance directly
        DownloadAlbumJob::dispatch($album);

        logger()->info('ALBUM CREATE: queued', [
          'album_id' => $album->album_id,
          'album_db_insert_time' => $albumDbInsertTime,
          'job_dispatch_time' => microtime(true) - $dispatchStart,
        ]);

        $queued[] = $album->album_id;
      }
    }

    logger()->info('ALBUM CREATE: bulk request complete', [
      'album_ids' => $albumIds,
      'queued_count' => count($queued),
      'existing_count' => count($existing),
      'total_bulk_create_request_time' => microtime(true) - $requestStart,
    ]);

    return response()->json([
      'data' => [
        'queued'   => $queued,
        'existing' => array_values($existing),
        'failed'   => [],
      ],
    ]);
  }

  public function redownload(Album $album)
  {
    if (in_array($album->status, ['queued', 'downloading'], true)) {
      return response()->json([
        'message' => 'Album is already queued or downloading.',
      ], 422);
    }

    $this->requeueAlbum($album);

    return new AlbumResource(
      $album->fresh()->load('pages')
    );
  }

  public function redownloadFailed()
  {
    $failedAlbums = Album::where('status', 'failed')->get();

    if ($failedAlbums->isEmpty()) {
      return response()->json([
        'data' => [
          'queued' => [],
          'count' => 0,
        ],
      ]);
    }

    $queuedAlbumIds = [];

    foreach ($failedAlbums as $album) {
      $this->requeueAlbum($album);
      $queuedAlbumIds[] = $album->album_id;
    }

    return response()->json([
      'data' => [
        'queued' => $queuedAlbumIds,
        'count' => count($queuedAlbumIds),
      ],
    ]);
  }

  public function importPages(Album $album, AlbumImportService $importService)
  {
    try {
      $importService->import($album);
    } catch (RuntimeException $e) {
      return response()->json([
        'message' => $e->getMessage(),
      ], 422);
    }

    $album->update([
      'status' => 'completed',
    ]);

    return new AlbumResource(
      $album->fresh()->load('pages')
    );
  }

  public function reader(Album $album)
  {
    return $this->edit($album);
  }

  /**
   * Helper to clear and requeue an album for downloading.
   */
  private function requeueAlbum(Album $album): void
  {
    File::ensureDirectoryExists(
      config('manga.storage_path') . DIRECTORY_SEPARATOR . $album->album_id
    );

    DB::transaction(function () use ($album) {
      // Clear previously imported pages so the next run rebuilds them.
      $album->pages()->delete();

      $album->update([
        'status' => 'queued',
        'page_count' => 0,
      ]);
    });

    DownloadAlbumJob::dispatch($album);
  }
}
