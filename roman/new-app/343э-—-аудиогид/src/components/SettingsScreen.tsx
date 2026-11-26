import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Compass,
  Map as MapIcon,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  APP_VERSION,
  DEFAULT_CLOUD_BASE_URL,
  STOPS_343E,
  resolveCloudAudioUrl,
} from '../data/route343e';
import { PWAInstallButton } from './PWAInstallButton';

export type ThemePreference = 'light' | 'dark' | 'system';

interface SettingsScreenProps {
  triggerRadiusM: number;
  onChangeTriggerRadius: (value: number) => void;
  audioVolume: number;
  onChangeAudioVolume: (value: number) => void;
  themePreference: ThemePreference;
  onChangeTheme: (value: ThemePreference) => void;
  onResetExcursion: () => void;
  cloudBaseUrl: string;
  onChangeCloudBaseUrl: (value: string) => void;
  includeAudioSubfolder: boolean;
  onChangeIncludeAudioSubfolder: (value: boolean) => void;
  customUrls: Record<string, string>;
  onChangeCustomUrl: (stopName: string, url: string) => void;
  yandexApiKey: string;
  onChangeYandexApiKey: (value: string) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  triggerRadiusM,
  onChangeTriggerRadius,
  audioVolume,
  onChangeAudioVolume,
  themePreference,
  onChangeTheme,
  onResetExcursion,
  cloudBaseUrl,
  onChangeCloudBaseUrl,
  includeAudioSubfolder,
  onChangeIncludeAudioSubfolder,
  customUrls,
  onChangeCustomUrl,
  yandexApiKey,
  onChangeYandexApiKey,
}) => {
  const [showIndividualUrls, setShowIndividualUrls] = useState(false);
  const [probeStatus, setProbeStatus] = useState<{
    type: 'idle' | 'loading' | 'ok' | 'error';
    message?: string;
  }>({ type: 'idle' });

  const sampleUrl = resolveCloudAudioUrl(
    STOPS_343E[0],
    cloudBaseUrl,
    includeAudioSubfolder,
    customUrls
  );

  const testCloudConnection = async () => {
    if (!sampleUrl) {
      setProbeStatus({
        type: 'error',
        message: 'Сначала укажите базовый URL облака или ссылку для первой остановки.',
      });
      return;
    }

    setProbeStatus({ type: 'loading', message: 'Проверяем доступность файла...' });

    try {
      const response = await fetch(sampleUrl, { method: 'HEAD' });
      if (response.ok) {
        setProbeStatus({
          type: 'ok',
          message: `Файл доступен (HTTP ${response.status}). Можно запускать экскурсию.`,
        });
      } else {
        setProbeStatus({
          type: 'error',
          message: `Сервер ответил кодом HTTP ${response.status}. Проверьте путь и публичный доступ.`,
        });
      }
    } catch {
      // Fallback: test via Audio element metadata in case CORS blocks fetch HEAD
      const testAudio = new Audio();
      testAudio.preload = 'metadata';
      const resolved = await new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 6000);
        testAudio.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          resolve(true);
        };
        testAudio.onerror = () => {
          window.clearTimeout(timeout);
          resolve(false);
        };
        testAudio.src = sampleUrl;
      });

      if (resolved) {
        setProbeStatus({
          type: 'ok',
          message: 'Аудиопоток загружается (CORS для HEAD ограничен, но плеер играет).',
        });
      } else {
        setProbeStatus({
          type: 'error',
          message: 'Не удалось загрузить MP3 по указанной ссылке. Проверьте URL и HTTPS.',
        });
      }
    }
  };

  const volumePercent = Math.round(audioVolume * 100);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Настройки
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Привязка облачного аудио, параметры GPS-срабатывания и установка на телефон
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Облачное хранилище аудио
            </h2>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            По умолчанию подключён ваш репозиторий GitHub (<span className="font-mono">s-smk17/project-343/fedor_andrey</span>). Вы можете указать любой другой HTTPS-адрес или проверить связь.
          </p>

          <div className="space-y-2">
            <label
              htmlFor="cloud-base-url"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Базовый URL облака
            </label>
            <input
              id="cloud-base-url"
              type="url"
              placeholder={DEFAULT_CLOUD_BASE_URL}
              value={cloudBaseUrl}
              onChange={(e) => onChangeCloudBaseUrl(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAudioSubfolder}
              onChange={(e) => onChangeIncludeAudioSubfolder(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-700"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300">
              Добавлять подпапку <span className="font-mono">audio/</span> в путь
            </span>
          </label>

          {sampleUrl && (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs text-slate-600 dark:text-slate-300 break-all">
              <span className="text-slate-500 dark:text-slate-400">Пример ссылки: </span>
              <span className="font-mono">{sampleUrl}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void testCloudConnection()}
              disabled={probeStatus.type === 'loading'}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {probeStatus.type === 'loading' ? 'Проверка...' : 'Проверить доступ к 08.mp3'}
            </button>

            {cloudBaseUrl !== DEFAULT_CLOUD_BASE_URL && (
              <button
                type="button"
                onClick={() => {
                  onChangeCloudBaseUrl(DEFAULT_CLOUD_BASE_URL);
                  onChangeIncludeAudioSubfolder(false);
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Сбросить к GitHub
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowIndividualUrls((v) => !v)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Ссылки по остановкам</span>
              {showIndividualUrls ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          {probeStatus.type !== 'idle' && probeStatus.message && (
            <div
              className={`rounded-xl p-3 text-xs flex items-start gap-2 ${
                probeStatus.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50'
                  : probeStatus.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 border border-rose-200 dark:border-rose-900/50'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {probeStatus.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>{probeStatus.message}</span>
            </div>
          )}

          {showIndividualUrls && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {STOPS_343E.map((stop) => (
                <div key={stop.name} className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span className="font-mono text-slate-500">{stop.trackCode}</span> · {stop.name}
                  </label>
                  <input
                    type="url"
                    placeholder={
                      cloudBaseUrl
                        ? resolveCloudAudioUrl(stop, cloudBaseUrl, includeAudioSubfolder, {})
                        : `https://.../audio/${stop.trackCode}.mp3`
                    }
                    value={customUrls[stop.name] ?? ''}
                    onChange={(e) => onChangeCustomUrl(stop.name, e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Compass className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Радиус срабатывания GPS
                </h2>
              </div>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {triggerRadiusM} м
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Расстояние до остановки, при входе в которое автоматически запускается аудиорассказ.
            </p>
            <div>
              <input
                type="range"
                aria-label="Радиус срабатывания GPS"
                min={15}
                max={50}
                step={5}
                value={triggerRadiusM}
                onChange={(e) => onChangeTriggerRadius(Number(e.target.value))}
                className="w-full h-2 accent-blue-700 cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-xs font-mono tabular-nums text-slate-400">
                <span>15 м</span>
                <span>50 м</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Громкость аудио
                </h2>
              </div>
              <span className="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {volumePercent}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="range"
                aria-label="Громкость аудио"
                min={0}
                max={100}
                step={5}
                value={volumePercent}
                onChange={(e) => onChangeAudioVolume(Number(e.target.value) / 100)}
                className="flex-1 h-2 accent-blue-700 cursor-pointer"
              />
              <Volume2 className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  const Ctx =
                    window.AudioContext ||
                    (window as unknown as { webkitAudioContext: typeof AudioContext })
                      .webkitAudioContext;
                  if (!Ctx) return;
                  const ctx = new Ctx();
                  const gain = ctx.createGain();
                  gain.gain.value = Math.max(0.1, audioVolume * 0.25);
                  gain.connect(ctx.destination);

                  const osc1 = ctx.createOscillator();
                  osc1.type = 'sine';
                  osc1.frequency.setValueAtTime(440, ctx.currentTime);
                  osc1.frequency.setValueAtTime(587.33, ctx.currentTime + 0.14);
                  osc1.connect(gain);
                  osc1.start();
                  osc1.stop(ctx.currentTime + 0.32);
                  osc1.onended = () => void ctx.close();
                } catch {
                  // ignore
                }
              }}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Тест звука (сигнал)
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <MapIcon className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Тайлы карты (опционально)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              По умолчанию используется OpenStreetMap. Если у вас есть ключ Яндекс Tiles API, укажите его ниже.
            </p>
            <input
              type="text"
              placeholder="YANDEX_TILES_API_KEY (необязательно)"
              value={yandexApiKey}
              onChange={(e) => onChangeYandexApiKey(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Экскурсия и оформление
            </h2>

            <button
              type="button"
              onClick={onResetExcursion}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Сбросить экскурсию</span>
            </button>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Тема оформления</p>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'light', label: 'Светлая' },
                    { id: 'dark', label: 'Тёмная' },
                    { id: 'system', label: 'Системная' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTheme(item.id)}
                    className={`min-h-[40px] rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      themePreference === item.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Установка PWA на экран телефона заменяет APK для тестирования в Chrome на Android.
              </p>
              <PWAInstallButton showManualHint />
            </div>

            <p className="text-xs text-slate-400 text-center pt-1">
              Аудиогид 343Э · Версия {APP_VERSION}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
