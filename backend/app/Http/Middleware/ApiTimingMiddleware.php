<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiTimingMiddleware
{
  public function handle(Request $request, Closure $next): Response
  {
    $start = microtime(true);

    $response = $next($request);

    $duration = microtime(true) - $start;

    logger()->info('API REQUEST TIMING', [
      'method' => $request->method(),
      'path' => $request->path(),
      'status' => $response->getStatusCode(),
      'duration' => $duration,
    ]);

    return $response;
  }
}
