<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
  public function up(): void
  {
    Schema::create('reading_progress', function (Blueprint $table) {
      $table->string('album_id')->primary();
      $table->unsignedInteger('page_number');
      $table->foreign('album_id')->references('album_id')->on('albums')->onDelete('cascade');
    });
  }

  public function down(): void
  {
    Schema::dropIfExists('reading_progress');
  }
};
