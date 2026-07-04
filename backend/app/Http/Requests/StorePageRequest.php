<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StorePageRequest extends FormRequest
{
  /**
   * Determine if the user is authorized to make this request.
   */
  public function authorize(): bool
  {
    return false;
  }

  /**
   * Get the validation rules that apply to the request.
   *
   * @return array<string, ValidationRule|array<mixed>|string>
   */
  public function rules(): array
  {
    return [
      'album_id' => 'required|exists:albums,album_id',
      'page_number' => 'required|integer',
      'file_path' => 'required|string',
    ];
  }
}
