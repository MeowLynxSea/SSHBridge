import React from 'react';
import { useMobile } from './ResponsiveLayout.js';

export default function Footer() {
  const { isSmallMobile } = useMobile();

  // 从环境变量获取footer内容，如果没有则使用默认值
  const envFooterText = process.env.NEXT_PUBLIC_FOOTER_TEXT;

  if (envFooterText) {
    // 如果设置了环境变量，直接显示自定义内容
    return (
      <footer
        className={`nb-header`}
        style={{
          marginTop: isSmallMobile ? '30px' : '60px',
          padding: isSmallMobile ? '15px 0' : '20px 0',
          borderTop: 'none',
          borderBottom: 'none',
          boxShadow: 'none',
          position: 'relative',
          fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
          opacity: 0.8,
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: isSmallMobile ? '0 15px' : '0 20px',
            textAlign: 'center',
            fontFamily: 'var(--font-sans)',
            color: 'var(--fg-color)',
          }}
        >
          {envFooterText}
        </div>
      </footer>
    );
  }

  // 默认footer：作者信息和GitHub链接
  return (
    <footer
      className={`nb-header`}
      style={{
        marginTop: isSmallMobile ? '30px' : '60px',
        padding: isSmallMobile ? '15px 0' : '20px 0',
        borderTop: 'none',
        borderBottom: 'none',
        boxShadow: 'none',
        position: 'relative',
        fontSize: isSmallMobile ? '0.8rem' : '0.9rem',
        opacity: 0.8,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isSmallMobile ? '0 15px' : '0 20px',
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg-color)',
        }}
      >
        Created by{' '}
        <a
          href="https://github.com/MeowLynxSea"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--accent-color)',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          MeowLynxSea
        </a>{' '}
        © 2025 | Secure SSH Tunnel Management
      </div>
    </footer>
  );
}
