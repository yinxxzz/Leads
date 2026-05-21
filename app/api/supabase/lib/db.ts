/**
 * 数据库连接配置（应用运行时）
 *
 * ⚠️ 注意：这是应用运行时的数据库连接，不是数据库初始化！
 *
 * 数据库初始化：
 *   - 使用 USER_POSTGRESQL_URL（PostgreSQL 直连）
 *   - 执行 npm run db:init（运行 scripts/init-db.ts）
 *
 * 应用运行时（本文件）：
 *   - 优先使用 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（Supabase SDK）
 *   - 备用方案：USER_POSTGRESQL_URL（PostgreSQL 直连）
 *
 * 环境变量说明：
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY：应用运行时 Supabase SDK 连接
 *   - USER_POSTGRESQL_URL：用户项目专用 PostgreSQL 连接（初始化 + 运行时）
 *
 * 设计说明：
 *   - 环境变量延迟读取：在函数调用时读取 process.env，而非模块顶层
 *   - 连接池延迟初始化：首次调用 getPgPool()/getSupabaseClient() 时创建
 *   - 初始化失败可重试：仅在成功创建时缓存实例，失败后下次调用会重新尝试
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { ensureEnvLoaded } from './env-loader';

// 检查是否在服务端环境
const isServer = typeof window === 'undefined';

// 在模块加载时确保环境变量已加载
if (isServer) {
  ensureEnvLoaded();
}

// 连接方式类型
export type ConnectionType = 'sdk' | 'pg' | 'none';

/**
 * 判断使用哪种连接方式（延迟读取环境变量）
 *
 * 优先级：
 * 1. Supabase SDK（如果配置了 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）
 * 2. PostgreSQL 直连（如果配置了 USER_POSTGRESQL_URL）
 * 3. 未配置（none）
 */
export function getConnectionType(): ConnectionType {
  if (!isServer) return 'none';

  // 每次调用时读取环境变量，确保获取最新值
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userPostgresqlUrl = process.env.USER_POSTGRESQL_URL;

  // 优先使用 SDK 连接（如果配置了）
  if (supabaseUrl && supabaseServiceRoleKey) {
    return 'sdk';
  }

  // 否则使用 pg 直连
  if (userPostgresqlUrl) {
    return 'pg';
  }

  return 'none';
}

/**
 * 检查数据库是否已配置
 */
export function isDbConfigured(): boolean {
  return getConnectionType() !== 'none';
}

/**
 * pg 连接池（仅在使用 pg 直连时）
 * 使用延迟初始化，首次调用 getPgPool() 时创建
 */
let pgPool: Pool | null = null;

/**
 * Supabase 客户端（仅在使用 SDK 连接时）
 * 使用延迟初始化，首次调用 getSupabaseClient() 时创建
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * 数据库查询结果类型（统一格式）
 */
export interface DbQueryResult<T> {
  rows: T[];
  rowCount: number | null;
  command: string;
  oid: number;
  fields: unknown[];
}

/** 标记是否已打印过 pg 连接日志（避免重复日志） */
let pgLogPrinted = false;

/**
 * 获取 pg Pool（仅在 pg 直连模式下）
 * 使用延迟初始化，首次调用时创建连接池。
 * 如果初始化失败（环境变量缺失等），下次调用会重新尝试。
 */
export function getPgPool(): Pool | null {
  if (!isServer) return null;

  // 已成功初始化，直接返回缓存实例
  if (pgPool) return pgPool;

  const connType = getConnectionType();
  if (connType !== 'pg') return null;

  // 动态导入 pg，避免在客户端打包
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool: PgPool } = require('pg');
  pgPool = new PgPool({
    connectionString: process.env.USER_POSTGRESQL_URL,
    max: 20, // 最大连接数
    idleTimeoutMillis: 30000, // 空闲连接超时时间
    connectionTimeoutMillis: 2000, // 连接超时时间
  }) as Pool;

  if (!pgLogPrinted) {
    console.log('✓ [数据库] 使用 pg 直连模式（USER_POSTGRESQL_URL）');
    pgLogPrinted = true;
  }

  return pgPool;
}

/** 标记是否已打印过 Supabase 连接日志（避免重复日志） */
let supabaseLogPrinted = false;

/**
 * 获取 Supabase 客户端（仅在 SDK 模式下）
 * 使用延迟初始化，首次调用时创建客户端。
 * 如果初始化失败（环境变量缺失等），下次调用会重新尝试。
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isServer) return null;

  // 已成功初始化，直接返回缓存实例
  if (supabaseClient) return supabaseClient;

  const connType = getConnectionType();
  if (connType !== 'sdk') return null;

  // 动态导入 Supabase SDK 连接池
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSupabaseClient } = require('./supabase-sdk-pool');
  supabaseClient = createSupabaseClient();

  if (!supabaseLogPrinted) {
    console.log('✓ [数据库] 使用 Supabase SDK 连接模式（带连接池）');
    supabaseLogPrinted = true;
  }

  return supabaseClient;
}
