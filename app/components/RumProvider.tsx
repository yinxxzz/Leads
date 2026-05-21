'use client';

/**
 * RUM 初始化组件
 * 使用 @octopus-sdk/browser-rum 进行前端监控
 * 
 * 注意：此组件使用 'use client' 指令，确保只在客户端执行
 * 避免 SSR 时使用浏览器 API（如 window、document）
 */

import { useEffect } from 'react';
import { octopusRum } from '@octopus-sdk/browser-rum';

// 初始化标志，避免重复初始化
let isInitialized = false;

// Rush 预览 iframe 的唯一标识
const RUSH_PREVIEW_IFRAME_ID = 'rush-preview-iframe';

// Debug RUM 函数：将错误事件上报到 Agent API
const __debugRum = function(event: Record<string, unknown>, context: Record<string, unknown>) {
  // 只在 Rush 预览 iframe 中执行
  if (typeof window !== 'undefined' && window.name !== RUSH_PREVIEW_IFRAME_ID || event.type !== 'error') {
    return;
  }

  try {
    fetch('https://w2p1p6ht6b3c-preview.rush.zhenguanyu.com//agent/api/rum/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'w2p1p6ht6b3c',
        event: event,
        context: context,
        timestamp: Date.now()
      })
    }).catch(function(err) {
      console.warn('[RUM Debug] Failed to report error:', err);
    });
  } catch (err) {
    console.warn('[RUM Debug] Failed to report error:', err);
  }
};

export default function RumProvider() {
  useEffect(() => {
    // 避免重复初始化
    if (isInitialized) {
      return;
    }

    try {
      octopusRum.init({
        site: 'octopus-ingest-cn.zhenguanyu.com',
        service: 'w2p1p6ht6b3c',
        env: 'online',
        version: '1779251359851',
        applicationId: 'fd1d45bf-97a6-4ad0-9c98-d5b9afd66213',
        clientToken: '5f13fb121cbe46e0819eb89f54390522',
        trackUserInteractions: true,
        trackResources: true,
        trackViewsManually: false,
        beforeSend: function(event, context) {
          // 过滤掉指向收集服务的事件，避免循环上报
          if (event.type === 'resource' &&
            (event as { resource?: { url?: string } }).resource?.url?.includes('https://w2p1p6ht6b3c-preview.rush.zhenguanyu.com//agent/api/rum/events')) {
            return false; // 不发送这个事件
          }

          // 调用 debug 函数上报到 Agent
          __debugRum(event, context as unknown as Record<string, unknown>);

          // 返回 true 继续正常上报到 Octopus
          return true;
        }
      });

      isInitialized = true;
      console.log('[RUM] ✅ 初始化成功');
    } catch (error) {
      console.error('[RUM] ❌ 初始化失败:', error);
    }
  }, []);

  // 此组件不渲染任何内容
  return null;
}
