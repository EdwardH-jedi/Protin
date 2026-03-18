import { api } from './api';

export interface ConnectivityResult {
  ok: boolean;
  status?: string;
  version?: string;
  error?: string;
}

export async function checkStagingConnectivity(): Promise<ConnectivityResult> {
  try {
    const result = await api.get<{ status: string; version: string }>('/health');
    return { ok: result.status === 'ok', status: result.status, version: result.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
