# Setting Up Supabase for GPT-Telegram Bot

This guide will help you set up Supabase as the database backend for your Telegram bot.

## 1. Create a Supabase Account and Project

1. Sign up for a free account at [Supabase](https://supabase.com)
2. Create a new project:
   - Choose a name for your project
   - Set a secure database password
   - Select a region close to your users
   - Wait for the project to be created (this may take a few minutes)

## 2. Get Your API Credentials

1. Go to your new project's dashboard
2. Navigate to Settings > API
3. Copy the following values:
   - **Project URL**: This is your `SUPABASE_URL`
   - **anon/public** key or **service_role** key: This is your `SUPABASE_KEY`
   
   For most deployments, the **anon/public** key is sufficient. Use the **service_role** key only if you need to bypass Row Level Security (RLS).

4. Add these values to your `.env` file:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=eyJh...
   ```

## 3. Create Database Tables

1. In your Supabase project dashboard, go to the SQL Editor
2. Create a new query
3. Copy and paste the SQL schema from `src/config/schema.sql`
4. Run the query to create the necessary tables

Here's an overview of the tables that will be created:

### Sessions Table
Stores user session data and thread IDs:
- `id`: Unique UUID for each session
- `chat_id`: Telegram chat ID
- `thread_id`: OpenAI thread ID
- `human_handoff`: Whether the user is in human handoff mode
- `created_at`: When the session was created
- `updated_at`: When the session was last updated

### Message Logs Table
Stores conversation history:
- `id`: Unique UUID for each message
- `chat_id`: Telegram chat ID
- `role`: Who sent the message (user, assistant, or system)
- `content`: The message content
- `created_at`: When the message was sent

## 4. Test the Connection

1. Start your bot with the Supabase credentials in the `.env` file
2. Check the console output - you should see:
   ```
   Database integration: Enabled
   ```
3. Send `/start` to your bot on Telegram and have a short conversation
4. In Supabase, go to Table Editor and check:
   - The `sessions` table should have an entry for your chat
   - The `message_logs` table should contain your conversation

## Troubleshooting

### Connection Issues
- Verify that your `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check if your IP address is allowed in the Supabase project settings
- Ensure your Supabase plan has not reached its connection limits

### Table Creation Errors
- If you see errors when running the SQL schema, try running each CREATE TABLE statement separately
- Make sure you have the necessary permissions in your Supabase project

### Row Level Security Issues
- By default, the schema enables Row Level Security with policies for authenticated access
- If using the anon key and encountering permission issues, you may need to adjust the RLS policies

## Going Further

### Adding User Authentication
You can enhance security by implementing user authentication with Supabase Auth.

### Custom Analytics
With the data stored in Supabase, you can build custom analytics dashboards to track bot usage.

### Backup and Restore
Regularly back up your database using Supabase's backup features or PostgreSQL dumps. 