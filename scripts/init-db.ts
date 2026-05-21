#!/usr/bin/env node

/**
 * 数据库初始化脚本
 *
 * 使用方式：
 *   npm run db:init
 *
 * 工作原理：
 *   - 优先从 .env.local 加载环境变量（使用 dotenv 的 override 模式）
 *   - 读取 USER_POSTGRESQL_URL 连接数据库
 *   - 执行 supabase/full-schema.sql
 *
 * 手动执行：
 *   tsx --env-file=.env.local scripts/init-db.ts
 *
 * 环境变量说明：
 * - USER_POSTGRESQL_URL：用户项目的 PostgreSQL 连接字符串（必需）
 *   - 用途：数据库初始化（建表、创建函数、触发器）
 *   - 原因：支持所有 PostgreSQL 语法（$$ 定界符、复杂函数、触发器）
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY：用户项目的 Supabase 配置
 *   - 用途：应用运行时的数据库 CRUD 操作
 *   - 注意：不用于数据库初始化
 */

import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 优先从 .env.local 加载环境变量（override: true 覆盖已存在的全局环境变量）
// 在 Agent Pod 中，全局可能已有平台级环境变量，必须用 .env.local 中用户自己的值覆盖
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
  console.log('✅ 从 .env.local 加载数据库配置');
} else {
  console.log('⚠️ .env.local 不存在，使用全局环境变量');
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
} as const;

function log(color: string, ...args: unknown[]): void {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

async function initDatabase() {
  log(colors.blue, '📊 开始初始化数据库...');

  const postgresUrl = process.env.USER_POSTGRESQL_URL;

  // 验证环境变量
  if (!postgresUrl) {
    log(colors.red, '❌ 错误：未配置数据库连接');
    log(colors.red, '数据库初始化必须使用 PostgreSQL 直连方式');
    log(colors.red, '');
    log(colors.red, '请设置环境变量：');
    log(
      colors.red,
      '  export USER_POSTGRESQL_URL="postgresql://user:password@host:5432/dbname"'
    );
    log(colors.red, '  npm run db:init');
    log(colors.red, '');
    log(colors.red, '为什么必须使用 PostgreSQL 直连？');
    log(colors.red, '  ✅ 支持所有 PostgreSQL 语法（$$ 定界符、函数、触发器）');
    log(colors.red, '  ✅ 一次性执行完整 SQL 文件（性能好）');
    log(colors.red, '  ✅ 原生事务支持');
    log(colors.red, '');
    process.exit(1);
  }

  log(colors.blue, `📝 使用 PostgreSQL 直连方式`);
  log(
    colors.blue,
    `📝 连接地址：${postgresUrl.replace(/:[^:]*@/, ':****@')}\n`
  );

  try {
    // 读取 schema 文件
    const schemaPath = path.join(
      __dirname,
      '..',
      'supabase',
      'full-schema.sql'
    );

    if (!fs.existsSync(schemaPath)) {
      log(colors.red, `❌ 错误：schema 文件不存在：${schemaPath}`);
      process.exit(1);
    }

    const schema = fs.readFileSync(schemaPath, 'utf-8');
    log(
      colors.green,
      `✅ 已读取 schema 文件（${(schema.length / 1024).toFixed(2)} KB）\n`
    );

    // 使用 PostgreSQL 直连初始化
    await initWithPostgres(schema, postgresUrl);

    log(colors.green, '\n✅ 数据库初始化完成！');
  } catch (error) {
    log(colors.red, '\n❌ 数据库初始化失败:');
    if (error instanceof Error) {
      log(colors.red, error.message);
      if ('details' in error) {
        log(colors.red, '详情:', (error as { details: unknown }).details);
      }
    } else {
      log(colors.red, String(error));
    }
    process.exit(1);
  }
}
/**
 * 使用 PostgreSQL 直连方式初始化
 */
async function initWithPostgres(
  schema: string,
  postgresUrl: string
): Promise<void> {
  log(colors.blue, '🔗 使用 PostgreSQL 直连方式连接...');
  const client = new Client({ connectionString: postgresUrl });

  await client.connect();
  log(colors.green, '✅ PostgreSQL 连接成功\n');

  // 执行完整 schema（支持所有 PostgreSQL 语法）
  log(colors.blue, '📋 执行 SQL schema 文件...');
  await client.query(schema);
  log(colors.green, '✅ SQL schema 执行完成');

  await client.end();
}

// 主程序
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  initDatabase();
}
