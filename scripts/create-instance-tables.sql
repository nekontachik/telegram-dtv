-- Створення таблиці для відслідковування екземплярів ботів
CREATE TABLE IF NOT EXISTS bot_instances (
  instance_id UUID PRIMARY KEY,
  hostname TEXT NOT NULL,
  last_heartbeat TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Індекс для швидкого пошуку по останньому оновленню
CREATE INDEX IF NOT EXISTS idx_bot_instances_heartbeat ON bot_instances(last_heartbeat);

-- Створення таблиці для логів
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Індекс для швидкого пошуку по рівню лога
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

-- Індекс для швидкого пошуку по даті
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);

-- Коментарі для розуміння структури
COMMENT ON TABLE bot_instances IS 'Таблиця для відслідковування активних екземплярів бота';
COMMENT ON COLUMN bot_instances.instance_id IS 'Унікальний ідентифікатор екземпляра бота';
COMMENT ON COLUMN bot_instances.hostname IS 'Назва хоста, на якому запущено екземпляр';
COMMENT ON COLUMN bot_instances.last_heartbeat IS 'Час останнього оновлення (heartbeat) від екземпляра';
COMMENT ON COLUMN bot_instances.started_at IS 'Час запуску екземпляра';

COMMENT ON TABLE logs IS 'Таблиця для збереження логів бота';
COMMENT ON COLUMN logs.level IS 'Рівень логу (info, warn, error)';
COMMENT ON COLUMN logs.message IS 'Текст повідомлення логу';
COMMENT ON COLUMN logs.error_message IS 'Текст помилки (для рівня error)';
COMMENT ON COLUMN logs.error_stack IS 'Стек помилки (для рівня error)';
COMMENT ON COLUMN logs.metadata IS 'Додаткові дані у форматі JSON'; 