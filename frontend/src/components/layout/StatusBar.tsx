import React from 'react';
import { useTrainingStore } from '../../stores/trainingStore';
import { useWebSocket } from '../../hooks/useWebSocket';

export const StatusBar: React.FC = () => {
  const { isTraining } = useTrainingStore();
  const wsStatus = useWebSocket();

  return (
    <footer style={{
      height: 28,
      borderTop: '1px solid rgba(255,255,255,0.04)',
      background: '#080808',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      justifyContent: 'space-between',
      fontSize: 10,
      color: 'rgba(255,255,255,0.25)',
      letterSpacing: '0.5px',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsStatus === 'connected' ? '#1de99b' : wsStatus === 'connecting' ? '#f5c518' : '#ff4f6b',
            boxShadow: wsStatus === 'connected' ? '0 0 6px #1de99b' : 'none',
          }} />
          {wsStatus}
        </div>

        {isTraining && (
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>
            Simulation running
          </span>
        )}
      </div>
      <span>graphopoly</span>
    </footer>
  );
};
