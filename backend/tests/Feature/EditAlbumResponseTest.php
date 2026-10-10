<?php

namespace Tests\Feature;

use App\Models\Album;
use App\Models\Page;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EditAlbumResponseTest extends TestCase
{
    use RefreshDatabase;

    public function test_root_pages_are_returned_as_one_ordered_group_without_a_duplicate_pages_field(): void
    {
        $album = $this->createAlbum('root-pages');

        $secondPage = $this->createPage($album, 2, '002.jpg');
        $firstPage = $this->createPage($album, 1, '001.jpg');

        $response = $this->getJson("/api/albums/{$album->album_id}/edit");

        $response
            ->assertOk()
            ->assertJsonMissingPath('data.pages')
            ->assertJsonPath('data.groups.0.name', 'Root')
            ->assertJsonPath('data.groups.0.pages.0.id', $firstPage->id)
            ->assertJsonPath('data.groups.0.pages.1.id', $secondPage->id)
            ->assertJsonCount(1, 'data.groups');
    }

    public function test_pages_in_one_directory_are_returned_as_one_group(): void
    {
        $album = $this->createAlbum('one-folder');

        $this->createPage($album, 1, 'Chapter 1/001.jpg');
        $this->createPage($album, 2, 'Chapter 1/002.jpg');

        $this->getJson("/api/albums/{$album->album_id}/edit")
            ->assertOk()
            ->assertJsonPath('data.groups.0.name', 'Chapter 1')
            ->assertJsonCount(2, 'data.groups.0.pages')
            ->assertJsonCount(1, 'data.groups');
    }

    public function test_multiple_directories_are_separate_groups_in_page_order(): void
    {
        $album = $this->createAlbum('multiple-folders');

        $chapterTwoPage = $this->createPage($album, 3, 'Volume 1/Chapter 2/001.jpg');
        $chapterOneFirstPage = $this->createPage($album, 1, 'Volume 1/Chapter 1/001.jpg');
        $chapterOneSecondPage = $this->createPage($album, 2, 'Volume 1/Chapter 1/002.jpg');

        $response = $this->getJson("/api/albums/{$album->album_id}/edit");

        $response
            ->assertOk()
            ->assertJsonPath('data.groups.0.name', 'Volume 1/Chapter 1')
            ->assertJsonPath('data.groups.0.pages.0.id', $chapterOneFirstPage->id)
            ->assertJsonPath('data.groups.0.pages.1.id', $chapterOneSecondPage->id)
            ->assertJsonPath('data.groups.1.name', 'Volume 1/Chapter 2')
            ->assertJsonPath('data.groups.1.pages.0.id', $chapterTwoPage->id)
            ->assertJsonCount(2, 'data.groups');
    }

    private function createAlbum(string $albumId): Album
    {
        return Album::create([
            'album_id' => $albumId,
            'title' => $albumId,
            'status' => Album::STATUS_COMPLETED,
            'page_count' => 0,
        ]);
    }

    private function createPage(Album $album, int $sortOrder, string $filePath): Page
    {
        $page = Page::create([
            'album_id' => $album->album_id,
            'sort_order' => $sortOrder,
            'file_path' => $filePath,
        ]);

        $album->increment('page_count');

        return $page;
    }
}
