import React, { forwardRef } from 'react';
import { useMagnetic } from '../../hooks/useMagnetic';
import './shared.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'warning' | 'ghost';
  magnetic?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'default', magnetic = true, className = '', ...props }, forwardedRef) => {
  const magneticRef = useMagnetic<HTMLButtonElement>();
  
  // Use either the forwarded ref or the internal magnetic ref
  // If magnetic is true, we must use the magneticRef for the effect to work
  const finalRef = magnetic ? magneticRef : (forwardedRef as React.RefObject<HTMLButtonElement>);

  return (
    <button 
      ref={finalRef}
      className={`btn ${variant !== 'default' ? variant : ''} ${className}`} 
      style={{
        transition: 'transform 0.1s ease-out, background 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s',
        ...props.style
      }}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
