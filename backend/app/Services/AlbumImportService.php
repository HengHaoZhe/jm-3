<?php

namespace App\Services;

use App\Models\Album;
use App\Models\Page;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;
use SplFileInfo;

class AlbumImportService
{
  /**
   * Import all image files from an album directory
   * and create the corresponding Page records.
   */
  public function import(Album $album): void
  {
    $albumDirectory = config('manga.storage_path') . DIRECTORY_SEPARATOR . $album->album_id;

    if (!File::isDirectory($albumDirectory)) {
      throw new RuntimeException("Album directory does not exist: {$albumDirectory}");
    }

    $files = $this->findImageFiles($albumDirectory);

    if (empty($files)) {
      throw new RuntimeException("No image files found for album {$album->album_id}.");
    }

    $files = $this->sortFiles($files, $albumDirectory);

    DB::transaction(function () use ($album, $files, $albumDirectory) {
      // Remove any existing page records.
      $album->pages()->delete();

      $sortOrder = 1;

      foreach ($files as $file) {
        Page::create([
          'album_id' => $album->album_id,
          'sort_order' => $sortOrder,
          'file_path' => $this->getRelativePath($file, $albumDirectory),
        ]);
        $sortOrder++;
      }

      $album->update([
        'page_count' => count($files),
      ]);
    });
  }

  /**
   * Find all supported image files recursively.
   *
   * @return SplFileInfo[]
   */
  private function findImageFiles(string $albumDirectory): array
  {
    $files = File::allFiles($albumDirectory);

    return array_values(array_filter($files, fn(SplFileInfo $file) => $this->isImageFile($file)));
  }

  /**
   * Check whether a file is a supported manga image.
   */
  private function isImageFile(SplFileInfo $file): bool
  {
    return in_array(
      strtolower($file->getExtension()),
      [
        'jpg',
        'jpeg',
        'png',
        'webp',
        'gif',
        'bmp',
      ],
      true
    );
  }

  /**
   * Sort files by their complete relative path.
   *
   * Each directory component is compared naturally.
   * Files inside the same directory are then compared
   * using the same numeric/suffix rules.
   */
  private function sortFiles(array $files, string $albumDirectory): array
  {
    usort(
      $files,
      function (SplFileInfo $a, SplFileInfo $b) use ($albumDirectory) {
        $relativeA = $this->getRelativePath($a, $albumDirectory);

        $relativeB = $this->getRelativePath($b, $albumDirectory);

        $directoryA = dirname($relativeA);
        $directoryB = dirname($relativeB);

        $directoryComparison = $this->comparePaths($directoryA, $directoryB);

        if ($directoryComparison !== 0) {
          return $directoryComparison;
        }

        /*
         * Same directory.
         *
         * Now compare the actual filenames.
         */
        return $this->comparePathComponent(
          pathinfo($a->getFilename(), PATHINFO_FILENAME),
          pathinfo($b->getFilename(), PATHINFO_FILENAME)
        );
      }
    );

    return $files;
  }

  /**
   * Compare two directory paths component by component.
   */
  private function comparePaths(string $pathA, string $pathB): int
  {
    $partsA = $this->splitPath($pathA);
    $partsB = $this->splitPath($pathB);

    $count = min(count($partsA), count($partsB));

    for ($i = 0; $i < $count; $i++) {
      $comparison = $this->comparePathComponent($partsA[$i], $partsB[$i]);

      if ($comparison !== 0) {
        return $comparison;
      }
    }

    /*
     * If one path is a parent of the other,
     * the shorter path comes first.
     */
    return count($partsA) <=> count($partsB);
  }

  /**
   * Split a path into its individual components.
   */
  private function splitPath(string $path): array
  {
    $path = str_replace('\\', '/', $path);

    if ($path === '.' || $path === '') {
      return [];
    }

    return array_values(array_filter(explode('/', $path), fn($part) => $part !== ''));
  }

  /**
   * Compare a single path component.
   *
   * Numeric prefix is compared first.
   *
   * The plain number comes before variants.
   */
  private function comparePathComponent(string $valueA, string $valueB): int
  {
    $infoA = $this->parseNumericComponent($valueA);

    $infoB = $this->parseNumericComponent($valueB);

    if ($infoA !== null && $infoB === null) {
      return -1;
    }

    if ($infoA === null && $infoB !== null) {
      return 1;
    }

    if ($infoA === null && $infoB === null) {
      return strnatcasecmp($valueA, $valueB);
    }

    if ($infoA['number'] !== $infoB['number']) {
      return $infoA['number'] <=> $infoB['number'];
    }

    if ($infoA['suffix'] === '' && $infoB['suffix'] !== '') {
      return -1;
    }

    if ($infoA['suffix'] !== '' && $infoB['suffix'] === '') {
      return 1;
    }

    $suffixComparison = strnatcasecmp($infoA['suffix'], $infoB['suffix']);

    if ($suffixComparison !== 0) {
      return $suffixComparison;
    }

    return strnatcasecmp($infoA['original_suffix'], $infoB['original_suffix']);
  }

  /**
   * Extract numeric prefix and suffix.
   */
  private function parseNumericComponent(string $value): ?array
  {
    if (preg_match('/^(?<number>\d+)(?<suffix>.*)$/u', $value, $matches) !== 1) {
      return null;
    }

    $originalSuffix = $matches['suffix'];

    $normalizedSuffix = preg_replace('/\s+/u', '', $originalSuffix);

    return [
      'number' => (int) $matches['number'],
      // Used to determine the logical ordering.
      'suffix' => $normalizedSuffix,
      // Used to break ties between equivalent variants.
      'original_suffix' => trim($originalSuffix),
    ];
  }

  /**
   * Get the file path relative to the album directory.
   */
  private function getRelativePath(SplFileInfo $file, string $albumDirectory): string
  {
    $relativePath = str_replace($albumDirectory . DIRECTORY_SEPARATOR, '', $file->getPathname());

    // Always use "/" in database paths.
    return str_replace(DIRECTORY_SEPARATOR, '/', $relativePath);
  }
}
