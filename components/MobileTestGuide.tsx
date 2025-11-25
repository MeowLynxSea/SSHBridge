import React, { useState } from 'react';
import { useMobile } from './ResponsiveLayout';

export default function MobileTestGuide() {
  const [isVisible, setIsVisible] = useState(false);
  const { isMobile } = useMobile();

  // Only show on desktop
  if (isMobile) return null;

  return (
    <>
      <button
        className="nb-btn"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          padding: '8px 12px',
          fontSize: '0.8rem',
          opacity: 0.7
        }}
        onClick={() => setIsVisible(!isVisible)}
      >
        {isVisible ? 'HIDE' : 'MOBILE GUIDE'}
      </button>

      {isVisible && (
        <div 
          className="nb-box nb-dialog-overlay" 
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setIsVisible(false)}
        >
          <div 
            className="nb-dialog-card"
            style={{ 
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '20px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nb-dialog-header">
              <h2>MOBILE RESPONSIVENESS TESTING GUIDE</h2>
              <button 
                className="nb-btn" 
                style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '5px' }}
                onClick={() => setIsVisible(false)}
              >
                X
              </button>
            </div>
            <div className="nb-dialog-body">
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', marginBottom: '10px' }}>
                  How to Test Mobile Responsiveness:
                </h3>
                <ol style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '10px' }}>
                    <strong>Browser DevTools:</strong> Open Developer Tools (F12), click the device icon, and select various mobile devices from the dropdown.
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong>Manual Resize:</strong> Simply resize your browser window to test different breakpoint widths (768px and 480px).
                  </li>
                  <li style={{ marginBottom: '10px' }}>
                    <strong>Real Device:</strong> Access <code>{`http://[your-local-ip]:3000`}</code> from your mobile device on the same network.
                  </li>
                </ol>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', marginBottom: '10px' }}>
                  Key Mobile Optimizations:
                </h3>
                <ul style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '5px' }}>
                    <strong>Responsive Layout:</strong> Components adapt to screen size with appropriate font sizes and spacing.
                  </li>
                  <li style={{ marginBottom: '5px' }}>
                    <strong>Mobile Navigation:</strong> Collapsible menu with hamburger icon on small screens.
                  </li>
                  <li style={{ marginBottom: '5px' }}>
                    <strong>Touch-Friendly:</strong> Larger touch targets for buttons and interactive elements.
                  </li>
                  <li style={{ marginBottom: '5px' }}>
                    <strong>Adaptive Table:</strong> Tables transform to card-based layout on mobile devices.
                  </li>
                  <li style={{ marginBottom: '5px' }}>
                    <strong>Viewport Meta:</strong> Proper viewport configuration for optimal mobile rendering.
                  </li>
                </ul>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', marginBottom: '10px' }}>
                  Breakpoints:
                </h3>
                <ul style={{ lineHeight: '1.8', paddingLeft: '20px' }}>
                  <li><strong>Desktop:</strong> &gt; 768px</li>
                  <li><strong>Tablet:</strong> &le; 768px</li>
                  <li><strong>Mobile:</strong> &le; 480px</li>
                </ul>
              </div>

              <button 
                className="nb-btn nb-btn-primary"
                style={{ width: '100%' }}
                onClick={() => setIsVisible(false)}
              >
                GOT IT!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}