<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Album extends Model
{
  public const STATUS_QUEUED = 'queued';
  public const STATUS_DOWNLOADING = 'downloading';
  public const STATUS_COMPLETED = 'completed';
  public const STATUS_FAILED = 'failed';

  protected $fillable = [
    'album_id',
    'title',
    'status',
    'page_count',
  ];
  public function getRouteKeyName(): string
  {
    return 'album_id';
  }
  public function pages(): HasMany
  {
    return $this->hasMany(Page::class, 'album_id', 'album_id')->orderBy('sort_order', 'asc');
  }
}
