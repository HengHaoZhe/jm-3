<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BulkStoreAlbumRequest extends FormRequest
{
  public function authorize(): bool
  {
    return true;
  }

  /**
   * @return array<string, ValidationRule|array<mixed>|string>
   */
  public function rules(): array
  {
    return [
      'album_ids' => [
        'required',
        'array',
        'min:1',
      ],

      'album_ids.*' => [
        'required',
        'string',
        'regex:/^\d+$/',
        'distinct',
      ],
    ];
  }
}
