import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Map as MapIcon, Settings, X } from 'lucide-react';
import { AudioScreen } from './components/AudioScreen';
import { MapScreen } from './components/MapScreen';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { SettingsScreen, ThemePreference } from './components/SettingsScreen';
import {
  AudioStop,
  DEFAULT_AUDIO_VOLUME,
  DEFAULT_CLOUD_BASE_URL,
  DEFAULT_TRIGGER_RADIUS_M,
  STOPS_343E,
  haversine,
  resolveCloudAudioUrl,
} from './data/route343e';

type TabKey = 'map' | 'audio' | 'settings';

const STORAGE_KEYS = {
  radius: 'audio_guide_343e.trigger_radius_m',
  volume: 'audio_guide_343e.v2.audio_volume',
  gain: 'audio_guide_343e.v2.audio_gain',
  theme: 'audio_guide_343e.theme',
  cloudBaseUrl: 'audio_guide_343e.v2.cloud_base_url',
  includeSubfolder: 'audio_guide_343e.v2.include_audio_subfolder',
  customUrls: 'audio_guide_343e.custom_urls',
  yandexKey: 'audio_guide_343e.yandex_tiles_api_key',
  positionPrefix: 'audio_guide_343e.position.',
};

function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  } catch {
    return fallback;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');

  // Settings state
  const [triggerRadiusM, setTriggerRadiusM] = useState<number>(() =>
    readNumber(STORAGE_KEYS.radius, DEFAULT_TRIGGER_RADIUS_M, 15, 50)
  );
  const [audioVolume, setAudioVolume] = useState<number>(() =>
    readNumber(STORAGE_KEYS.volume, DEFAULT_AUDIO_VOLUME, 0, 1)
  );
  const [audioGain, setAudioGain] = useState<number>(() =>
    readNumber(STORAGE_KEYS.gain, 3.5, 1, 6)
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // ignore
    }
    return 'system';
  });
  const [cloudBaseUrl, setCloudBaseUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.cloudBaseUrl);
      return saved !== null && saved.trim() !== '' ? saved : DEFAULT_CLOUD_BASE_URL;
    } catch {
      return DEFAULT_CLOUD_BASE_URL;
    }
  });
  const [includeAudioSubfolder, setIncludeAudioSubfolder] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.includeSubfolder);
      return raw === null ? false : raw === 'true';
    } catch {
      return false;
    }
  });
  const [customUrls, setCustomUrls] = useState<Record<string, string>>(() =>
    readJson<Record<string, string>>(STORAGE_KEYS.customUrls, {})
  );
  const [yandexApiKey, setYandexApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.yandexKey) ?? '';
    } catch {
      return '';
    }
  });

  // Audio state & Dual Engine (Pure Web Audio PCM + Direct HTML5 fallback)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const decodedCacheRef = useRef<Record<string, AudioBuffer>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const activeBufferRef = useRef<AudioBuffer | null>(null);
  const activeModeRef = useRef<'webaudio' | 'html5'>('webaudio');
  const startTimeRef = useRef<number>(0);
  const offsetSecRef = useRef<number>(0);
  const ignoreEndedRef = useRef<boolean>(false);
  const playSessionRef = useRef<number>(0);

  const [playbackMode, setPlaybackMode] = useState<'webaudio' | 'html5'>('webaudio');
  const [audioCtxState, setAudioCtxState] = useState<'idle' | 'running' | 'suspended'>('idle');
  const [signalLevel, setSignalLevel] = useState(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentStopName, setCurrentStopName] = useState<string | null>(null);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [audioPositionsMs, setAudioPositionsMs] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    STOPS_343E.forEach((stop) => {
      initial[stop.name] = readNumber(
        `${STORAGE_KEYS.positionPrefix}${stop.name}`,
        0,
        0,
        86400000
      );
    });
    return initial;
  });
  const [audioDurationsMs, setAudioDurationsMs] = useState<Record<string, number>>({});

  // GPS & Excursion state
  const watchIdRef = useRef<number | null>(null);
  const smoothPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const triggeredRef = useRef<Record<string, boolean>>({});
  const [triggeredStops, setTriggeredStops] = useState<Record<string, boolean>>({});
  const [isTracking, setIsTracking] = useState(false);
  const [followBus, setFollowBus] = useState(false);
  const [rawPosition, setRawPosition] = useState<{
    lat: number;
    lon: number;
    speed: number | null;
  } | null>(null);
  const [smoothPosition, setSmoothPosition] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState('Экскурсия не запущена');
  const [lastStopName, setLastStopName] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Refs for latest state inside audio/geolocation listeners
  const currentStopRef = useRef<string | null>(null);
  currentStopRef.current = currentStopName;

  const triggerRadiusRef = useRef(triggerRadiusM);
  triggerRadiusRef.current = triggerRadiusM;

  const cloudBaseUrlRef = useRef(cloudBaseUrl);
  cloudBaseUrlRef.current = cloudBaseUrl;

  const includeSubfolderRef = useRef(includeAudioSubfolder);
  includeSubfolderRef.current = includeAudioSubfolder;

  const customUrlsRef = useRef(customUrls);
  customUrlsRef.current = customUrls;

  // Apply light/dark theme to <html>
  useEffect(() => {
    const applyTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldBeDark =
        themePreference === 'dark' || (themePreference === 'system' && prefersDark);
      document.documentElement.classList.toggle('dark', shouldBeDark);
    };

    applyTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [themePreference]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.radius, String(triggerRadiusM));
    } catch {
      // ignore
    }
  }, [triggerRadiusM]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.volume, String(audioVolume));
    } catch {
      // ignore
    }
    if (audioRef.current) {
      audioRef.current.volume = audioVolume;
      audioRef.current.muted = audioVolume === 0;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = audioVolume * audioGain;
    }
  }, [audioVolume, audioGain]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.gain, String(audioGain));
    } catch {
      // ignore
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = audioVolume * audioGain;
    }
  }, [audioGain, audioVolume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, themePreference);
    } catch {
      // ignore
    }
  }, [themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.cloudBaseUrl, cloudBaseUrl);
    } catch {
      // ignore
    }
  }, [cloudBaseUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.includeSubfolder, String(includeAudioSubfolder));
    } catch {
      // ignore
    }
  }, [includeAudioSubfolder]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.customUrls, JSON.stringify(customUrls));
    } catch {
      // ignore
    }
  }, [customUrls]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.yandexKey, yandexApiKey);
    } catch {
      // ignore
    }
  }, [yandexApiKey]);

  const savePosition = useCallback((stopName: string, posMs: number) => {
    const clamped = Math.max(0, Math.floor(posMs));
    try {
      localStorage.setItem(`${STORAGE_KEYS.positionPrefix}${stopName}`, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext | null> => {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;

      if (!gainNodeRef.current) {
        const gain = ctx.createGain();
        gain.gain.value = audioVolume * audioGain;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;

        gain.connect(compressor);
        compressor.connect(analyser);
        analyser.connect(ctx.destination);

        gainNodeRef.current = gain;
        compressorNodeRef.current = compressor;
        analyserNodeRef.current = analyser;
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      setAudioCtxState(ctx.state === 'running' ? 'running' : 'suspended');
      return ctx;
    } catch (err) {
      console.warn('AudioContext unavailable:', err);
      return null;
    }
  }, [audioGain, audioVolume]);

  const stopWebAudioSource = useCallback(() => {
    const src = sourceNodeRef.current;
    if (src) {
      ignoreEndedRef.current = true;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }
  }, []);

  const startWebAudioBufferAt = useCallback(
    async (stopName: string, buffer: AudioBuffer, offsetSec: number) => {
      const ctx = await ensureAudioContext();
      if (!ctx || !gainNodeRef.current) return false;

      stopWebAudioSource();

      const clampedOffset = Math.max(0, Math.min(offsetSec, Math.max(0, buffer.duration - 0.05)));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodeRef.current);

      ignoreEndedRef.current = false;
      source.onended = () => {
        if (ignoreEndedRef.current) return;
        if (currentStopRef.current === stopName && activeModeRef.current === 'webaudio') {
          savePosition(stopName, 0);
          setAudioPositionsMs((prev) => ({ ...prev, [stopName]: 0 }));
          setCurrentStopName(null);
          setIsAudioPaused(false);
          setStatusMessage('Рассказ завершён');
        }
      };

      activeBufferRef.current = buffer;
      activeModeRef.current = 'webaudio';
      setPlaybackMode('webaudio');
      offsetSecRef.current = clampedOffset;
      startTimeRef.current = ctx.currentTime - clampedOffset;
      sourceNodeRef.current = source;
      source.start(0, clampedOffset);

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      setAudioCtxState(ctx.state === 'running' ? 'running' : 'suspended');
      return true;
    },
    [ensureAudioContext, savePosition, stopWebAudioSource]
  );

  // Track elapsed time while Web Audio buffer plays
  useEffect(() => {
    if (!currentStopName || isAudioPaused || playbackMode !== 'webaudio') return;

    const timer = window.setInterval(() => {
      const ctx = audioCtxRef.current;
      const buf = activeBufferRef.current;
      const activeName = currentStopRef.current;
      if (!ctx || !buf || !activeName || activeModeRef.current !== 'webaudio') return;
      const elapsedSec = Math.max(0, Math.min(ctx.currentTime - startTimeRef.current, buf.duration));
      offsetSecRef.current = elapsedSec;
      const ms = Math.floor(elapsedSec * 1000);
      setAudioPositionsMs((prev) => ({ ...prev, [activeName]: ms }));
      savePosition(activeName, ms);
    }, 250);

    return () => window.clearInterval(timer);
  }, [currentStopName, isAudioPaused, playbackMode, savePosition]);

  // Live audio output level meter when playing
  useEffect(() => {
    if (!currentStopName || isAudioPaused || playbackMode !== 'webaudio') {
      setSignalLevel(0);
      return;
    }

    let rafId = 0;
    const buffer = new Uint8Array(64);

    const tick = () => {
      const analyser = analyserNodeRef.current;
      if (analyser) {
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const deviation = Math.abs(buffer[i] - 128);
          if (deviation > peak) peak = deviation;
        }
        setSignalLevel(Math.min(100, Math.round((peak / 64) * 100)));
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [currentStopName, isAudioPaused, playbackMode]);

  // Attach listeners to fallback HTML5 <audio> element (no createMediaElementSource hijack)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = audioVolume;
    audio.muted = audioVolume === 0;

    const syncDuration = () => {
      const activeName = currentStopRef.current;
      if (
        activeModeRef.current !== 'html5' ||
        !activeName ||
        !Number.isFinite(audio.duration) ||
        audio.duration <= 0
      ) {
        return;
      }
      const durMs = Math.floor(audio.duration * 1000);
      setAudioDurationsMs((prev) =>
        prev[activeName] === durMs ? prev : { ...prev, [activeName]: durMs }
      );
    };

    const onTimeUpdate = () => {
      const activeName = currentStopRef.current;
      if (activeModeRef.current !== 'html5' || !activeName) return;
      const ms = Math.floor(audio.currentTime * 1000);
      setAudioPositionsMs((prev) => ({ ...prev, [activeName]: ms }));
      savePosition(activeName, ms);
      syncDuration();
    };

    const onPlay = () => {
      if (activeModeRef.current === 'html5') {
        setIsAudioPaused(false);
      }
    };

    const onPause = () => {
      if (activeModeRef.current === 'html5' && currentStopRef.current) {
        setIsAudioPaused(true);
      }
    };

    const onEnded = () => {
      if (activeModeRef.current !== 'html5') return;
      const activeName = currentStopRef.current;
      if (activeName) {
        savePosition(activeName, 0);
        setAudioPositionsMs((prev) => ({ ...prev, [activeName]: 0 }));
      }
      setCurrentStopName(null);
      setIsAudioPaused(false);
      setStatusMessage('Рассказ завершён');
    };

    const onError = () => {
      if (activeModeRef.current !== 'html5' || !audio.getAttribute('src')) return;
      const activeName = currentStopRef.current;
      const errCode = audio.error?.code;
      setCurrentStopName(null);
      setIsAudioPaused(false);
      setErrorBanner(
        activeName
          ? `Не удалось загрузить аудио для «${activeName}»${errCode ? ` (код ${errCode})` : ''}.`
          : 'Ошибка воспроизведения аудио.'
      );
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('canplay', syncDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('canplay', syncDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [savePosition]);

  const stopAllAudio = useCallback(() => {
    playSessionRef.current += 1;
    const activeName = currentStopRef.current;

    if (activeModeRef.current === 'webaudio') {
      if (activeName && audioCtxRef.current && !isAudioPaused) {
        const elapsedMs = Math.floor(
          Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * 1000
        );
        savePosition(activeName, elapsedMs);
      }
      stopWebAudioSource();
      activeBufferRef.current = null;
    }

    const audio = audioRef.current;
    if (audio) {
      if (activeModeRef.current === 'html5' && activeName) {
        savePosition(activeName, Math.floor(audio.currentTime * 1000));
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    if (activeName) {
      setStatusMessage(`Остановлено: ${activeName}`);
    }
    setCurrentStopName(null);
    setIsAudioPaused(false);
    setIsLoadingAudio(false);
  }, [isAudioPaused, savePosition, stopWebAudioSource]);

  const playHtml5Fallback = useCallback(
    async (stop: AudioStop, url: string, savedMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      activeModeRef.current = 'html5';
      setPlaybackMode('html5');
      audio.src = url;
      audio.muted = audioVolume === 0;
      audio.volume = audioVolume;

      const seekToSaved = () => {
        if (savedMs > 0 && Number.isFinite(audio.duration) && savedMs < audio.duration * 1000) {
          audio.currentTime = savedMs / 1000;
        }
      };

      if (audio.readyState >= 1) {
        seekToSaved();
      } else {
        audio.addEventListener('loadedmetadata', seekToSaved, { once: true });
      }

      try {
        await audio.play();
        setStatusMessage(`Сейчас играет: ${stop.name}`);
      } catch (err) {
        setIsAudioPaused(true);
        setErrorBanner(
          `Браузер заблокировал автозапуск для «${stop.name}». Нажмите «Слушать» вручную.`
        );
        console.warn('HTML5 fallback play rejected:', err);
      }
    },
    [audioVolume]
  );

  const playOrToggleAudio = useCallback(
    async (stop: AudioStop) => {
      setErrorBanner(null);
      const ctx = await ensureAudioContext();

      // Toggle pause/resume on the currently active stop
      if (currentStopRef.current === stop.name) {
        if (activeModeRef.current === 'webaudio' && activeBufferRef.current && ctx) {
          if (isAudioPaused) {
            const started = await startWebAudioBufferAt(
              stop.name,
              activeBufferRef.current,
              offsetSecRef.current
            );
            if (started) {
              setIsAudioPaused(false);
              setStatusMessage(`Сейчас играет: ${stop.name}`);
            }
          } else {
            const elapsedSec = Math.max(
              0,
              Math.min(ctx.currentTime - startTimeRef.current, activeBufferRef.current.duration)
            );
            offsetSecRef.current = elapsedSec;
            savePosition(stop.name, Math.floor(elapsedSec * 1000));
            stopWebAudioSource();
            setIsAudioPaused(true);
            setStatusMessage(`Пауза: ${stop.name}`);
          }
          return;
        }

        const audio = audioRef.current;
        if (audio) {
          if (audio.paused) {
            try {
              audio.muted = audioVolume === 0;
              audio.volume = audioVolume;
              await audio.play();
              setIsAudioPaused(false);
              setStatusMessage(`Сейчас играет: ${stop.name}`);
            } catch (err) {
              setErrorBanner(
                `Не удалось продолжить «${stop.name}»: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            }
          } else {
            audio.pause();
            savePosition(stop.name, Math.floor(audio.currentTime * 1000));
            setIsAudioPaused(true);
            setStatusMessage(`Пауза: ${stop.name}`);
          }
        }
        return;
      }

      // Stop previous playback cleanly
      if (currentStopRef.current) {
        const prevName = currentStopRef.current;
        if (activeModeRef.current === 'webaudio' && audioCtxRef.current && !isAudioPaused) {
          savePosition(
            prevName,
            Math.floor(Math.max(0, audioCtxRef.current.currentTime - startTimeRef.current) * 1000)
          );
        }
        stopWebAudioSource();
        if (audioRef.current) {
          if (activeModeRef.current === 'html5') {
            savePosition(prevName, Math.floor(audioRef.current.currentTime * 1000));
          }
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
        }
      }

      const url = resolveCloudAudioUrl(
        stop,
        cloudBaseUrlRef.current,
        includeSubfolderRef.current,
        customUrlsRef.current
      );

      if (!url) {
        setErrorBanner(
          `Для «${stop.name}» не указана ссылка на облачный MP3. Настройте URL в разделе «Настройки».`
        );
        return;
      }

      const sessionId = ++playSessionRef.current;
      const savedMs = readNumber(`${STORAGE_KEYS.positionPrefix}${stop.name}`, 0, 0, 86400000);

      setCurrentStopName(stop.name);
      currentStopRef.current = stop.name;
      setIsAudioPaused(false);
      setIsLoadingAudio(true);
      setStatusMessage(`Загружаем: ${stop.name}…`);

      try {
        if (!ctx) throw new Error('Web Audio API unavailable');

        let buffer = decodedCacheRef.current[url];
        if (!buffer) {
          const response = await fetch(url, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          buffer = await ctx.decodeAudioData(arrayBuffer);
          decodedCacheRef.current[url] = buffer;
        }

        if (playSessionRef.current !== sessionId) return;

        const durMs = Math.floor(buffer.duration * 1000);
        setAudioDurationsMs((prev) => ({ ...prev, [stop.name]: durMs }));

        const resumeMs = savedMs < durMs ? savedMs : 0;
        const ok = await startWebAudioBufferAt(stop.name, buffer, resumeMs / 1000);
        if (!ok) throw new Error('AudioContext start failed');

        setStatusMessage(`Сейчас играет: ${stop.name}`);
      } catch (webAudioErr) {
        if (playSessionRef.current !== sessionId) return;
        console.warn('Web Audio failed, falling back to HTML5 audio:', webAudioErr);
        await playHtml5Fallback(stop, url, savedMs);
      } finally {
        if (playSessionRef.current === sessionId) {
          setIsLoadingAudio(false);
        }
      }
    },
    [
      audioVolume,
      ensureAudioContext,
      isAudioPaused,
      playHtml5Fallback,
      savePosition,
      startWebAudioBufferAt,
      stopWebAudioSource,
    ]
  );

  const seekAudio = useCallback(
    (stopName: string, targetMs: number) => {
      if (currentStopRef.current !== stopName) return;
      const durationMs = audioDurationsMs[stopName] ?? 0;
      const clampedMs = Math.max(0, Math.min(targetMs, durationMs));

      if (activeModeRef.current === 'webaudio' && activeBufferRef.current) {
        offsetSecRef.current = clampedMs / 1000;
        setAudioPositionsMs((prev) => ({ ...prev, [stopName]: clampedMs }));
        savePosition(stopName, clampedMs);
        if (!isAudioPaused) {
          void startWebAudioBufferAt(stopName, activeBufferRef.current, clampedMs / 1000);
        }
        return;
      }

      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = clampedMs / 1000;
      setAudioPositionsMs((prev) => ({ ...prev, [stopName]: clampedMs }));
      savePosition(stopName, clampedMs);
    },
    [audioDurationsMs, isAudioPaused, savePosition, startWebAudioBufferAt]
  );

  const resetAudioPositions = useCallback(() => {
    const resetMap: Record<string, number> = {};
    STOPS_343E.forEach((stop) => {
      resetMap[stop.name] = 0;
      savePosition(stop.name, 0);
    });
    if (currentStopRef.current) {
      if (activeModeRef.current === 'webaudio' && activeBufferRef.current) {
        offsetSecRef.current = 0;
        if (!isAudioPaused) {
          void startWebAudioBufferAt(currentStopRef.current, activeBufferRef.current, 0);
        }
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    }
    setAudioPositionsMs(resetMap);
    setStatusMessage('Прогресс прослушивания сброшен');
  }, [isAudioPaused, savePosition, startWebAudioBufferAt]);

  const checkLocation = useCallback(
    (lat: number, lon: number, speed: number | null) => {
      const prevSmooth = smoothPosRef.current;
      const nextSmooth = prevSmooth
        ? {
            lat: prevSmooth.lat + 0.3 * (lat - prevSmooth.lat),
            lon: prevSmooth.lon + 0.3 * (lon - prevSmooth.lon),
          }
        : { lat, lon };

      smoothPosRef.current = nextSmooth;
      setSmoothPosition(nextSmooth);
      setRawPosition({ lat, lon, speed });

      const speedText = speed !== null ? `${(speed * 3.6).toFixed(1)} км/ч` : '—';
      setStatusMessage(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)} · Скорость: ${speedText}`);

      const radius = triggerRadiusRef.current;
      const nextTriggered = { ...triggeredRef.current };
      let changed = false;

      for (const stop of STOPS_343E) {
        const distance = haversine(lat, lon, stop.lat, stop.lon);
        if (distance > radius) {
          if (nextTriggered[stop.name]) {
            nextTriggered[stop.name] = false;
            changed = true;
          }
          continue;
        }
        if (nextTriggered[stop.name]) {
          continue;
        }
        nextTriggered[stop.name] = true;
        changed = true;
        setLastStopName(stop.name);
        void playOrToggleAudio(stop);
      }

      if (changed) {
        triggeredRef.current = nextTriggered;
        setTriggeredStops(nextTriggered);
      }
    },
    [playOrToggleAudio]
  );

  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setErrorBanner('Геолокация не поддерживается вашим браузером.');
      return;
    }
    if (watchIdRef.current !== null) return;

    setErrorBanner(null);
    void ensureAudioContext();
    setIsTracking(true);
    setFollowBus(true);
    setStatusMessage('Запускаем GPS… ожидание координат');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        checkLocation(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.speed ?? null
        );
      },
      (err) => {
        let msg = 'Не удалось получить координаты GPS.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Нет разрешения на геолокацию. Разрешите доступ в настройках браузера.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Сигнал GPS временно недоступен.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Превышено время ожидания сигнала GPS.';
        }
        setErrorBanner(msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );

    watchIdRef.current = watchId;
  }, [checkLocation]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setStatusMessage('GPS-отслеживание остановлено');
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const resetExcursion = useCallback(() => {
    stopAllAudio();
    triggeredRef.current = {};
    setTriggeredStops({});
    setLastStopName(null);
    setStatusMessage('Экскурсия сброшена. Остановки готовы к повторному запуску.');
  }, [stopAllAudio]);

  const simulateArrival = useCallback(
    (stop: AudioStop) => {
      // Ensure re-simulation works even if already triggered
      triggeredRef.current = { ...triggeredRef.current, [stop.name]: false };
      setFollowBus(true);
      checkLocation(stop.lat, stop.lon, 9.7);
    },
    [checkLocation]
  );

  const nearestStop = useMemo(() => {
    if (!rawPosition) return null;
    let best: { stop: AudioStop; distanceM: number } | null = null;
    for (const stop of STOPS_343E) {
      const distanceM = haversine(rawPosition.lat, rawPosition.lon, stop.lat, stop.lon);
      if (!best || distanceM < best.distanceM) {
        best = { stop, distanceM };
      }
    }
    return best;
  }, [rawPosition]);

  const navItems: Array<{ id: TabKey; label: string; icon: typeof MapIcon }> = [
    { id: 'map', label: 'Карта', icon: MapIcon },
    { id: 'audio', label: 'Аудио', icon: Headphones },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Desktop & Mobile Top Header (3-zone contract) */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            343Э — Аудиогид
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'text-blue-700 dark:text-blue-400 underline underline-offset-8 decoration-2'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10">
        {errorBanner && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 flex items-start justify-between gap-3 text-sm text-rose-900 dark:text-rose-100"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              aria-label="Скрыть предупреждение"
              className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'map' && (
          <MapScreen
            isTracking={isTracking}
            onStartTracking={startTracking}
            onStopTracking={stopTracking}
            onSimulateStop={simulateArrival}
            statusMessage={statusMessage}
            lastStopName={lastStopName}
            rawPosition={rawPosition}
            smoothPosition={smoothPosition}
            nearestStop={nearestStop}
            followBus={followBus}
            onToggleFollowBus={() => setFollowBus((v) => !v)}
            onDisableFollowBus={() => setFollowBus(false)}
            triggerRadiusM={triggerRadiusM}
            triggeredStops={triggeredStops}
            currentStopName={currentStopName}
            isAudioPaused={isAudioPaused}
            audioPositionsMs={audioPositionsMs}
            audioDurationsMs={audioDurationsMs}
            onPlayOrToggleAudio={(stop) => void playOrToggleAudio(stop)}
            onStopAudio={stopAllAudio}
            yandexApiKey={yandexApiKey}
            cloudBaseUrl={cloudBaseUrl}
            includeAudioSubfolder={includeAudioSubfolder}
            customUrls={customUrls}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'audio' && (
          <AudioScreen
            currentStopName={currentStopName}
            isAudioPaused={isAudioPaused}
            audioPositionsMs={audioPositionsMs}
            audioDurationsMs={audioDurationsMs}
            onPlayOrToggleAudio={(stop) => void playOrToggleAudio(stop)}
            onStopAudio={stopAllAudio}
            onSeekAudio={seekAudio}
            onResetAudioPositions={resetAudioPositions}
            cloudBaseUrl={cloudBaseUrl}
            includeAudioSubfolder={includeAudioSubfolder}
            customUrls={customUrls}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsScreen
            triggerRadiusM={triggerRadiusM}
            onChangeTriggerRadius={setTriggerRadiusM}
            audioVolume={audioVolume}
            onChangeAudioVolume={setAudioVolume}
            themePreference={themePreference}
            onChangeTheme={setThemePreference}
            onResetExcursion={resetExcursion}
            cloudBaseUrl={cloudBaseUrl}
            onChangeCloudBaseUrl={setCloudBaseUrl}
            includeAudioSubfolder={includeAudioSubfolder}
            onChangeIncludeAudioSubfolder={setIncludeAudioSubfolder}
            customUrls={customUrls}
            onChangeCustomUrl={(stopName, url) =>
              setCustomUrls((prev) => ({ ...prev, [stopName]: url }))
            }
            yandexApiKey={yandexApiKey}
            onChangeYandexApiKey={setYandexApiKey}
          />
        )}

        {/* Mounted native audio player with Web Audio loudness boost & signal meter */}
        <section
          className={
            currentStopName
              ? 'mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3'
              : 'sr-only'
          }
          aria-hidden={!currentStopName}
        >
          {currentStopName && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">
                  {isLoadingAudio ? `Загрузка: ${currentStopName}…` : `Плеер: ${currentStopName}`}
                </span>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  сигнал {signalLevel}%
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className="text-slate-400">Усиление:</span>
                {[1, 2.5, 3.5, 5].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setAudioGain(g);
                      void ensureAudioContext();
                    }}
                    className={`px-2 py-1 rounded-lg font-mono text-[11px] transition-colors cursor-pointer ${
                      audioGain === g
                        ? 'bg-blue-700 text-white font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    ×{g}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={async () => {
                    const ctx = await ensureAudioContext();
                    if (!ctx) return;
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    g.gain.value = 0.25;
                    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.14);
                    osc.connect(g);
                    g.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.3);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Тест тона
                </button>
                {audioCtxState === 'suspended' && (
                  <button
                    type="button"
                    onClick={() => void ensureAudioContext()}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold cursor-pointer"
                  >
                    Включить звук
                  </button>
                )}
                {audioVolume === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAudioVolume(1);
                      if (audioRef.current) {
                        audioRef.current.muted = false;
                        audioRef.current.volume = 1;
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-700 text-white font-semibold whitespace-nowrap cursor-pointer"
                  >
                    Громкость 100%
                  </button>
                )}
              </div>
            </div>
          )}
          <audio
            ref={audioRef}
            controls={Boolean(currentStopName) && playbackMode === 'html5'}
            preload="auto"
            playsInline
            className={playbackMode === 'html5' ? 'w-full h-10' : 'hidden'}
          />
          {currentStopName && !isAudioPaused && playbackMode === 'webaudio' && signalLevel > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Аудиопоток декодируется и передаётся на выход. Если не слышно — проверьте громкость устройства или не выключен ли звук вкладки.
            </p>
          )}
        </section>
      </main>

      {/* Mobile Bottom Tab Bar (<= 15% viewport cap) */}
      <nav
        aria-label="Основная навигация"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 items-center"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`h-full flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                isActive
                  ? 'text-blue-700 dark:text-blue-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <OfflineIndicator />
    </div>
  );
}
