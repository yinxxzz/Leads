# nextjs-fullstack

- **类型**：前后端一体化项目
- **技术栈**：Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS v4
- **用途**：需要前后端一体化的全栈 Web 应用
- **特点**：
  - ✅ Next.js 16 App Router
  - ✅ API Routes 预配置
  - ✅ SSR/SSG 支持
  - ✅ Tailwind CSS v4（使用 `@tailwindcss/postcss`）
  - ✅ lucide-react 图标库（AI 推荐使用）
  - ✅ shadcn/ui 工具库（clsx, class-variance-authority, tailwind-merge）
  - ✅ CORS 配置已预置
  - ✅ ESLint 配置
  - ✅ 示例 API 路由和页面
  - ✅ 双数据库连接模式（Supabase SDK + PostgreSQL 直连）
  - ✅ 自动化数据库初始化脚本

## 环境变量配置

nextjs-fullstack 支持两种数据库连接方式，根据环境变量自动选择：

### 方式 1：Supabase SDK（推荐用于生产环境）

```bash
# .env.production、.env.local 或 .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

特点：
- 使用 undici Agent 实现连接池（30 个连接）
- Keep-alive 连接（60s 空闲超时，120s 最大超时）
- 支持 Row Level Security（RLS）
- 适合生产环境部署

### 方式 2：PostgreSQL 直连（用于数据库初始化）

```bash
# .env.local
USER_POSTGRESQL_URL=postgresql://postgres:password@localhost:5432/mydb
```

特点：
- 直接连接 PostgreSQL 数据库
- pg 连接池（20 个连接）
- **主要用于数据库初始化**（建表、创建函数、触发器）
- 支持所有 PostgreSQL 语法

**连接方式说明**：
- **数据库初始化**：使用 `USER_POSTGRESQL_URL`（PostgreSQL 直连）
- **应用运行时**：使用 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`（Supabase SDK）
- 两种方式连接的是同一个数据库，只是协议不同

## 数据库初始化

使用新的数据库系统需要执行以下步骤：

### 步骤 1：验证环境变量配置

项目脚手架会自动创建 `.env.local` 文件，包含必需的数据库连接变量：

```bash
# 数据库初始化（建表、创建函数、触发器） - 必需
USER_POSTGRESQL_URL=postgresql://postgres:password@host:5432/database

# 应用运行时（CRUD 操作、API 调用） - 必需
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**⚠️ 重要**：
- `.env.local` 由项目创建时自动生成（通过 `env-setting.json` 配置）
- 如果文件不存在或变量缺失，请检查脚手架流程
- 变量值从执行环境（Pod）自动注入，无需手动配置

**获取 PostgreSQL 连接字符串**（如需手动配置）：
1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入 Settings → Database
3. 复制 Connection string → URI
4. 示例：`postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

### 步骤 2：初始化数据库

```bash
# 自动从 .env.local 加载环境变量并初始化数据库
npm run db:init

# 预期输出：
# 📊 开始初始化数据库...
# 📝 使用 PostgreSQL 直连方式
# 🔗 使用 PostgreSQL 直连方式连接...
# ✅ PostgreSQL 连接成功
# 📋 执行 SQL schema 文件...
# ✅ SQL schema 执行完成
# ✅ 数据库初始化完成！
```

**工作原理**：
- `tsx --env-file=.env.local` 自动加载环境变量
- 读取 `USER_POSTGRESQL_URL` 连接数据库
- 执行 `supabase/full-schema.sql` 初始化表结构
- 无需手动 export 或安装额外依赖（dotenv）

**为什么必须使用 PostgreSQL 直连初始化？**
- ✅ 支持所有 PostgreSQL 语法（$$ 定界符、复杂函数、触发器）
- ✅ 一次性执行完整 SQL 文件（性能好）
- ✅ 原生事务支持
- ✅ 无需预先创建 RPC 函数
