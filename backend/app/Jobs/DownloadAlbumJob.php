<?php

namespace App\Jobs;

use App\Models\Album;
use App\Services\MangaDownloadService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;
use App\Services\AlbumImportService;

class DownloadAlbumJob implements ShouldQueue
{
  use Queueable, InteractsWithQueue, SerializesModels;

  /**
   * Number of attempts.
   */
  public int $tries = 3;

  /**
   * Timeout in seconds.
   */
  public int $timeout = 36000;

  /**
   * Create a new job instance.
   */
  public function __construct(
    public Album $album
  ) {}

  /**
   * Execute the job.
   */
  public function handle(MangaDownloadService $downloadService, AlbumImportService $importService): void
  {
    try {
      $this->album->update([
        'status' => 'downloading',
      ]);

      $downloadService->download($this->album->album_id);
      $importService->import($this->album);
      $this->album->update([
        'status' => 'completed',
      ]);
    } catch (Throwable $e) {
      $this->album->update([
        'status' => 'failed',
      ]);
      throw $e;
    }
  }
}
