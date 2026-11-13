import { useEffect, useState } from 'react';
import type { AppConfig } from '../../../../electron/shared/config';
import type { DesktopState, EditableSettings } from '../../../../electron/shared/contract';
import { Notice } from '../../../shared/ui/Notice/Notice';
import { PageHeader } from '../../../shared/ui/PageHeader/PageHeader';
import { SettingsSection } from '../../../shared/ui/SettingsSection/SettingsSection';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './SettingsPage.module.scss';

interface SettingsPageProps {
  state: DesktopState;
  busy: boolean;
  error: string;
  onSave: (settings: Partial<EditableSettings>) => void;
  onError: (message: string) => void;
}

export function SettingsPage({ state, busy, error, onSave, onError }: SettingsPageProps) {
  const [draft, setDraft] = useState<AppConfig>(state.config);
  const [regexText, setRegexText] = useState(JSON.stringify(state.config.REGEX_REPLACEMENTS ?? {}, null, 2));
  const [bansText, setBansText] = useState(state.config.BANS.join('\n'));
  const savedSettings = JSON.stringify({
    AUDIO_VOLUME: state.config.AUDIO_VOLUME,
    MESSAGE_COOLDOWN_MS: state.config.MESSAGE_COOLDOWN_MS,
    DEFAULT_MODEL_NAME: state.config.DEFAULT_MODEL_NAME,
    TTS_GENDERS: state.config.TTS_GENDERS,
    BANS: state.config.BANS,
    REGEX_REPLACEMENTS: state.config.REGEX_REPLACEMENTS,
    RVC_SETTINGS: state.config.RVC_SETTINGS,
  });

  useEffect(() => {
    setDraft(state.config);
    setRegexText(JSON.stringify(state.config.REGEX_REPLACEMENTS ?? {}, null, 2));
    setBansText(state.config.BANS.join('\n'));
  }, [savedSettings]);

  const setRvc = <K extends keyof AppConfig['RVC_SETTINGS']>(
    key: K,
    value: AppConfig['RVC_SETTINGS'][K],
  ) => {
    setDraft((current) => ({
      ...current,
      RVC_SETTINGS: { ...current.RVC_SETTINGS, [key]: value },
    }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let replacements: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(regexText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Нужен JSON-объект вида {"шаблон": "замена"}.');
      }
      if (Object.entries(parsed).some(([key, value]) => !key || typeof value !== 'string')) {
        throw new Error('Каждое правило должно иметь непустой regex и текстовую замену.');
      }
      replacements = parsed as Record<string, string>;
      for (const pattern of Object.keys(replacements)) new RegExp(pattern, 'gi');
    } catch (cause) {
      onError(`Проверьте правила замены: ${cause instanceof Error ? cause.message : String(cause)}`);
      return;
    }

    onSave({
      AUDIO_VOLUME: draft.AUDIO_VOLUME,
      MESSAGE_COOLDOWN_MS: draft.MESSAGE_COOLDOWN_MS,
      DEFAULT_MODEL_NAME: draft.DEFAULT_MODEL_NAME,
      TTS_GENDERS: draft.TTS_GENDERS,
      BANS: bansText
        .split(/\r?\n/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      REGEX_REPLACEMENTS: replacements,
      RVC_SETTINGS: draft.RVC_SETTINGS,
    });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="ПАРАМЕТРЫ ПРИЛОЖЕНИЯ"
        title="Настройки"
        description="Изменения применяются к следующим сообщениям и сохраняются локально."
      />
      {error && <Notice tone="error">{error}</Notice>}
      <form className={styles.form} onSubmit={submit}>
        <SettingsSection title="Озвучка" description="Основные параметры синтеза и воспроизведения.">
          <label className={styles.rangeField}>
            <span>
              <strong>Громкость</strong>
              <output>{Math.round(draft.AUDIO_VOLUME * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={draft.AUDIO_VOLUME}
              onChange={(event) =>
                setDraft((current) => ({ ...current, AUDIO_VOLUME: Number(event.target.value) }))
              }
            />
            <small>
              Управляет уровнем громкости готового WAV перед воспроизведением, отдельно от системной громкости Windows.
            </small>
          </label>
          <div className={styles.grid}>
            <label>
              Голос по умолчанию
              <select
                value={draft.DEFAULT_MODEL_NAME}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, DEFAULT_MODEL_NAME: event.target.value }))
                }
              >
                {[
                  ...state.voices.male,
                  ...state.voices.female,
                  ...state.voices.rhvoice.map((voice) => `RHVoice: ${voice}`),
                ].map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
                {draft.DEFAULT_MODEL_NAME &&
                  ![
                    ...state.voices.male,
                    ...state.voices.female,
                    ...state.voices.rhvoice.map((voice) => `RHVoice: ${voice}`),
                  ].includes(draft.DEFAULT_MODEL_NAME) && <option value={draft.DEFAULT_MODEL_NAME}>{draft.DEFAULT_MODEL_NAME}</option>}
              </select>
            </label>
            <label>
              Пауза между сообщениями (мс)
              <input
                type="number"
                min="0"
                step="100"
                value={draft.MESSAGE_COOLDOWN_MS ?? 0}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, MESSAGE_COOLDOWN_MS: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              RHVoice для мужской RVC-модели
              <select
                value={draft.TTS_GENDERS.male}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    TTS_GENDERS: { ...current.TTS_GENDERS, male: event.target.value },
                  }))
                }
              >
                {state.voices.rhvoice.map((voice) => <option key={voice}>{voice}</option>)}
              </select>
            </label>
            <label>
              RHVoice для женской RVC-модели
              <select
                value={draft.TTS_GENDERS.female}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    TTS_GENDERS: { ...current.TTS_GENDERS, female: event.target.value },
                  }))
                }
              >
                {state.voices.rhvoice.map((voice) => <option key={voice}>{voice}</option>)}
              </select>
            </label>
          </div>
        </SettingsSection>

        <SettingsSection title="RVC" description="Эти параметры меняют конвертацию RHVoice в выбранную нейромодель.">
          <div className={styles.grid}>
            <label>
              Сдвиг высоты тона
              <input
                type="number"
                min="-24"
                max="24"
                value={draft.RVC_SETTINGS.pitch}
                onChange={(event) => setRvc('pitch', Number(event.target.value))}
              />
            </label>
            <label>
              Сила индекса ({draft.RVC_SETTINGS.indexRate.toFixed(2)})
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={draft.RVC_SETTINGS.indexRate}
                onChange={(event) => setRvc('indexRate', Number(event.target.value))}
              />
            </label>
            <label>
              Сохранение огибающей ({draft.RVC_SETTINGS.volumeEnvelope.toFixed(2)})
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={draft.RVC_SETTINGS.volumeEnvelope}
                onChange={(event) => setRvc('volumeEnvelope', Number(event.target.value))}
              />
            </label>
            <label>
              Защита согласных ({draft.RVC_SETTINGS.protect.toFixed(2)})
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.01"
                value={draft.RVC_SETTINGS.protect}
                onChange={(event) => setRvc('protect', Number(event.target.value))}
              />
            </label>
            <label className={styles.checkField}>
              <input
                type="checkbox"
                checked={draft.RVC_SETTINGS.cleanAudio}
                onChange={(event) => setRvc('cleanAudio', event.target.checked)}
              />
              Очистка аудио от шума
            </label>
            <label>
              Сила очистки ({draft.RVC_SETTINGS.cleanStrength.toFixed(2)})
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={draft.RVC_SETTINGS.cleanStrength}
                onChange={(event) => setRvc('cleanStrength', Number(event.target.value))}
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Обработка сообщений"
          description="Фильтры применяются до передачи текста в синтезатор."
        >
          <div className={styles.grid}>
            <label>
              Игнорируемые пользователи (по одному на строку)
              <textarea rows={5} value={bansText} onChange={(event) => setBansText(event.target.value)} />
            </label>
            <label>
              Замены по regex (JSON)
              <textarea
                className={styles.code}
                rows={5}
                spellCheck={false}
                value={regexText}
                onChange={(event) => setRegexText(event.target.value)}
              />
            </label>
          </div>
        </SettingsSection>
        <div className={styles.footer}>
          <span>Конфигурация хранится в папке данных пользователя Windows.</span>
          <Button className={styles.save} disabled={busy} tone="primary" type="submit">
            {busy ? 'Сохраняю…' : 'Сохранить настройки'}
          </Button>
        </div>
      </form>
    </div>
  );
}
