import { FullConfig } from '../types/config';
import { GraphResponse, AnalysisResponse } from '../types/api';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    // Try to extract the backend's error message
    try {
      const body = await res.json();
      if (body?.message) throw new Error(body.message);
    } catch (e) {
      if (e instanceof Error && e.message && e.message !== 'Unexpected end of JSON input') throw e;
    }
    throw new Error(`API Error: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  graph: {
    random: (data: { num_nodes: number; num_edges: number | null; num_agents: number; num_destinations: number }) =>
      fetchJson<GraphResponse>('/graph/random', { method: 'POST', body: JSON.stringify(data) }),
    build: (data: { num_nodes: number; edges: [number, number][]; ownership: Record<string, number>; destinations: Record<string, number[]>; starting_positions: Record<string, number> }) =>
      fetchJson<GraphResponse>('/graph/build', { method: 'POST', body: JSON.stringify(data) }),
    syncLayout: (layout: Record<string, [number, number]>) =>
      fetchJson<{ status: "ok" }>('/graph/sync-layout', { method: 'POST', body: JSON.stringify({ layout }) }),
  },

  config: {
    get: () => fetchJson<FullConfig>('/config'),
    update: (data: { agent?: Partial<FullConfig['agent']>; train?: Partial<FullConfig['train']>; network?: Partial<FullConfig['network']>; log?: Partial<FullConfig['log']> }) =>
      fetchJson<{ status: "ok"; config: FullConfig }>('/config', { method: 'POST', body: JSON.stringify(data) }),
  },

  train: {
    start: () => fetchJson<{ status: "ok"; message: string }>('/train/start', { method: 'POST' }),
    stop: () => fetchJson<{ status: "ok" }>('/train/stop', { method: 'POST' }),
    pause: () => fetchJson<{ status: "ok"; paused: true }>('/train/pause', { method: 'POST' }),
    resume: () => fetchJson<{ status: "ok"; paused: false }>('/train/resume', { method: 'POST' }),
  },

  simulate: {
    start: () => fetchJson<{ status: "ok"; message: string }>('/simulate/start', { method: 'POST' }),
  },

  analyze: {
    compute: (data: any) =>
      fetchJson<AnalysisResponse>('/analyze/compute', { method: 'POST', body: JSON.stringify(data) }),
  },

  status: () => fetchJson<{ training: boolean; paused: boolean; has_graph: boolean }>('/status'),

  export: {
    /** Triggers a ZIP download of the latest episode data (SQLite + CSVs). */
    downloadData: async () => {
      const res = await fetch('/api/export/data');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'graphopoly_data.zip';
      a.click();
      URL.revokeObjectURL(url);
    },
  },
};
