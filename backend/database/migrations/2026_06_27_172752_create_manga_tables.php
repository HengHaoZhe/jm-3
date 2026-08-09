<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
  public function up(): void
  {
    Schema::create('albums', function (Blueprint $table) {
      $table->id();
      $table->string('album_id')->unique();
      $table->string('title')->default('');
      // queued, downloading, completed, failed
      $table->string('status')->default('queued');
      $table->unsignedSmallInteger('page_count')->default(0);
      $table->timestamps();
    });

    Schema::create('pages', function (Blueprint $table) {
      $table->id();
      $table->string('album_id')->index(); // Links straight to albums
      $table->unsignedInteger('sort_order');
      $table->string('file_path');
      $table->timestamps();
      $table->foreign('album_id')->references('album_id')->on('albums')->onDelete('cascade');
      $table->unique(['album_id', 'sort_order']);
    });
  }

  public function down(): void
  {
    Schema::dropIfExists('pages');
    Schema::dropIfExists('albums');
  }
};
