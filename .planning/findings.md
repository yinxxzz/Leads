# 研究发现和技术决策

## 技术决策

1. **模板选择**：使用 `nextjs-fullstack`，因为项目需要 API 路由（POST 接口）
2. **数据源**：第一版使用 Mock 数据，SQL 模板已准备好后续接入
3. **CSS 方案**：使用 Tailwind CSS 还原 index.html 的视觉效果
4. **导出方案**：后端生成 CSV 字符串，前端通过 Blob 下载

## 关键设计点

### API 设计
- `POST /api/allocation/query`：查询接口，返回 JSON
- `POST /api/allocation/export`：导出接口，返回 CSV 文件（Content-Type: text/csv）

### 参数校验规则
- uid 必须为纯数字
- channel 只允许 all/bpo/tmk
- dateMode 为 specific 时 date 必填
- 导出时 uid 为空则 dateMode 必须为 specific

### Mock 数据
- 直接复用 index.html 中的 mockBpoRecords 和 mockTmkRecords
- 后续替换为真实 SQL 查询
