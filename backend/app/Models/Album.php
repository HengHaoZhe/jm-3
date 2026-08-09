<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Album extends Model
{
  protected $fillable = [
    'album_id',
    'title',
    'status',
    'page_count',
  ];
  public function pages(): HasMany
  {
    return $this->hasMany(Page::class, 'album_id', 'album_id')->orderBy('sort_order', 'asc');
  }
}
