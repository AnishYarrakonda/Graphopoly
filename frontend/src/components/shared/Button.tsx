import React, { forwardRef } from 'react';
import { useMagnetic } from '../../hooks/useMagnetic';
import './shared.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'warning' | 'ghost' | 'secondary';
  magnetic?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'default', magnetic = false, className = '', ...props }, forwardedRef) => {
  const magneticRef = useMagnetic<HTMLButtonElement>();
  
  // By default magnetic is FALSE for a more professional feel.
  // We only enable it if explicitly requested.
  const finalRef = (magnetic && variant !== 'primary') ? magneticRef : (forwardedRef as React.RefObject<HTMLButtonElement>);

  return (
    <button 
      ref={finalRef}
      className={`btn ${variant !== 'default' ? variant : ''} ${className}`} 
      style={{
        ...props.style
      }}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';
