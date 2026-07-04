<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Page;
use App\Http\Resources\PageResource;
use App\Http\Requests\StorePageRequest;

class PageController extends Controller
{
  /**
   * Display a listing of the resource.
   */
  public function index()
  {
    return PageResource::collection(Page::paginate(50));
  }

  /**
   * Store a newly created resource in storage.
   */
  public function store(StorePageRequest $request)
  {
    $page = Page::create($request->validated());
    return new PageResource($page);
  }

  /**
   * Display the specified resource.
   */
  public function show(string $id)
  {
    $page = Page::findOrFail($id);
    return new PageResource($page);
  }

  /**
   * Update the specified resource in storage.
   */
  public function update(Request $request, string $id)
  {
    //
  }

  /**
   * Remove the specified resource from storage.
   */
  public function destroy(string $id)
  {
    //
  }
}
