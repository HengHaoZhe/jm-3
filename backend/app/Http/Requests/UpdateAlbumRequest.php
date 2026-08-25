<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAlbumRequest extends FormRequest
{
  /**
   * Determine if the user is authorized to make this request.
   */
  public function authorize(): bool
  {
    return true;
  }

  /**
   * Get the validation rules that apply to the request.
   *
   * @return array<string, ValidationRule|array<mixed>|string>
   */
  public function rules(): array
  {
    return [
      'title' => ['nullable', 'string', 'max:255'],
      'page_count' => ['nullable', 'integer', 'min:0', 'max:65535'],
      'status' => [
        'required',
        Rule::in([
          'queued',
          'downloading',
          'completed',
          'failed',
        ]),
      ],
    ];
  }
}
