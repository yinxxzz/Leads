import type { Metadata } from 'next';
import RumProvider from './components/RumProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '用户分配记录查询工作台',
  description: '查询用户在 BPO / TMK 渠道下的分配记录',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-[#f5f7fb]">
        <RumProvider />{children}</body>
    </html>
  );
}
