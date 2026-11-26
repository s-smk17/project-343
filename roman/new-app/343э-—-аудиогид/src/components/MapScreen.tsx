import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import {
  AudioStop,
  RoutePoint,
  STOPS_343E,
  formatAudioTime,
  resolveCloudAudioUrl,
} from '../data/route343e';
import { RouteMap } from './RouteMap';

interface MapScreenProps {
  isTracking: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onSimulateStop: (stop: AudioStop) => void;
  statusMessage: string;
  lastStopName: string | null;
  rawPosition: { lat: number; lon: number; speed: number | null } | null;
  smoothPosition: { lat: number; lon: number } | null;
  nearestStop: { stop: AudioStop; distanceM: number } | null;
  followBus: boolean;
  onToggleFollowBus: () => void;
  onDisableFollowBus: () => void;
  triggerRadiusM: number;
  triggeredStops: Record<string, boolean>;
  currentStopName: string | null;
  isAudioPaused: boolean;
  audioPositionsMs: Record<string, number>;
  audioDurationsMs: Record<string, number>;
  onPlayOrToggleAudio: (stop: AudioStop) => void;
  onStopAudio: () => void;
  yandexApiKey: string;
  cloudBaseUrl: string;
  includeAudioSubfolder: boolean;
  customUrls: Record<string, string>;
  onOpenSettings: () => void;
}

export const MapScreen: React.FC<MapScreenProps> = ({
  isTracking,
  onStartTracking,
  onStopTracking,
  onSimulateStop,
  statusMessage,
  lastStopName,
  rawPosition,
  smoothPosition,
  nearestStop,
  followBus,
  onToggleFollowBus,
  onDisableFollowBus,
  triggerRadiusM,
  triggeredStops,
  currentStopName,
  isAudioPaused,
  audioPositionsMs,
  audioDurationsMs,
  onPlayOrToggleAudio,
  onStopAudio,
  yandexApiKey,
  cloudBaseUrl,
  includeAudioSubfolder,
  customUrls,
  onOpenSettings,
}) => {
  const [selectedPoint, setSelectedPoint] = useState<RoutePoint | null>(null);
  const [simStopName, setSimStopName] = useState<string>(STOPS_343E[0].name);

  const hasAnyCloudUrl = STOPS_343E.some((s) =>
    Boolean(resolveCloudAudioUrl(s, cloudBaseUrl, includeAudioSubfolder, customUrls))
  );

  const currentAudioStop = currentStopName
    ? STOPS_343E.find((s) => s.name === currentStopName) ?? null
    : null;

  const selectedAudioStop = selectedPoint?.audio
    ? STOPS_343E.find((s) => s.name === selectedPoint.name) ?? null
    : null;

  const speedText =
    rawPosition?.speed != null ? `${(rawPosition.speed * 3.6).toFixed(1)} км/ч` : '—';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
            Маршрут 343Э
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Проспект Ветеранов · Стрельна · Петергоф · Ломоносов
          </p>
        </div>

        <button
          type="button"
          onClick={isTracking ? onStopTracking : onStartTracking}
          className={`min-h-[48px] px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer ${
            isTracking
              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
              : 'bg-blue-700 text-white hover:bg-blue-800'
          }`}
        >
          {isTracking ? (
            <>
              <Pause className="w-4 h-4 shrink-0" />
              <span>Остановить GPS</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 shrink-0" />
              <span>Начать экскурсию</span>
            </>
          )}
        </button>
      </div>

      {!hasAnyCloudUrl && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-amber-950 dark:text-amber-100">
            <p className="font-semibold">Укажите ссылку на облако с MP3</p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
              Чтобы аудио запускалось на остановках, задайте базовый URL облачного хранилища в настройках.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Настроить облако</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-3">
          <RouteMap
            userPosition={smoothPosition}
            followBus={followBus}
            onToggleFollowBus={onToggleFollowBus}
            onDisableFollowBus={onDisableFollowBus}
            triggerRadiusM={triggerRadiusM}
            triggeredStops={triggeredStops}
            currentStopName={currentStopName}
            yandexApiKey={yandexApiKey}
            onSelectStop={(point) => setSelectedPoint(point)}
          />

          {selectedPoint && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedAudioStop
                    ? `Остановка с аудио · ${selectedAudioStop.audio}`
                    : 'Остановка без аудиорассказа'}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {selectedPoint.name}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedAudioStop && (
                  <>
                    <button
                      type="button"
                      onClick={() => onPlayOrToggleAudio(selectedAudioStop)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {currentStopName === selectedAudioStop.name && !isAudioPaused ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Пауза</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Слушать</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSimulateStop(selectedAudioStop)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Тест GPS
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Состояние экскурсии
              </h2>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {isTracking ? 'GPS активен' : 'Ожидание'}
              </span>
            </div>

            <p className="text-sm text-slate-700 dark:text-slate-300">{statusMessage}</p>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Координаты</p>
                <p className="mt-0.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {rawPosition
                    ? `${rawPosition.lat.toFixed(5)}, ${rawPosition.lon.toFixed(5)}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Скорость</p>
                <p className="mt-0.5 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {speedText}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ближайшая запись</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {nearestStop ? nearestStop.stop.name : '—'}
                </p>
                {nearestStop && (
                  <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {Math.round(nearestStop.distanceM)} м · порог {triggerRadiusM} м
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Последняя остановка</p>
                <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {lastStopName ?? '—'}
                </p>
              </div>
            </div>
          </section>

          {currentAudioStop && (
            <section className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {isAudioPaused ? 'На паузе' : 'Сейчас играет'}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {currentAudioStop.name}
                  </p>
                </div>
                <Volume2 className="w-4 h-4 text-blue-700 dark:text-blue-300 shrink-0 mt-1" />
              </div>

              <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>{formatAudioTime(audioPositionsMs[currentAudioStop.name] ?? 0)}</span>
                <span>
                  {audioDurationsMs[currentAudioStop.name] > 0
                    ? formatAudioTime(audioDurationsMs[currentAudioStop.name])
                    : '--:--'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPlayOrToggleAudio(currentAudioStop)}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isAudioPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Продолжить</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Пауза</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onStopAudio}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Стоп</span>
                </button>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Проверка срабатывания GPS
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Симулирует прибытие на выбранную остановку, чтобы проверить автозапуск аудио без поездки по маршруту.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Выберите остановку для теста GPS"
                value={simStopName}
                onChange={(e) => setSimStopName(e.target.value)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {STOPS_343E.map((stop) => (
                  <option key={stop.name} value={stop.name}>
                    {stop.trackCode} · {stop.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const found = STOPS_343E.find((s) => s.name === simStopName);
                  if (found) onSimulateStop(found);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Симулировать вход
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
