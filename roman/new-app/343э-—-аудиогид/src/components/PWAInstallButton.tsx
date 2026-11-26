import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  showManualHint?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  showManualHint = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (!showManualHint) return null;
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Приложение уже установлено и запущено как отдельное приложение.
      </p>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 text-white font-medium transition-colors hover:bg-blue-800 active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-3.5 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px] w-full sm:w-auto'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Установить на телефон</span>
      </button>
    );
  }

  if (isIOS || showManualHint) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer ${
            compact ? 'px-3.5 py-2 text-xs min-h-[40px]' : 'px-4 py-2.5 text-sm min-h-[44px] w-full sm:w-auto'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>{isIOS ? 'Установить на iPhone' : 'Как установить на Android'}</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isIOS ? 'Установка на iPhone / iPad' : 'Установка на Android'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Закрыть"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {isIOS ? (
                <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
                  <li>Откройте эту страницу в Safari.</li>
                  <li>Нажмите кнопку «Поделиться» в нижней панели.</li>
                  <li>Выберите пункт «На экран «Домой»».</li>
                </ol>
              ) : (
                <ol className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
                  <li>Откройте страницу по внешней ссылке в Chrome на Android.</li>
                  <li>Нажмите меню Chrome (три точки в правом верхнем углу).</li>
                  <li>Выберите «Добавить на гл. экран» или «Установить приложение».</li>
                </ol>
              )}
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
