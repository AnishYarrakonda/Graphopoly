import React from 'react';
import { useUIStore, UIMode } from '../../stores/uiStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { Button, GlassCard } from '../shared';
import { MousePointer2, CircleDashed, Spline, User, MapPin, Trash2 } from 'lucide-react';
import { useGraphStore } from '../../stores/graphStore';

export const GraphToolbar: React.FC = () => {
  const mode = useUIStore(s => s.mode);
  const setMode = useUIStore(s => s.setMode);
  const clearAll = useGraphStore(s => s.clearAll);
  const isTraining = useTrainingStore(s => s.isTraining);

  const tools: { m: UIMode; icon: React.ReactNode; label: string }[] = [
    { m: 'view', icon: <MousePointer2 size={16} />, label: 'SELECT' },
    { m: 'build_node', icon: <CircleDashed size={16} />, label: '+NODE' },
    { m: 'build_edge', icon: <Spline size={16} />, label: '+EDGE' },
    { m: 'build_owner', icon: <User size={16} />, label: 'OWNER' },
    { m: 'build_dest', icon: <MapPin size={16} />, label: 'DEST' },
  ];

  const handleClear = () => {
    if (isTraining) return;
    clearAll();
  };

  return (
    <GlassCard data-tour="toolbar" style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, padding: 8, flexDirection: 'row', gap: 6 }}>
      {tools.map(t => {
        // Disable build tools during training (view is always enabled for dragging)
        const disabled = isTraining && t.m !== 'view';
        return (
          <Button
            key={t.m}
            variant={mode === t.m ? 'primary' : 'default'}
            onClick={() => !disabled && setMode(t.m)}
            disabled={disabled}
            style={{ padding: '6px 10px', fontSize: '11px' }}
          >
            {t.icon} {t.label}
          </Button>
        );
      })}
      <div style={{ width: 1, background: 'var(--color-border)', margin: '0 4px' }} />
      <Button variant="danger" onClick={handleClear} disabled={isTraining} style={{ padding: '6px 10px', fontSize: '11px' }}>
        <Trash2 size={16} /> CLEAR
      </Button>
    </GlassCard>
  );
};
