import React from 'react';
import { useTrainingStore } from '../../stores/trainingStore';
import { useWebSocket } from '../../hooks/useWebSocket';

export const Header: React.FC = () => {
  const { isTraining } = useTrainingStore();
  const wsStatus = useWebSocket();

  const statusColor = wsStatus === 'connected' ? 'var(--color-success)' : wsStatus === 'connecting' ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <header style={{
      height: 'var(--header-h)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      justifyContent: 'space-between',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      background: 'var(--color-bg-elevated)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--color-border)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <h1 style={{
          fontSize: 14,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--color-text)',
          margin: 0,
        }}>
          GRAPHOPOLY
        </h1>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '20px',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--color-text-dim)',
            border: '1px solid var(--color-border)',
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
              boxShadow: wsStatus === 'connected' ? `0 0 8px ${statusColor}` : 'none',
            }} />
            {wsStatus.toUpperCase()}
          </div>

          {isTraining && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: 'var(--color-accent-glow)',
              borderRadius: '20px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-accent)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}>
              SIMULATION ACTIVE
            </div>
          )}
        </div>
      </div>
      
      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', fontWeight: 500, opacity: 0.5 }}>
        RESEARCH v2.0
      </div>
    </header>
  );
};
