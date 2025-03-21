-- Sessions table to store user sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id BIGINT UNIQUE NOT NULL,
  thread_id TEXT NOT NULL,
  human_handoff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on chat_id for faster lookups
CREATE INDEX IF NOT EXISTS sessions_chat_id_idx ON sessions(chat_id);

-- Message logs table to store conversation history
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on chat_id for faster lookups
CREATE INDEX IF NOT EXISTS message_logs_chat_id_idx ON message_logs(chat_id);

-- Row-Level Security (RLS) policies
-- In a production app, you'd configure more restrictive policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated access
CREATE POLICY "Allow authenticated access to sessions" 
  ON sessions FOR ALL 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated access to message_logs" 
  ON message_logs FOR ALL 
  USING (auth.role() = 'authenticated'); 