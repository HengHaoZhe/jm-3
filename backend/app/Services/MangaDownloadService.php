<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use RuntimeException;
use Throwable;

class MangaDownloadService
{
  private string $downloaderDirectory;
  private string $downloadDirectory;
  private string $mangaDirectory;

  public function __construct()
  {
    // Directory containing the Python downloader script.
    $this->downloaderDirectory = base_path('scripts/downloader');

    // Temporary download directory.
    $this->downloadDirectory = config('manga.temp_path');

    // Permanent manga storage directory.
    $this->mangaDirectory = config('manga.storage_path');

    // Ensure both directories exist.
    File::ensureDirectoryExists($this->downloadDirectory);

    File::ensureDirectoryExists($this->mangaDirectory);
  }

  /**
   * Download an album and move the resulting
   * files into the permanent manga directory.
   */
  public function download(string $albumId): void
  {
    $downloadStart = microtime(true);
    $python = 'py';

    $script = $this->downloaderDirectory . DIRECTORY_SEPARATOR . 'jm-downloader.py';

    $destination = $this->mangaDirectory . DIRECTORY_SEPARATOR . $albumId;
    File::ensureDirectoryExists($destination);

    // Each album gets its own temporary working directory.
    $workingDirectory = $this->downloadDirectory . DIRECTORY_SEPARATOR . $albumId;

    File::ensureDirectoryExists($workingDirectory);

    try {
      $command = sprintf('%s %s %s', escapeshellarg($python), escapeshellarg($script), escapeshellarg($albumId));

      $output = [];
      $exitCode = 0;

      $execStart = microtime(true);
      // Run Python from the album's temporary directory.
      exec(
        'cd /d ' . escapeshellarg($workingDirectory) . ' && ' . $command . ' 2>&1',
        $output,
        $exitCode
      );
      $downloadExecDuration = microtime(true) - $execStart;

      if ($exitCode !== 0) {
        throw new RuntimeException("Failed to download album {$albumId}:\n" . implode("\n", $output));
      }

      $moveStart = microtime(true);
      $this->organizeDownloadedFiles($albumId, $workingDirectory);
      $fileMoveDuration = microtime(true) - $moveStart;

      logger()->info('ALBUM DOWNLOAD: complete', [
        'album_id' => $albumId,
        'download_exec_duration' => $downloadExecDuration,
        'file_move_organization_duration' => $fileMoveDuration,
        'total_download_duration' => microtime(true) - $downloadStart,
      ]);
    } catch (Throwable $e) {
      logger()->error('ALBUM DOWNLOAD: failed', [
        'album_id' => $albumId,
        'total_download_duration' => microtime(true) - $downloadStart,
        'exception' => $e->getMessage(),
      ]);
      throw $e;
    } finally {
      // Always remove the temporary directory.
      if (File::isDirectory($workingDirectory)) {
        File::deleteDirectory($workingDirectory);
      }
    }
  }

  private function organizeDownloadedFiles(string $albumId, string $workingDirectory): void
  {
    $downloadDirectories = File::directories($workingDirectory);

    if (empty($downloadDirectories)) {
      throw new RuntimeException("No downloaded folders found for album {$albumId}.");
    }

    $destination = $this->mangaDirectory . DIRECTORY_SEPARATOR . $albumId;

    File::ensureDirectoryExists($destination);

    if (count($downloadDirectories) === 1) {
      $this->moveSingleFolderContents(reset($downloadDirectories), $destination);
    } else {
      $this->moveMultipleFolders($downloadDirectories, $destination);
    }
  }

  private function moveSingleFolderContents(string $source, string $destination): void
  {
    foreach (File::directories($source) as $directory) {
      File::moveDirectory($directory, $destination . DIRECTORY_SEPARATOR . basename($directory));
    }

    foreach (File::files($source) as $file) {
      File::move($file->getPathname(), $destination . DIRECTORY_SEPARATOR . $file->getFilename());
    }

    File::deleteDirectory($source);
  }

  private function moveMultipleFolders(array $directories, string $destination): void
  {
    foreach ($directories as $directory) {
      File::moveDirectory($directory, $destination . DIRECTORY_SEPARATOR . basename($directory));
    }
  }
}
