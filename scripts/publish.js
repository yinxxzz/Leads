#!/usr/bin/env node

/**
 * Next.js 项目 publish 脚本
 * 功能：安装依赖并构建项目
 * 兼容：Windows、macOS、Linux
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 获取当前脚本所在目录的父目录（项目根目录）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 开始 Next.js 项目 publish 流程...\n');

// 步骤 1: 安装依赖
console.log('📦 步骤 1/2: 安装依赖...');
try {
  execSync('npm install', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  console.log('✅ 依赖安装完成\n');
} catch (error) {
  console.error('❌ 依赖安装失败');
  console.error(error.message);
  process.exit(1);
}

// 步骤 2: 构建项目
console.log('🔨 步骤 2/2: 构建 Next.js 项目...');
try {
  execSync('npm run build', {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  console.log('✅ 构建完成\n');
} catch (_error) {
  console.error('❌ 构建失败');
  console.error(
    '💡 提示：如果遇到构建错误，请在 Rush Chat 中描述问题，AI 将帮你解决！\n'
  );
  process.exit(1);
}

// 检查构建产物
const nextBuildDir = join(projectRoot, '.next');
if (!existsSync(nextBuildDir)) {
  console.error('❌ 构建产物目录不存在:', nextBuildDir);
  process.exit(1);
}

console.log('🎉 Publish 完成！');
console.log(`📁 构建产物位于: ${nextBuildDir}`);
console.log('\n💡 如何运行（在项目根目录运行以下命令）：');
console.log(
  '   npm start            # 生产模式运行，访问 http://localhost:8000'
);
console.log('   npm run dev          # 开发模式运行（支持热更新）');
