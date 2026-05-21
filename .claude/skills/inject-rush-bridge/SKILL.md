---
name: inject-rush-bridge
description: 给**用户项目**（workspace/<projectId> 下从 template 创建但未集成 bridge 的老项目）补上 Rush Bridge 的 framework plugin 注入，让预览 iframe 恢复与 host 通信（selectElement、CSS 检查、console 转发等）。**不要改 template/ 目录**。触发："选取元素不工作"、"Bridge not ready"、"预览没反应"、"注入 bridge"、"rush-bridge 失效"、"补上 bridge"
user-invocable: true
---

# Inject Rush Bridge — 给老项目补 bridge 集成

**这个 SKILL 修的是「已经创建好、但预览 bridge 不工作」的用户项目**（通常在 `~/project/workspace/<projectId>/` 或部署容器内的 `/workspace/<projectId>/`）。

绝大多数症状表现为：
- 浏览器 Console 一直打 `[PreviewPanel] Bridge not ready, skipping overlay injection`
- 点"选取元素"失败：`Failed to enable element selection: Error: Bridge not ready`
- 预览 iframe 里 `window.__RUSH_BRIDGE__` 为 undefined，或 `document.getElementById('rush-bridge')` 为 null
- `curl <projectUrl>/__rush_bridge.js` 返回 404 或 index.html 的 HTML（SPA fallback）

根因一般是：**项目是在 bridge-plugin 机制上线前创建的**，框架配置里没挂 `rushBridgePlugin()` / `<RushBridgeScript />`，所以预览框架不响应 bridge 资源请求。

> ⚠️ **绝对不要去动 `template/` 目录**。模板的 working tree 来自上游 GitLab，改了也不会传上去（`.gitignore` 第 80 行），而且 `template-scaffold` workflow 每次新建项目都从 GitLab 直接 clone，**本地 template/ 完全不参与新项目创建**。要让上游模板带 bridge 是另一件事（改 GitLab 或写 scaffold workflow step），本 SKILL 不负责。

## 诊断流程（4 步，按顺序跑）

```bash
REPO_ROOT="$(git -C "$PWD" rev-parse --show-toplevel)"
PROJECT_DIR="<项目根目录绝对路径，例：~/project/workspace/abcd-1234>"
cd "$PROJECT_DIR"
```

### 诊断 1 — 判断项目类型

```bash
if [ -f vite.config.ts ] || [ -f vite.config.js ]; then
  # Vite 项目（react-tailwind-v3 或 simple-html 血统）
  PROJECT_TYPE="vite"
  VITE_CONFIG="$(ls vite.config.{ts,js} 2>/dev/null | head -1)"
  echo "type=vite, config=$VITE_CONFIG"
elif [ -f next.config.js ] || [ -f next.config.ts ]; then
  # Next.js App Router 项目（nextjs-fullstack-test 血统）
  PROJECT_TYPE="nextjs"
  echo "type=nextjs"
else
  PROJECT_TYPE="unknown"
  echo "type=unknown — 先用 Read/LS 人工确认框架后再走对应分支"
fi
```

### 诊断 2 — 判断集成标志（看是否需要补）

```bash
# Vite
grep -l 'rushBridgePlugin' "$VITE_CONFIG" 2>/dev/null && echo "✓ Vite plugin already integrated"
[ -f vite-plugin-rush-bridge.ts ] && echo "✓ plugin file present"

# Next
grep -l 'RushBridgeScript' app/layout.tsx 2>/dev/null && echo "✓ Next component already wired"
[ -f app/_rush-bridge-script.tsx ] && echo "✓ next component file present"
[ -f app/api/rush-bridge/route.ts ] && echo "✓ next route handler present"

[ -f .rush-bridge.js ] && echo "✓ bridge content file present ($(wc -c < .rush-bridge.js) bytes)"
```

四项全命中 → 不用补，bug 在别处（看"故障排查"表）。
任一缺失 → 按下面对应分支补。

### 诊断 3 — 服务端联通性（决定是否需要重启 dev server）

```bash
# 拿到项目运行时的端口（模板里默认 8000；以防万一，从 package.json 或 vite 配置里确认）
PORT=8000

# Vite 项目
curl -sI --noproxy localhost http://localhost:$PORT/__rush_bridge.js | head -3

# Next 项目
curl -sI --noproxy localhost http://localhost:$PORT/api/rush-bridge | head -3
```

