import React, { useEffect, useRef } from 'react';
import { useTheme } from './ThemeContext.js';
import { useMobile } from './ResponsiveLayout.js';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  overlayClassName?: string;
}

export default function Modal({
  isOpen,
  onClose,
  children,
  maxWidth = '500px',
  className = '',
  overlayClassName = '',
}: ModalProps) {
  const { effectiveTheme } = useTheme();
  const { isMobile, isSmallMobile } = useMobile();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Track whether modal should be rendered
  const [shouldRender, setShouldRender] = React.useState(isOpen);

  // Track animation state
  const [animationState, setAnimationState] = React.useState<'closed' | 'open'>(
    isOpen ? 'open' : 'closed'
  );

  // Handle modal opening/closing
  useEffect(() => {
    if (isOpen) {
      // Add to DOM first, then trigger animation in the next frame
      requestAnimationFrame(() => {
        setShouldRender(true);
        setAnimationState('open');
      });
    } else {
      // Wait for animation to complete before removing from DOM
      requestAnimationFrame(() => {
        setAnimationState('closed');
        const timer = setTimeout(() => {
          setShouldRender(false);
        }, 400); // Match this to the CSS transition duration
        return () => clearTimeout(timer);
      });
    }
  }, [isOpen]);

  // Handle ESC key press
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [isOpen, onClose]);

  // Handle click outside dialog
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const overlayClass = `nb-dialog-overlay ${animationState === 'open' ? 'nb-dialog-open' : 'nb-dialog-closed'} ${overlayClassName}`;
  const cardClass = `nb-dialog-card ${animationState === 'open' ? 'nb-dialog-card-open' : 'nb-dialog-card-closed'} ${className}`;

  return (
    <div className={overlayClass} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={cardClass}
        data-theme={effectiveTheme}
        style={{
          margin: isMobile ? '0 10px' : 'auto',
          maxWidth: isSmallMobile ? '95vw' : maxWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}
