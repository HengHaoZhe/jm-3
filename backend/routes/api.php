<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AlbumController;
use App\Http\Controllers\Api\PageController;

// Route::get('/user', function (Request $request) {
//   return $request->user();
// })->middleware('auth:sanctum');

Route::apiResource('albums', AlbumController::class);

Route::apiResource('pages', PageController::class);
