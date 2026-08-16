<?php

use App\Http\Controllers\Api\AlbumController;
use App\Http\Controllers\Api\PageController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Route::get('/user', function (Request $request) {
//   return $request->user();
// })->middleware('auth:sanctum');
Route::post('/albums/{album_id}/count-pages', [AlbumController::class, 'countPages']);
Route::get('albums/{album_id}/pages', [PageController::class, 'albumPages'])->name('albums.pages');
Route::get('albums/{album_id}/pages/{sort_order}/image', [PageController::class, 'image'])->name('pages.image');
Route::apiResource('albums', AlbumController::class);

// Route::apiResource('pages', PageController::class);
