<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Page extends Model
{
  protected $fillable = [
    'album_id',
    'sort_order',
    'file_path',
  ];

  public function album(): BelongsTo
  {
    return $this->belongsTo(Album::class, 'album_id', 'album_id');
  }
}