- 返回 `200 application/javascript` → 服务端 OK，如果浏览器还报 `Bridge not ready`，通常是 iframe 没刷新或跨源 postMessage 被丢（查 bridge-client.ts 的升级日期）。
- 返回 `404` / HTML → 进到"补丁分支"。

---

## 补丁分支

### 分支 A：Vite 项目（react/tailwind 或 vanilla html）

```bash
# 1) 复制 plugin 文件（单一来源，别自己写）
cp "$REPO_ROOT/apps/agent/lib/features/web-builder/template-plugins/vite-plugin-rush-bridge.ts" \
   "$PROJECT_DIR/vite-plugin-rush-bridge.ts"

# 2) .gitignore 把 .rush-bridge.js 加上（项目在本地有独立 .git；避免污染上游）
grep -qxF '.rush-bridge.js' "$PROJECT_DIR/.gitignore" 2>/dev/null \
  || echo '.rush-bridge.js' >> "$PROJECT_DIR/.gitignore"
```

**改 `vite.config.{ts,js}`**。用 `StrReplace` 工具精确改两处：

1. 在最后一个 `import` 行后面加 import：
   ```ts
   import { rushBridgePlugin } from './vite-plugin-rush-bridge';
   ```

2. 在 `plugins: [...]` 数组里追加 `rushBridgePlugin()`。

   - 如果原来是 `plugins: [react(), tailwindcss()]` → 改成 `plugins: [react(), tailwindcss(), rushBridgePlugin()]`
   - 如果原来**没有** `plugins` 字段（比如 simple-html 的 vanilla vite.config）→ 在 `defineConfig({` 里加 `plugins: [rushBridgePlugin()],` 作为首个字段

### 分支 B：Next.js App Router 项目

```bash
# 1) UI 组件（下划线前缀文件，不进路由系统）
cp "$REPO_ROOT/apps/agent/lib/features/web-builder/template-plugins/next-rush-bridge-script.tsx" \
   "$PROJECT_DIR/app/_rush-bridge-script.tsx"

# 2) Route Handler
mkdir -p "$PROJECT_DIR/app/api/rush-bridge"
cp "$REPO_ROOT/apps/agent/lib/features/web-builder/template-plugins/next-rush-bridge-route.ts" \
   "$PROJECT_DIR/app/api/rush-bridge/route.ts"

# 3) .gitignore
grep -qxF '.rush-bridge.js' "$PROJECT_DIR/.gitignore" 2>/dev/null \
  || echo '.rush-bridge.js' >> "$PROJECT_DIR/.gitignore"
```

**改 `app/layout.tsx`**。用 `StrReplace`：

1. `import './globals.css';` 上方加一行：
   ```tsx
   import { RushBridgeScript } from './_rush-bridge-script';
   ```

2. `RootLayout` 的 JSX 里，给 `<html>` 加 `<head>` 并渲染组件（有 `<head>` 就加进去）：
   ```tsx
   return (
     <html lang="en">
       <head>
         <RushBridgeScript />
       </head>
       <body>{children}</body>
     </html>
   );
   ```

> ❌ 不要用 `next/script`（会被降级加载策略影响）；❌ 不要把 `<RushBridgeScript />` 放 `<body>` 里（bridge 需要尽早执行）。
>
> ❌ 也不要创建 `app/__rush_bridge.js/route.ts`——Next App Router 把带下划线前缀的 **文件夹** 视为 private 不参与路由。文件（`app/_xxx.tsx`）OK，文件夹不 OK，这就是为什么 Next 走 `/api/rush-bridge` 而不是和 Vite 一样的 `/__rush_bridge.js`。

---

## 生成 bridge 内容文件（公共最后一步）

> 通常 `dev-server-manager.ts` 在启动 dev server 之前会自动调 `ensureRushBridgeFile(projectPath)` 把 `.rush-bridge.js` 写入（见 `apps/agent/lib/features/web-builder/server/bridge-file-writer.ts`）。
> **如果是由 AI/用户手动跑的 `pnpm dev`（绕开 manager），或者 bridge 源码刚改完想立刻生效，就手动跑一下**：

