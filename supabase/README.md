# Supabase 数据库架构

本项目使用 Supabase 管理数据库，提供了两种连接和初始化方式。

## 📁 文件说明

### `full-schema.sql`
完整的数据库架构文件，包含：
- ✅ RPC 函数：`exec_sql`（执行原始 SQL）
- ✅ 3 张核心表：projects, conversations, messages
- ✅ 索引、约束、触发器
- ✅ 自动更新 `updated_at` 的触发器
- ✅ 行级安全 (RLS) 策略
- ✅ 完整的字段注释

**用途**：在新的 Supabase 实例中一键创建完整的数据库结构。

### `migrations/` 目录
数据库迁移文件，用于追踪表结构变更历史。

**命名规范**：`YYYYMMDDHHmmss_描述.sql`

**初始文件**：
- `20250115000001_initial_schema.sql` - 初始架构（与 full-schema.sql 相同）

### `.schema-sync-record.json`
同步记录文件，追踪数据库架构的版本和同步状态。

## 🚀 快速开始

### 前置要求

```bash
# 安装依赖
npm install

# 安装必需包（如果还未安装）
npm install @supabase/supabase-js pg
```

### 环境变量配置

项目脚手架会自动创建 `.env.local` 文件，包含以下变量：

```bash
# ==========================================
# 数据库初始化（建表、创建函数、触发器）
# ==========================================
USER_POSTGRESQL_URL=postgresql://postgres:password@host:5432/database

# ==========================================
# 应用运行时（CRUD 操作、API 调用）
# ==========================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 数据库初始化

#### 方式 1：通过 Supabase Dashboard（推荐快速验证）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `supabase/full-schema.sql` 的完整内容
5. 粘贴到 SQL Editor
6. 点击 **Run** 执行

#### 方式 2：使用 Node.js 脚本（推荐自动化）

使用 PostgreSQL 直连（从 `.env.local` 自动读取）：

```bash
# 自动从 .env.local 加载环境变量
npm run db:init

# 预期输出：
# 📊 开始初始化数据库...
# 📝 使用 PostgreSQL 直连方式
# ✅ PostgreSQL 连接成功
# ✅ SQL schema 执行完成
# ✅ 数据库初始化完成！
```

**工作原理**：
- `tsx --env-file=.env.local` 自动加载环境变量
- 读取 `USER_POSTGRESQL_URL` 连接数据库
- 执行 `supabase/full-schema.sql` 初始化表结构
- 无需手动 export 或安装额外依赖（dotenv）

#### 方式 3：Bash 脚本

```bash
chmod +x ../scripts/init-db.sh
../scripts/init-db.sh
```

## ⚠️ 数据库初始化方式说明

**核心原则**：数据库初始化**只能**使用 PostgreSQL 直连（`USER_POSTGRESQL_URL`）

**为什么必须使用 PostgreSQL 直连？**
- ✅ 支持所有 PostgreSQL 语法（`$$` 定界符、复杂函数、触发器）
- ✅ 一次性执行完整 SQL 文件（性能好）
- ✅ 原生事务支持
- ✅ 无需预先创建 RPC 函数

**应用运行时连接**：
- 使用 Supabase SDK（`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`）
- 特性：连接池、RLS 支持、自动重连
- 用于 CRUD 操作、API 调用

## 📝 迁移管理

当需要修改表结构时，遵循以下流程：

### 1. 创建迁移文件

```bash
# 命名规范：YYYYMMDDHHmmss_描述.sql
touch supabase/migrations/20250115120000_add_status_field.sql
```

### 2. 编写 SQL 变更

```sql
-- migrations/20250115120000_add_status_field.sql
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_projects_status_updated_at 
  ON projects(status_updated_at DESC);
```

### 3. 同步到 full-schema.sql

编辑 `supabase/full-schema.sql`，在对应的表定义中添加相同的字段和索引。

### 4. 执行迁移

```bash
# 方法 1：通过 Supabase Dashboard
# 复制迁移文件内容到 SQL Editor 执行

# 方法 2：使用脚本
npm run db:init
```

### 5. 更新同步记录

编辑 `.schema-sync-record.json`，更新最后迁移文件和日期。

## 🔍 验证安装

### 通过代码

```javascript
import { selectMany } from '@/app/api/supabase/lib/db-helpers';

// 验证表是否可访问
const projects = await selectMany('projects', {}, { limit: 1 });
console.log('✅ 数据库连接成功，共有', projects.length, '个项目');
```

## ⚠️ RLS 策略（重要）

当前 RLS 策略设置为**公开访问**（开发阶段）：

```sql
FOR ALL TO public USING (true) WITH CHECK (true);
```

**生产环境建议**：

```sql
-- 仅允许已认证用户访问
CREATE POLICY "Authenticated users can access projects"
  ON projects
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 或基于用户 ID 的细粒度控制
CREATE POLICY "Users can only access their projects"
  ON projects
  FOR ALL
  TO authenticated
  USING (created_by_id = auth.uid()::text)
  WITH CHECK (created_by_id = auth.uid()::text);
```

## 🔧 常见问题

### Q: 执行 schema 时报错 "relation already exists"

**A**：表已存在。可以选择：
- 跳过该错误（通过 dashboard 再次执行）
- 使用 `DROP TABLE IF EXISTS` 删除后重新创建（⚠️ 会丢失数据！）

### Q: RPC 函数调用失败，提示权限不足

**A**：确保使用了 `SUPABASE_SERVICE_ROLE_KEY` 而非 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

### Q: 如何查看当前数据库的架构？

**A**：使用 `pg_dump` 导出：

```bash
pg_dump \
  --host=db.YOUR_PROJECT_REF.supabase.co \
  --schema-only \
  --no-owner \
  --no-privileges \
  postgres > current_schema.sql
```

### Q: 如何重置数据库到初始状态？

**A**：
1. 删除所有表：`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
2. 重新执行 `full-schema.sql`

⚠️ **警告**：这会删除所有数据！

## 📚 相关资源

- [Supabase 官方文档](https://supabase.com/docs)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [数据库连接配置](../app/api/supabase/lib/README.md)
- [数据库查询辅助函数](../app/api/supabase/lib/db-helpers.ts)

## 最后更新

2025-01-15

