<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gmail_threads', function (Blueprint $table) {
            $table->index(['gmail_account_id', 'last_message_at'], 'gmail_threads_account_last_msg_idx');
        });

        Schema::table('gmail_messages', function (Blueprint $table) {
            $table->index(['gmail_thread_id', 'received_at'], 'gmail_messages_thread_received_idx');
        });

        Schema::table('draft_replies', function (Blueprint $table) {
            $table->index('status', 'draft_replies_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('gmail_threads', function (Blueprint $table) {
            $table->dropIndex('gmail_threads_account_last_msg_idx');
        });

        Schema::table('gmail_messages', function (Blueprint $table) {
            $table->dropIndex('gmail_messages_thread_received_idx');
        });

        Schema::table('draft_replies', function (Blueprint $table) {
            $table->dropIndex('draft_replies_status_idx');
        });
    }
};
