<?php

use App\Http\Controllers\Api\AlbumController;
use App\Http\Controllers\Api\PageController;
use Illuminate\Support\Facades\Route;

// Route::get('/user', function (Request $request) {
//   return $request->user();
// })->middleware('auth:sanctum');
Route::post('/albums/bulk', [AlbumController::class, 'bulkStore']);
Route::post('/albums/redownload-failed', [AlbumController::class, 'redownloadFailed']);
Route::post('/albums/{album_id}/redownload', [AlbumController::class, 'redownload']);
Route::post('/albums/{album_id}/count-pages', [AlbumController::class, 'countPages']);
Route::post('/albums/{album_id}/import-pages', [AlbumController::class, 'importPages']);
Route::get('albums/{album_id}/pages', [PageController::class, 'albumPages'])->name('albums.pages');
Route::get('albums/{album_id}/pages/{sort_order}/image', [PageController::class, 'image'])->name('pages.image');
Route::put('/albums/{album_id}/pages/order', [PageController::class, 'reorder']);
Route::get('/albums/{album_id}/reader', [AlbumController::class, 'reader']);
Route::get('/albums/{album_id}/edit', [AlbumController::class, 'edit']);
Route::apiResource('albums', AlbumController::class);

// Route::apiResource('pages', PageController::class);
