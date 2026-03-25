import React from 'react';
import { useTrainingStore } from '../../stores/trainingStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { HelpCircle } from 'lucide-react';

const LogoIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="4" cy="14" r="2.5" fill="var(--color-accent)" opacity="0.9" />
    <circle cx="16" cy="14" r="2.5" fill="var(--color-accent)" opacity="0.9" />
    <circle cx="10" cy="4" r="2.5" fill="var(--color-accent)" opacity="0.9" />
    <line x1="4" y1="14" x2="10" y2="4" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.5" />
    <line x1="16" y1="14" x2="10" y2="4" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.5" />
    <line x1="4" y1="14" x2="16" y2="14" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.5" />
  </svg>
);

export const Header: React.FC = () => {
  const { isTraining } = useTrainingStore();
  const wsStatus = useWebSocket();

  const statusColor = wsStatus === 'connected'
    ? 'var(--color-success)'
    : wsStatus === 'connecting'
    ? 'var(--color-warning)'
    : 'var(--color-danger)';

  const statusLabel = wsStatus === 'connected'
    ? 'Connected'
    : wsStatus === 'connecting'
    ? 'Connecting'
    : 'Disconnected';

  const handleHelpClick = () => {
    localStorage.removeItem('graphopoly_onboarded_v3');
    window.location.reload();
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-logo">
          <LogoIcon />
          <div className="header-logo-text">
            <span className="header-title">Graphopoly</span>
            <span className="header-subtitle">MARL Research Platform</span>
          </div>
        </div>

        <div className="header-pills">
          <div className="header-status-pill">
            <div
              className="header-status-dot"
              style={{
                background: statusColor,
                boxShadow: wsStatus === 'connected' ? `0 0 6px ${statusColor}` : 'none',
                animation: wsStatus === 'connecting' ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            {statusLabel}
          </div>

          {isTraining && (
            <div className="header-sim-pill">
              <div className="header-sim-dot" />
              Simulating
            </div>
          )}
        </div>
      </div>

      <button
        className="header-help-btn"
        onClick={handleHelpClick}
        title="Show onboarding tour"
      >
        <HelpCircle size={16} />
      </button>

      <style>{`
        .app-header {
          height: var(--header-h);
          display: flex;
          align-items: center;
          padding: 0 20px;
          justify-content: space-between;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: var(--color-bg-elevated);
          border-bottom: 1px solid var(--color-border-active);
          box-shadow: none;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .header-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .header-logo-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .header-title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.02em;
          background: linear-gradient(135deg, var(--color-text), var(--color-accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.2;
        }

        .header-subtitle {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text-muted);
          line-height: 1;
        }

        .header-pills {
          display: flex;
          gap: 8px;
        }

        .header-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--color-text-dim);
          border: 1px solid var(--color-border);
        }

        .header-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .header-sim-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: var(--color-accent-surface);
          border-radius: var(--radius-pill);
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-accent);
          border: 1px solid var(--color-accent-glow);
        }

        .header-sim-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-accent);
          animation: pulse 1.5s infinite;
          flex-shrink: 0;
        }

        .header-help-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-btn);
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text-dim);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .header-help-btn:hover {
          color: var(--color-text);
          border-color: var(--color-border-active);
          background: rgba(255, 255, 255, 0.03);
        }
      `}</style>
    </header>
  );
};
