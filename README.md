# GPTs Telegram Bot

A Telegram bot powered by OpenAI's GPT models that provides intelligent conversation capabilities with database persistence and operator handoff features.

## Features

- OpenAI GPT integration
- Conversation persistence with Supabase
- Operator handoff functionality
- Instance management for production deployment
- Webhook support for Vercel deployment

## Prerequisites

- Node.js >= 18.0.0
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- OpenAI API Key
- Supabase account (optional but recommended)

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp src/config/env.example .env
```

Required variables:
- `TELEGRAM_TOKEN`: Your Telegram bot token
- `OPENAI_API_KEY`: Your OpenAI API key

Optional variables:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase API key
- `OPENAI_ASSISTANT_ID`: Custom OpenAI assistant ID
- `TELEGRAM_OPERATOR_USERNAME`: Username for operator handoff
- `TELEGRAM_OPERATOR_CHAT_LINK`: Chat link for operator handoff

## Installation

```bash
# Install dependencies
npm install

# Start the bot in development mode
npm run dev

# Start the bot in production mode
npm start
```

## Deployment to Vercel

1. Push your code to GitHub
2. Create a new project on Vercel
3. Connect your GitHub repository
4. Add environment variables in Vercel dashboard
5. Deploy!

## License

ISC 