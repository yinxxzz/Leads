# 数据库连接配置

本目录提供灵活的数据库连接方式，根据环境变量自动选择：

1. **Supabase SDK 连接**（带 undici 连接池）
2. **PostgreSQL 直连**（使用 pg 客户端）

## 环境变量配置

### ⚠️ 重要区分：初始化 vs 运行时

| 场景 | 环境变量 | 用途 | 使用位置 |
|-----|---------|------|---------|
| **数据库初始化** | `USER_POSTGRESQL_URL` | 建表、创建函数、触发器 | `scripts/init-db.ts` |
| **应用运行时** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | CRUD 操作（Supabase SDK） | 本目录 (`lib/db.ts`) |
| **应用运行时（备用）** | `USER_POSTGRESQL_URL` | CRUD 操作（PostgreSQL 直连） | 本目录 (`lib/db.ts`) |

### 方式 1：Supabase SDK 连接（推荐用于生产环境）

```bash
# Supabase 配置（服务端专用）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**特性**：
- ✅ 使用 undici Agent 实现连接池（30 个连接）
- ✅ Keep-alive 连接（60s 空闲超时，120s 最大超时）
- ✅ 连接池监控（统计连接创建/断开/错误）
- ✅ 自动重连和错误处理
- ✅ Service Role Key 绕过 Row Level Security（适合服务端使用）

### 方式 2：PostgreSQL 直连（推荐用于开发环境）

```bash
# PostgreSQL 连接字符串（用户项目专用，初始化 + 运行时）
USER_POSTGRESQL_URL=postgresql://user:password@host:5432/database
```

**特性**：
- ✅ 直接连接数据库（无中间层）
- ✅ 支持原始 SQL 查询
- ✅ pg 连接池（20 个连接，30s 空闲超时）
- ✅ 更低延迟

## 连接方式选择逻辑

```
应用运行时连接选择（lib/db.ts）：

1. 有 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   → 使用 SDK 连接

2. 否则，有 USER_POSTGRESQL_URL
   → 使用 pg 直连

3. 否则
   → 抛出错误：数据库未配置
```

## 使用示例

### 基础 CRUD 操作

```typescript
import { selectOne, selectMany, insertOne, updateOne, deleteRecords } from './lib/db-helpers';

// 查询单条记录
const project = await selectOne<DbProject>('projects', { id: 'my-project' });

// 查询多条记录（支持排序、分页、条件操作符）
const projects = await selectMany<DbProject>(
  'projects',
  { 
    status: 'active',
    name: { $ilike: '%test%' }  // 模糊查询
  },
  { 
    orderBy: 'created_at', 
    ascending: false, 
    limit: 10 
  }
);

// 插入记录
const newProject = await insertOne<DbProject>('projects', {
  id: 'new-project',
  name: 'My New Project',
  status: 'active',
  created_at: new Date().toISOString()
});

// 更新记录
const updated = await updateOne<DbProject>(
  'projects',
  { id: 'my-project' },
  { status: 'inactive', updated_at: new Date().toISOString() }
);

// 删除记录
await deleteRecords('projects', { id: 'my-project' });
```

### 条件操作符

支持以下操作符：

```typescript
{
  $eq: value,        // 等于 (=)
  $ne: value,        // 不等于 (!=)
  $gt: value,        // 大于 (>)
  $gte: value,       // 大于等于 (>=)
  $lt: value,        // 小于 (<)
  $lte: value,       // 小于等于 (<=)
  $like: pattern,    // 模糊匹配 (LIKE)
  $ilike: pattern,   // 不区分大小写模糊匹配 (ILIKE)
  $in: [values],     // 在数组中 (IN)
  $nin: [values]     // 不在数组中 (NOT IN)
}
```

示例：

```typescript
// 查询 30 天内创建的活跃项目
const recentProjects = await selectMany<DbProject>('projects', {
  status: 'active',
  created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }
});

// 查询名称包含关键词的项目（不区分大小写）
const searchResults = await selectMany<DbProject>('projects', {
  name: { $ilike: '%搜索关键词%' }
});
```

### 批量操作

```typescript
import { insertMany } from './lib/db-helpers';

// 批量插入
const messages = await insertMany<DbMessage>('messages', [
  { conversation_id: '123', content: 'Hello', role: 'user' },
  { conversation_id: '123', content: 'Hi there!', role: 'assistant' }
]);
```

### Upsert 操作

```typescript
import { upsert } from './lib/db-helpers';

// 插入或更新（基于 id 冲突）
const project = await upsert<DbProject>(
  'projects',
  { id: 'my-project', name: 'Updated Name', status: 'active' },
  ['id']  // 冲突列
);
```

### 计数查询

```typescript
import { count } from './lib/db-helpers';

// 统计活跃项目数量
const activeCount = await count('projects', { status: 'active' });

// 统计名称包含关键词的项目数量
const searchCount = await count('projects', {
  name: { $ilike: '%关键词%' }
});
```

### 原始 SQL 查询（仅 pg 直连）

```typescript
import { rawQuery } from './lib/db-helpers';