```bash
pnpm --filter @cortex/agent --silent dump-bridge > "$PROJECT_DIR/.rush-bridge.js" 2>/dev/null
wc -c "$PROJECT_DIR/.rush-bridge.js"   # 应 ~5KB+
head -3 "$PROJECT_DIR/.rush-bridge.js"  # 应以 `(() => {` 开头
```

---

## 重启与验证

改完配置必须重启 dev server（plugin 只在 configResolved/启动时注册）：

```bash
# 按当前工程惯例（优先走 agent 的 workflow，否则简单重启）：
lsof -ti:8000 | xargs kill -9 2>/dev/null
sleep 1
# 让 agent 触发重启（如果是从 web UI 创建的项目）
#   workflow: dev-server-restart（agent 内部调用）
# 或者手动：
cd "$PROJECT_DIR" && nohup pnpm dev > dev-server.log 2>&1 &
sleep 5
```

**服务端验证**：

```bash
# Vite
curl -sI --noproxy localhost http://localhost:8000/__rush_bridge.js | head -5

# Next
curl -sI --noproxy localhost http://localhost:8000/api/rush-bridge | head -5
```

**浏览器验证**（在 host 页面 DevTools）：

```js
// 在 host console（不是 iframe context）看
// 1. 应能看到这条日志（iframe 内的 console 被 bridge 拦截转发过来）：
// [PreviewPanel] Bridge ready (count: N)! Injecting overlay script...

// 2. 切到 iframe context 验证：
document.getElementById('rush-bridge')                 // 应为 <script>
document.getElementById('rush-bridge').dataset.source  // 'vite-plugin' 或 'next-component'
window.__RUSH_BRIDGE__                                 // true
```

## 故障排查

| 现象 | 定位 / 修复 |
|---|---|
| `/__rush_bridge.js` 或 `/api/rush-bridge` 返回 404 + 「bridge file not found」 | `.rush-bridge.js` 缺失。正常 dev-server-manager 会自动写；手动 `pnpm dev` 则需跑「生成 bridge 内容文件」那步 |
| `<script id="rush-bridge">` 标签不在 HTML 里 | 配置文件没挂 plugin/组件；重新过一次"补丁分支"的 StrReplace 步骤 |
| Vite 报 `Cannot find module '...vite-plugin-rush-bridge'` | plugin 文件没 cp 过去；或 `vite.config.js` 想 import `.ts` 失败（模板约定 Vite 5+ 支持，若异常把 plugin 改名成 `.js` 去掉类型注解） |
| Next 报 `Module not found: app/_rush-bridge-script` | 路径错了，重新 cp。注意 `_rush-bridge-script.tsx` 是**文件**，不是文件夹 |
| `data-source` 显示 `proxy-rewrite` | 还在走 8001 proxy 的旧路径（已 @deprecated）；预览 iframe 的 URL 应直接打 dev server 8000 |
| Bridge 内容更新后浏览器没生效 | plugin 已有 mtime 缓存破坏；硬刷新一次（DevTools Network → Disable cache） |
| `rush:bridge-ready` 死活没收到但 bridge 在运行 | 跨源 postMessage target origin 匹配失败。确认 bridge-client.ts 已升级（用 `trustedParentOrigin \|\| '*'` fallback，见 git log） |

## 单一来源

- Bridge 源：`apps/agent/lib/features/web-builder/server/bridge-client.ts`
              + `preload-webview-browser.ts`
- 编译入口：`apps/agent/lib/features/web-builder/server/bridge-script.ts → getBridgeScript()`
- 跨进程分发：`apps/agent/scripts/dump-bridge.ts`（`pnpm --filter @cortex/agent dump-bridge`）
- 可复制到项目的 stub：`apps/agent/lib/features/web-builder/template-plugins/`
- 启动时自动写 `.rush-bridge.js`：`apps/agent/lib/features/web-builder/server/bridge-file-writer.ts`
- 已废弃：`apps/agent/lib/features/web-builder/server/preview-proxy.ts`（@deprecated）

## 约束总结

- **只改 `<项目根>/` 一个目录**，不改 `apps/`，不改 `template/`，不改 `packages/`
- 不新写 bridge 源码 —— 始终从 `template-plugins/` 或 `dump-bridge` 拿（避免漂移）
- 所有本项目文件（`vite-plugin-rush-bridge.ts` / `app/_rush-bridge-script.tsx` / `app/api/rush-bridge/route.ts` / `.rush-bridge.js`）都应进项目自己的 `.gitignore`（不污染上游模板 repo）
