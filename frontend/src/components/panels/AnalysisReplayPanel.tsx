import React, { useEffect, useCallback, useState } from 'react';
import { useReplayStore } from '../../stores/replayStore';
import { useTrainingStore } from '../../stores/trainingStore';
import { useAnalyzeStore } from '../../stores/analyzeStore';
import { useUIStore } from '../../stores/uiStore';
import { api } from '../../api/client';
import { Play, Pause, SkipBack, SkipForward, FastForward, Rewind, Download } from 'lucide-react';
import { RangeSlider, Button } from '../shared';
import { ChartNavigator } from '../charts/ChartNavigator';
import { ChartDisplay } from '../charts/ChartDisplay';
import { downloadAllCsvsAsZip } from '../../lib/csvExport';
import { AGENT_COLORS } from '../../lib/chartTheme';
import type { BuildParams } from '../../lib/chartRegistry';

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{
    fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)', marginBottom: 28, fontFamily: "'Inter', sans-serif",
  }}>
    {children}
  </h2>
);

export const AnalysisReplayPanel: React.FC = () => {
  const { episodeData, currentStep, totalSteps, isPlaying, play, pause, setStep, stepBack, stepForward, jumpBack, jumpForward } = useReplayStore();
  const { isTraining } = useTrainingStore();
  const { setAnalysisData, episodeData: analyzeEpisodeData, timeline } = useAnalyzeStore();
  const agentColors = useUIStore(s => s.agentColors);

  const [isComputing, setIsComputing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Auto-compute analysis timeline when episode data becomes available
  const computeTimeline = useCallback(async (data: typeof episodeData) => {
    if (!data) return;
    setIsComputing(true);
    try {
      const res = await api.analyze.compute(data);
      setAnalysisData(data, res.timeline);
    } catch (e) {
      console.error('Analysis computation failed:', e);
    } finally {
      setIsComputing(false);
    }
  }, [setAnalysisData]);

  useEffect(() => {
    if (episodeData && episodeData !== analyzeEpisodeData) {
      computeTimeline(episodeData);
    }
  }, [episodeData, analyzeEpisodeData, computeTimeline]);

  const handleDownloadAll = async () => {
    if (!analyzeEpisodeData || timeline.length === 0) return;
    setIsDownloading(true);
    try {
      const params: BuildParams = {
        timeline,
        currentStep,
        episodeData: analyzeEpisodeData,
        selectedAgents: [],
        selectedNodes: [],
        agentColors: agentColors.length > 0 ? agentColors : AGENT_COLORS,
      };
      await downloadAllCsvsAsZip(params);
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const hasCharts = timeline.length > 0;

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── REPLAY CONTROLS ────────────────────────────────────────── */}
      <div style={{ padding: '40px 64px 32px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <SectionTitle>Replay</SectionTitle>
        {episodeData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            {/* Slider */}
            <div style={{ width: '100%', maxWidth: 860 }}>
              <RangeSlider
                value={currentStep}
                min={0}
                max={totalSteps > 0 ? totalSteps - 1 : 0}
                onChange={setStep}
                label={`Step ${currentStep}`}
                formatValue={() => `/ ${totalSteps - 1}`}
              />
            </div>

            {/* Playback buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button style={{ padding: '10px 18px' }} onClick={() => jumpBack(10)}><Rewind size={17} /></Button>
              <Button style={{ padding: '10px 18px' }} onClick={stepBack}><SkipBack size={17} /></Button>
              {isPlaying ? (
                <Button onClick={pause} style={{ padding: '13px 26px', background: '#fff', color: '#000', borderColor: '#fff' }}>
                  <Pause size={20} />
                </Button>
              ) : (
                <Button onClick={play} style={{ padding: '13px 26px', background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
                  <Play size={20} />
                </Button>
              )}
              <Button style={{ padding: '10px 18px' }} onClick={stepForward}><SkipForward size={17} /></Button>
              <Button style={{ padding: '10px 18px' }} onClick={() => jumpForward(10)}><FastForward size={17} /></Button>

              {hasCharts && (
                <Button
                  onClick={handleDownloadAll}
                  disabled={isDownloading}
                  style={{ marginLeft: 16, color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '10px 18px', borderColor: 'rgba(255,255,255,0.15)' }}
                >
                  <Download size={15} style={{ marginRight: 8 }} />
                  {isDownloading ? 'Exporting...' : 'Download All CSVs'}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 15, lineHeight: 1.7 }}>
              {isTraining
                ? 'Simulation in progress. Stop to replay and analyze.'
                : 'Run a simulation to enable replay and analysis.'}
            </p>
          </div>
        )}
      </div>

      {/* ── ANALYSIS AREA ──────────────────────────────────────────── */}
      {isTraining ? (
        <div style={{ padding: '80px 48px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16, lineHeight: 1.8 }}>
            Stop the simulation to view analysis
          </p>
          <p style={{ color: 'rgba(255,255,255,0.12)', fontSize: 13, marginTop: 8 }}>
            Charts will populate once the simulation data is available
          </p>
        </div>
      ) : isComputing ? (
        <div style={{ padding: '80px 48px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>Computing analysis...</p>
        </div>
      ) : hasCharts ? (
        <div style={{ display: 'flex', minHeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <ChartNavigator />
          <ChartDisplay />
        </div>
      ) : (
        <div style={{ padding: '80px 48px', textAlign: 'center' }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, lineHeight: 1.8 }}>
            Run and stop a simulation to see analysis charts here.
          </p>
        </div>
      )}
    </div>
  );
};
