<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AlbumController;
use App\Http\Controllers\Api\PageController;

// Route::get('/user', function (Request $request) {
//   return $request->user();
// })->middleware('auth:sanctum');

Route::apiResource('albums', AlbumController::class);
Route::get('albums/{album_id}/pages', [PageController::class, 'albumPages'])->name('albums.pages');
Route::get('albums/{album_id}/pages/{sort_order}/image', [PageController::class, 'image'])->name('pages.image');

// Route::apiResource('pages', PageController::class);
