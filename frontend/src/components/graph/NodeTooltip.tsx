import React from 'react';
import { GlassCard } from '../shared';

export const NodeTooltip: React.FC<{ x: number; y: number; title: string; children?: React.ReactNode }> = ({ x, y, title, children }) => {
  return (
    <GlassCard style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none', zIndex: 100, minWidth: 150, padding: 12 }}>
      <h4 className="text-hero" style={{ fontSize: 13, marginBottom: 4 }}>{title}</h4>
      {children}
    </GlassCard>
  );
};