// 执行复杂 SQL 查询
const results = await rawQuery<DbProject>(
  `
    SELECT p.*, COUNT(m.id) as message_count
    FROM projects p
    LEFT JOIN messages m ON m.project_id = p.id
    WHERE p.status = $1
    GROUP BY p.id
    ORDER BY message_count DESC
    LIMIT $2
  `,
  ['active', 10]
);
```

⚠️ **注意**：原始 SQL 查询仅在 pg 直连模式下可用，Supabase SDK 不支持。

## 连接池监控

### SDK 连接池统计（仅 SDK 模式）

```typescript
import { getSDKPoolStats, resetSDKPoolStats } from './lib/supabase-sdk-pool';

// 获取连接池统计信息
const stats = getSDKPoolStats();
console.log('连接池统计:', {
  connectionsCreated: stats.connectionsCreated,
  connectionsClosed: stats.connectionsClosed,
  activeConnections: stats.activeConnections,
  errors: stats.errors
});

// 重置统计信息
resetSDKPoolStats();
```

### pg 连接池监控（仅 pg 直连模式）

```typescript
import { getPgPool } from './lib/db';

const pool = getPgPool();
if (pool) {
  console.log('pg 连接池状态:', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
}
```

## 检查连接类型

```typescript
import { getConnectionType, isDbConfigured } from './lib/db';

// 检查当前使用的连接类型
const connType = getConnectionType();
console.log('连接类型:', connType); // 'sdk' | 'pg' | 'none'

// 检查数据库是否已配置
if (isDbConfigured()) {
  console.log('数据库已配置');
} else {
  console.error('数据库未配置，请设置环境变量');
}
```

## 文件说明

| 文件 | 职责 | 适用场景 |
|-----|------|---------|
| `db.ts` | 数据库连接管理，根据环境变量选择连接方式 | 所有场景 |
| `db-helpers.ts` | CRUD 辅助函数，自动适配连接方式 | 常规数据库操作 |
| `supabase-sdk-pool.ts` | Supabase SDK + undici 连接池 | SDK 连接模式 |

## 最佳实践

### 生产环境

```bash
# 推荐配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**优势**：
- Supabase 提供的托管服务（高可用）
- 自动 SSL/TLS 加密
- 连接池优化（undici）
- Service Role Key 适合服务端使用（绕过 RLS）

### 开发环境

```bash
# 推荐配置
USER_POSTGRESQL_URL=postgresql://postgres:postgres@localhost:5432/mydb
```

**优势**：
- 更快的本地调试
- 支持原始 SQL 查询
- 无需 Supabase 账号

### 测试环境

```bash
# 使用内存数据库或测试数据库
USER_POSTGRESQL_URL=postgresql://test:test@localhost:5433/test_db
```

## 故障排查

### 错误：Database not configured

**原因**：环境变量未正确配置

**解决方案**：
1. 检查是否设置了 `USER_POSTGRESQL_URL`
2. 或者设置 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

### 错误：Raw SQL queries are not supported with Supabase SDK

**原因**：SDK 模式不支持原始 SQL 查询

**解决方案**：
1. 使用 `db-helpers` 提供的函数（推荐）
2. 或者切换到 pg 直连模式（设置 `USER_POSTGRESQL_URL`）

### 连接池耗尽

**SDK 模式**：
- 连接池大小：30（在 `supabase-sdk-pool.ts` 中配置）
- 调整：修改 `connections` 参数

**pg 直连模式**：
- 连接池大小：20（在 `db.ts` 中配置）
- 调整：修改 `max` 参数

## 性能对比

| 特性 | SDK 连接 | pg 直连 |
|-----|---------|--------|
| 连接池大小 | 30 | 20 |
| Keep-alive | 60s | 30s |
| 连接超时 | 30s | 2s |
| 原始 SQL | ❌ | ✅ |
| RLS 支持 | ✅（可绕过） | ❌ |
| 延迟 | 稍高 | 更低 |
| 适用场景 | 生产环境 | 开发/测试 |

## 迁移指南

### 从纯 pg 迁移到 SDK 连接

1. 安装依赖：
```bash
npm install @supabase/supabase-js undici
```

2. 添加环境变量：
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

3. 代码无需修改（`db-helpers` 自动适配）

### 从 SDK 连接切换到 pg 直连

1. 添加 PostgreSQL 连接字符串：
```bash
USER_POSTGRESQL_URL=postgresql://user:password@host:5432/database
```

2. 移除 Supabase 环境变量（可选）

3. 代码无需修改（`db-helpers` 自动适配）

## 安全建议

1. **不要在客户端代码中使用直连**
   - `db.ts` 和 `db-helpers.ts` 仅在服务端使用
   - 环境变量在 Next.js API 路由中访问

2. **使用环境变量**
   - 不要硬编码数据库凭证
   - 使用 `.env.local`（开发）和环境变量（生产）

3. **Service Role Key 安全**
   - `SUPABASE_SERVICE_ROLE_KEY` 仅在服务端使用
   - 不要使用 `NEXT_PUBLIC_` 前缀（会暴露到客户端）

4. **连接池限制**
   - 避免连接泄漏（确保查询完成后释放连接）
   - 监控连接池使用情况

## 相关资源

- [Supabase 文档](https://supabase.com/docs)
- [node-postgres (pg) 文档](https://node-postgres.com/)
- [undici 文档](https://undici.nodejs.org/)
