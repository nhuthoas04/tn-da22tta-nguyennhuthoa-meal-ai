const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgresql',
    database: process.env.DB_NAME || 'recipe_ai',
  });
  await client.connect();
  const tables = [
    'password_reset_tokens',
    'chat_messages',
    'user_action_logs',
    'recipe_moderation_audits',
    'admin_notifications'
  ];
  for (const table of tables) {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = '${table}'
      ORDER BY ordinal_position
    `);
    console.log(`\nTable: ${table}`);
    console.log(res.rows.map(r => `  - ${r.column_name}: ${r.data_type} (Nullable: ${r.is_nullable})`).join('\n'));
  }
  await client.end();
}

run();
