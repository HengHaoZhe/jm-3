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
    $albumId = $this->album->album_id;
    $jobStart = microtime(true);

    logger()->info('ALBUM JOB: started', [
      'album_id' => $albumId,
    ]);

    try {
      $statusUpdateStart = microtime(true);
      $this->album->update([
        'status' => Album::STATUS_DOWNLOADING,
      ]);
      logger()->info('ALBUM JOB: status set to downloading', [
        'album_id' => $albumId,
        'status_update_time' => microtime(true) - $statusUpdateStart,
      ]);

      $downloadStart = microtime(true);
      $downloadService->download($albumId);
      $downloadDuration = microtime(true) - $downloadStart;

      $importStart = microtime(true);
      $importService->import($this->album);
      $importDuration = microtime(true) - $importStart;

      $completeStart = microtime(true);
      $this->album->update([
        'status' => Album::STATUS_COMPLETED,
      ]);
      $completeUpdateTime = microtime(true) - $completeStart;

      logger()->info('ALBUM JOB: completed', [
        'album_id' => $albumId,
        'download_duration' => $downloadDuration,
        'page_import_duration' => $importDuration,
        'completed_status_update_time' => $completeUpdateTime,
        'total_job_duration' => microtime(true) - $jobStart,
      ]);
    } catch (Throwable $e) {
      $failureStart = microtime(true);
      $this->album->update([
        'status' => Album::STATUS_FAILED,
      ]);
      logger()->error('ALBUM JOB: failed', [
        'album_id' => $albumId,
        'failure_status_update_time' => microtime(true) - $failureStart,
        'total_job_duration' => microtime(true) - $jobStart,
        'exception' => $e->getMessage(),
      ]);
      throw $e;
    }
  }
}
