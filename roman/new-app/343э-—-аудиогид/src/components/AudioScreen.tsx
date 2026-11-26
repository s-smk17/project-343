import React, { useState } from 'react';
import { Headphones, Pause, Play, RotateCcw, SlidersHorizontal, Square } from 'lucide-react';
import {
  AudioStop,
  STOPS_343E,
  formatAudioTime,
  resolveCloudAudioUrl,
} from '../data/route343e';

interface AudioScreenProps {
  currentStopName: string | null;
  isAudioPaused: boolean;
  audioPositionsMs: Record<string, number>;
  audioDurationsMs: Record<string, number>;
  onPlayOrToggleAudio: (stop: AudioStop) => void;
  onStopAudio: () => void;
  onSeekAudio: (stopName: string, targetMs: number) => void;
  onResetAudioPositions: () => void;
  cloudBaseUrl: string;
  includeAudioSubfolder: boolean;
  customUrls: Record<string, string>;
  onOpenSettings: () => void;
}

export const AudioScreen: React.FC<AudioScreenProps> = ({
  currentStopName,
  isAudioPaused,
  audioPositionsMs,
  audioDurationsMs,
  onPlayOrToggleAudio,
  onStopAudio,
  onSeekAudio,
  onResetAudioPositions,
  cloudBaseUrl,
  includeAudioSubfolder,
  customUrls,
  onOpenSettings,
}) => {
  const [seekingState, setSeekingState] = useState<Record<string, number | null>>({});

  const hasAnyCloudUrl = STOPS_343E.some((s) =>
    Boolean(resolveCloudAudioUrl(s, cloudBaseUrl, includeAudioSubfolder, customUrls))
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
            Аудиотека
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {STOPS_343E.length} рассказов по остановкам · потоковое чтение из облака и автокэш
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentStopName && (
            <button
              type="button"
              onClick={onStopAudio}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Остановить</span>
            </button>
          )}
          <button
            type="button"
            onClick={onResetAudioPositions}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить прогресс</span>
          </button>
        </div>
      </div>

      {!hasAnyCloudUrl && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-amber-950 dark:text-amber-100">
            <p className="font-semibold">Аудиофайлы не привязаны к облаку</p>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
              Укажите базовый URL вашего облачного бакета или индивидуальные HTTPS-ссылки на MP3 в настройках.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Открыть настройки</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STOPS_343E.map((stop) => {
          const isCurrent = currentStopName === stop.name;
          const isPlaying = isCurrent && !isAudioPaused;
          const durationMs = audioDurationsMs[stop.name] ?? 0;
          const savedPositionMs = audioPositionsMs[stop.name] ?? 0;
          const previewPositionMs = seekingState[stop.name];
          const displayPositionMs =
            previewPositionMs !== undefined && previewPositionMs !== null
              ? previewPositionMs
              : savedPositionMs;

          const resolvedUrl = resolveCloudAudioUrl(
            stop,
            cloudBaseUrl,
            includeAudioSubfolder,
            customUrls
          );

          const seekDisabled = !isCurrent || durationMs <= 0;

          return (
            <article
              key={stop.name}
              className={`rounded-2xl border p-4 transition-colors ${
                isCurrent
                  ? 'border-blue-600/60 dark:border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    isCurrent
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Headphones className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">Ост. {stop.trackCode}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{resolvedUrl ? stop.audio : 'Нет URL'}</span>
                  </div>
                  <h2 className="mt-0.5 text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {stop.name}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => onPlayOrToggleAudio(stop)}
                  aria-label={isPlaying ? `Пауза: ${stop.name}` : `Воспроизвести: ${stop.name}`}
                  className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    isPlaying
                      ? 'bg-blue-700 text-white hover:bg-blue-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  aria-label={`Перемотка: ${stop.name}`}
                  min={0}
                  max={Math.max(durationMs, 1)}
                  value={durationMs > 0 ? Math.min(displayPositionMs, durationMs) : 0}
                  disabled={seekDisabled}
                  onInput={(e) => {
                    const value = Number((e.target as HTMLInputElement).value);
                    setSeekingState((prev) => ({ ...prev, [stop.name]: value }));
                  }}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setSeekingState((prev) => ({ ...prev, [stop.name]: null }));
                    onSeekAudio(stop.name, value);
                  }}
                  className="flex-1 h-2 accent-blue-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                />
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                  {formatAudioTime(displayPositionMs)} /{' '}
                  {durationMs > 0 ? formatAudioTime(durationMs) : '--:--'}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
