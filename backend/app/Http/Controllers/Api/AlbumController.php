<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Album;
use App\Http\Requests\StoreAlbumRequest;
use App\Http\Resources\AlbumResource;

class AlbumController extends Controller
{
  /**
   * Display a listing of the resource.
   */
  public function index()
  {
    return AlbumResource::collection(
      Album::with('pages')->paginate(20)
    );
  }

  /**
   * Store a newly created resource in storage.
   */
  public function store(StoreAlbumRequest $request)
  {
    $album = Album::create($request->validated());
    return new AlbumResource($album);
  }

  /**
   * Display the specified resource.
   */
  public function show(string $album_id)
  {
    $album = Album::with('pages')
      ->where('album_id', $album_id)
      ->firstOrFail();
    return new AlbumResource($album);
  }

  /**
   * Update the specified resource in storage.
   */
  public function update(StoreAlbumRequest $request, string $album_id)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();
    $album->update($request->validated());
    return new AlbumResource($album);
  }

  /**
   * Remove the specified resource from storage.
   */
  public function destroy(string $album_id)
  {
    $album = Album::where('album_id', $album_id)->firstOrFail();
    $album->delete();
    return response()->json(['message' => 'Deleted']);
  }
}
