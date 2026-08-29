<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\BulkStoreAlbumRequest;
use App\Http\Requests\StoreAlbumRequest;
use App\Http\Requests\UpdateAlbumRequest;
use App\Http\Resources\AlbumResource;
use App\Jobs\DownloadAlbumJob;
use App\Models\Album;
use App\Models\Page;
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
    $albumId = $request->album_id;

    File::ensureDirectoryExists(
      config('manga.storage_path') . DIRECTORY_SEPARATOR . $albumId
    );

    $album = Album::create([
      'album_id' => $albumId,
      'title' => '',
      'status' => 'queued',
    ]);

    DownloadAlbumJob::dispatch($album);

    return new AlbumResource($album);
  }

  /**
   * Display the specified resource.
   */
  public function show(Request $request, string $album_id)
  {
    $perPage = min(
      max((int) $request->query('per_page', 20), 1),
      100
    );

    $album = Album::where('album_id', $album_id)
      ->firstOrFail();

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

  public function edit(string $album_id)
  {
    $album = Album::where('album_id', $album_id)->with([
      'pages' => function ($query) {
        $query->orderBy('sort_order', 'asc');
      },
    ])->firstOrFail();

    return new AlbumResource($album);
  }

  /**
   * Update the specified resource in storage.
   */
  // public function update(UpdateAlbumRequest $request, string $album_id)
  // {
  //   $start = microtime(true);

  //   $validated = $request->validated();

  //   logger()->info('ALBUM UPDATE: validation', [
  //     'time' => microtime(true) - $start,
  //   ]);

  //   $album = Album::where('album_id', $album_id)->firstOrFail();

  //   logger()->info('ALBUM UPDATE: find album', [
  //     'time' => microtime(true) - $start,
  //   ]);

  //   $album->update($validated);

  //   logger()->info('ALBUM UPDATE: model update', [
  //     'time' => microtime(true) - $start,
  //   ]);

  //   return response()->json([
  //     'message' => 'Album updated successfully.',
  //   ]);
  // }
  public function update(UpdateAlbumRequest $request, string $album_id)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();
    $album->update($request->validated());
    return response()->json(['message' => 'Album updated successfully.',]);
  }

  /**
   * Remove the specified resource from storage.
   */
  public function destroy(string $album_id)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();

    $albumDirectory = config('manga.storage_path') . DIRECTORY_SEPARATOR . $album->album_id;

    // Delete database record.
    // The pages are deleted automatically through the foreign key cascade.
    $album->delete();

    // Delete the physical album directory.
    if (File::isDirectory($albumDirectory)) {
      File::deleteDirectory($albumDirectory);
    }

    return response()->json([
      'message' => 'Album deleted successfully.',
    ]);
  }

  public function countPages(string $album_id, AlbumImportService $importService)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();

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
    $albumIds = $request->validated('album_ids');

    $existingAlbumIds = Album::whereIn('album_id', $albumIds)
      ->pluck('album_id')
      ->toArray();

    $existingLookup = array_flip($existingAlbumIds);

    $queued = [];
    $existing = [];

    foreach ($albumIds as $albumId) {
      if (isset($existingLookup[$albumId])) {
        $existing[] = $albumId;
        continue;
      }

      File::ensureDirectoryExists(
        config('manga.storage_path') . DIRECTORY_SEPARATOR . $albumId
      );

      $album = Album::create([
        'album_id' => $albumId,
        'title' => '',
        'status' => 'queued',
        'page_count' => 0,
      ]);

      DownloadAlbumJob::dispatch($album);

      $queued[] = $albumId;
    }

    return response()->json([
      'data' => [
        'queued' => $queued,
        'existing' => $existing,
        'failed' => [],
      ],
    ]);
  }

  public function redownload(string $album_id)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();

    if (in_array($album->status, ['queued', 'downloading'], true)) {
      return response()->json([
        'message' => 'Album is already queued or downloading.',
      ], 422);
    }

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
      $queuedAlbumIds[] = $album->album_id;
    }

    return response()->json([
      'data' => [
        'queued' => $queuedAlbumIds,
        'count' => count($queuedAlbumIds),
      ],
    ]);
  }

  public function importPages(string $album_id, AlbumImportService $importService)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();

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

  public function reader(string $album_id)
  {
    $album = Album::where('album_id', $album_id)->with([
      'pages' => function ($query) {
        $query->orderBy('sort_order', 'asc');
      },
    ])->firstOrFail();
    return new AlbumResource($album);
  }
}
