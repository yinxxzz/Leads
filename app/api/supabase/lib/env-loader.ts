/**
 * 环境变量加载器（服务端专用）
 *
 * WORKAROUND: Next.js 16 + Turbopack 开发模式下，API 路由中的 process.env
 * 无法正确读取 .env.local 中的环境变量。手动使用 dotenv 加载作为临时方案。
 *
 * Tracking:
 *   - https://github.com/vercel/next.js/issues/47766 (env vars not loaded in middleware/edge with Turbopack)
 *   - https://github.com/vercel/next.js/issues/46296 (standalone build .env.local not included)
 *
 * TODO: 当 Turbopack 修复 .env.local 加载后，移除此文件及其引用。
 */

const isServer = typeof window === 'undefined';

let envLoaded = false;

/**
 * 确保 .env.local 环境变量已加载（幂等）
 *
 * 在服务端首次调用时，手动使用 dotenv 加载 .env.local。
 * 后续调用直接返回，不会重复加载。
 */
export function ensureEnvLoaded(): void {
  if (!isServer || envLoaded) return;

  envLoaded = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    // 先加载 .env.local（优先级更高），再加载 .env 作为兜底
    // dotenv 的 config() 不会覆盖已存在的环境变量
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  } catch (e) {
    // dotenv 不可用时静默降级，依赖 process.env 全局环境变量
    console.warn('[env-loader] 无法加载 .env.local（可能 dotenv 未安装）:', e);
  }
}
