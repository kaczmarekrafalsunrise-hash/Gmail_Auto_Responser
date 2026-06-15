<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        JsonResource::withoutWrapping();

        if (config('database.default') !== 'sqlite') {
            return;
        }

        try {
            DB::connection()->getPdo()->exec('PRAGMA journal_mode=WAL;');
            DB::connection()->getPdo()->exec('PRAGMA synchronous=NORMAL;');
        } catch (\Throwable) {
            //
        }
    }
}
