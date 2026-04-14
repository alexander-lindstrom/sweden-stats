import { useCallback, useMemo, useState } from 'react';
import type { KoladaDescriptorConfig } from '@/datasets/kolada/factory';
import { makeKoladaDescriptor } from '@/datasets/kolada/factory';
import type { DatasetDescriptor } from '@/datasets/types';

const STORAGE_KEY = 'kolada-pinned';

function loadConfigs(): KoladaDescriptorConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KoladaDescriptorConfig[]) : [];
  } catch {
    return [];
  }
}

function saveConfigs(configs: KoladaDescriptorConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

export interface PinnedKoladaState {
  configs:      KoladaDescriptorConfig[];
  descriptors:  DatasetDescriptor[];
  pinnedKpiIds: Set<string>;
  pin:          (cfg: KoladaDescriptorConfig) => void;
  unpin:        (kpiId: string) => void;
}

export function usePinnedKolada(): PinnedKoladaState {
  const [configs, setConfigs] = useState<KoladaDescriptorConfig[]>(loadConfigs);

  const pin = useCallback((cfg: KoladaDescriptorConfig) => {
    setConfigs(prev => {
      if (prev.some(c => c.kpiId === cfg.kpiId)) { return prev; }
      const next = [...prev, cfg];
      saveConfigs(next);
      return next;
    });
  }, []);

  const unpin = useCallback((kpiId: string) => {
    setConfigs(prev => {
      const next = prev.filter(c => c.kpiId !== kpiId);
      saveConfigs(next);
      return next;
    });
  }, []);

  const descriptors = useMemo(() => configs.map(makeKoladaDescriptor), [configs]);
  const pinnedKpiIds = useMemo(() => new Set(configs.map(c => c.kpiId)), [configs]);

  return { configs, descriptors, pinnedKpiIds, pin, unpin };
}
