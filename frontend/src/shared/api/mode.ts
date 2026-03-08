export type DataMode = 'local' | 'remote';

const RAW_DATA_MODE = (import.meta.env.VITE_DATA_MODE ?? 'local').toLowerCase();

export const DATA_MODE: DataMode = RAW_DATA_MODE === 'remote' ? 'remote' : 'local';

export function isLocalDataMode() {
  return DATA_MODE === 'local';
}
