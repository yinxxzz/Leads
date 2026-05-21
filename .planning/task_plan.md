# 用户分配记录查询工作台 - 任务计划

## 项目概述
创建 Next.js 全栈项目，实现用户分配记录查询工作台。前端参考现有 index.html demo，后端提供 query 和 export 两个 API 接口。

## 技术选型
- 模板：`nextjs-fullstack`（涉及 API 路由，全栈项目）
- 技术栈：Next.js + TypeScript + Tailwind CSS
- 数据源：第一版使用 Mock 数据（SQL 模板已设计，后续接入真实数据库）

---

## Phase 1: 项目初始化 [pending]
- [ ] 使用 `nextjs-fullstack` 模板创建项目
- [ ] 安装依赖 (`pnpm install`)
- [ ] 启动开发服务器
- [ ] 验证服务运行正常

## Phase 2: 后端 API 实现 [pending]
- [ ] 创建 `POST /api/allocation/query` 接口
  - 参数校验（uid/channel/dateMode/date）
  - Mock 数据逻辑（BPO + TMK）
  - 返回统一结构（hasAllocation/summary/bpoRecords/tmkRecords）
- [ ] 创建 `POST /api/allocation/export` 接口
  - 导出限制校验（uid 为空时必须指定日期）
  - 生成 CSV 内容
  - 返回 CSV 文件下载

## Phase 3: 前端页面实现 [pending]
- [ ] 创建主页面布局（参考 index.html 样式）
  - 搜索表单区域（UID 输入、渠道选择、时间范围、日期选择、按钮组）
  - 结果概览卡片（5 列：UID/是否有记录/BPO 数/TMK 数/最近日期）
  - Tab 切换 + 数据表格（BPO/TMK 分别展示）
- [ ] 实现查询逻辑
  - 表单验证
  - 调用 query API
  - 渲染结果
- [ ] 实现导出逻辑
  - 调用 export API
  - 触发 CSV 下载
- [ ] 实现重置功能

## Phase 4: 验证与构建 [pending]
- [ ] 检查编译日志（无错误）
- [ ] 检查运行时日志（无错误）
- [ ] 执行 `pnpm run build` 验证生产构建
- [ ] 修复任何类型错误

---

## 字段映射

### BPO 表格列
| 字段 key | 显示名 |
|----------|--------|
| dt | 分配日期 |
| userid | 用户 UID |
| phone | 手机号 |
| leadType | 线索类型 |
| userType | 用户类型 |
| grade | 年级 |
| rank | 排名 |
| extraInfo | 扩展信息 |

### TMK 表格列
| 字段 key | 显示名 |
|----------|--------|
| dt | 分配日期 |
| user_id | 用户 UID |
| lead_channel | 线索渠道 |
| hunt_lead_type | 线索类型 |
| grade | 年级 |
| queue_rnk | 队列排名 |

### CSV 导出统一字段
渠道、分配日期、用户UID、手机号、线索类型、用户类型/线索渠道、年级、排名、扩展信息
