import React from 'react';
import { useMagnetic } from '../../hooks/useMagnetic';


export const Header: React.FC = () => {
  const logoRef = useMagnetic<HTMLHeadingElement>();
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header style={{
      height: 64,
      display: 'flex',
      alignItems: 'center',
      padding: '0 48px',
      justifyContent: 'space-between',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      // Metallic gradient + heavy blur
      background: 'linear-gradient(180deg, rgba(30,30,30,0.7) 0%, rgba(18,18,18,0.85) 50%, rgba(10,10,10,0.95) 100%)',
      backdropFilter: 'blur(20px) saturate(1.2)',
      WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      // Subtle metallic sheen
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 8px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <h1
          ref={logoRef}
          onClick={scrollToTop}
          style={{
            fontSize: 15,
            fontWeight: 300,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#e8e8e8',
            fontFamily: "'Inter', sans-serif",
            cursor: 'pointer',
            transition: 'color 0.2s, transform 0.1s ease-out',
            margin: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#e8e8e8')}
        >
          GRAPHOPOLY
        </h1>
      </div>
    </header>
  );
};
