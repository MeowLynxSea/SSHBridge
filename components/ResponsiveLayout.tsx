import React, { useState, useEffect } from 'react';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsSmallMobile(window.innerWidth <= 480);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return { isMobile, isSmallMobile };
}

export default function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const { isMobile, isSmallMobile } = useMobile();

  return (
    <div
      className={`responsive-layout ${isMobile ? 'mobile' : ''} ${isSmallMobile ? 'small-mobile' : ''}`}
    >
      {children}
    </div>
  );
}
