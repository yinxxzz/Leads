/**
 * 带连接池的 Supabase SDK 客户端配置
 * 使用 undici Agent 实现连接池管理和监控
 *
 * 环境变量说明：
 *   - SUPABASE_URL：Supabase 项目 URL（服务端专用）
 *   - SUPABASE_SERVICE_ROLE_KEY：Supabase Service Role Key（服务端专用，绕过 RLS）
 *
 * ❌ 不使用 NEXT_PUBLIC_* 开头的变量：
 *   - NEXT_PUBLIC_* 会暴露到客户端，不安全
 *   - 本文件仅在服务端使用，不需要 NEXT_PUBLIC_ 前缀
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { Agent } from 'undici';

// 注意：环境变量延迟读取，在 createSupabaseClient() 内部获取
// 避免模块加载时 process.env 尚未就绪的问题（Next.js 16 + Turbopack）

// 连接池统计信息
export interface SDKPoolStats {
  connectionsCreated: number;
  connectionsClosed: number;
  activeConnections: number;
  errors: Array<{
    timestamp: string;
    error: string;
  }>;
}

const sdkPoolStats: SDKPoolStats = {
  connectionsCreated: 0,
  connectionsClosed: 0,
  activeConnections: 0,
  errors: [],
};

/**
 * 创建带连接池的 undici Agent
 * 连接池大小：30
 */
const agent = new Agent({
  connections: 30, // 连接池大小
  pipelining: 1, // 管道化请求数量
  keepAliveTimeout: 60 * 1000, // 保持连接 60 秒
  keepAliveMaxTimeout: 120 * 1000, // 最大保持连接 120 秒
  connect: {
    timeout: 30 * 1000, // 连接超时 30 秒
    keepAlive: true,
  },
});

// 监听连接事件
agent.on('connect', (origin: URL) => {
  sdkPoolStats.connectionsCreated++;
  sdkPoolStats.activeConnections++;
  console.log(
    '🔗 [SDK连接池] 建立新连接:',
    origin.toString(),
    new Date().toISOString()
  );
});

agent.on(
  'disconnect',
  (origin: URL, _targets: readonly object[], error?: Error) => {
    sdkPoolStats.connectionsClosed++;
    sdkPoolStats.activeConnections = Math.max(
      0,
      sdkPoolStats.activeConnections - 1
    );

    // 区分正常的 idle timeout 和真正的错误
    if (error) {
      const isIdleTimeout = error.message.includes('idle timeout');
      if (isIdleTimeout) {
        // idle timeout 是正常行为，只记录为调试信息
        console.log('🔄 [SDK连接池] 空闲连接超时关闭:', origin.toString());
      } else {
        // 真正的错误才记录为错误
        console.error('❌ [SDK连接池] 连接异常断开:', error.message);
        sdkPoolStats.errors.push({
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    } else {
      // 正常断开连接
      console.log('✓ [SDK连接池] 正常断开连接:', origin.toString());
    }
  }
);

agent.on(
  'connectionError',
  (origin: URL, _targets: readonly object[], error: Error) => {
    console.error('⚠️ [SDK连接池] 连接错误:', error.message);
    sdkPoolStats.errors.push({
      timestamp: new Date().toISOString(),
      error: `Connection Error: ${error.message}`,
    });
  }
);

/**
 * 获取 SDK 连接池统计信息
 */
export function getSDKPoolStats(): SDKPoolStats {
  return { ...sdkPoolStats };
}

/**
 * 重置 SDK 连接池统计信息
 */
export function resetSDKPoolStats() {
  sdkPoolStats.connectionsCreated = 0;
  sdkPoolStats.connectionsClosed = 0;
  sdkPoolStats.activeConnections = 0;
  sdkPoolStats.errors = [];
}

/**
 * 创建使用连接池的 Supabase 客户端（服务端专用）
 * 环境变量延迟读取，确保在调用时才获取（兼容 Turbopack）
 */
let supabaseClient: SupabaseClient | null = null;

export function createSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  // 延迟读取环境变量，确保在调用时才获取
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      '缺少 Supabase 环境变量配置（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）'
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'nextjs-fullstack-template',
      },
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
        // 使用 undici agent 进行 fetch 请求
        return fetch(url, {
          ...options,
          // @ts-expect-error - undici agent 类型兼容
          dispatcher: agent,
        });
      },
    },
    db: {
      schema: 'public',
    },
  });

  console.log('✓ [SDK连接池] Supabase 客户端已创建');

  return supabaseClient;
}

/**
 * 获取已创建的 Supabase 客户端（向后兼容）
 * @deprecated 请使用 createSupabaseClient()
 */
export function getSupabaseClient(): SupabaseClient {
  return createSupabaseClient();
}
