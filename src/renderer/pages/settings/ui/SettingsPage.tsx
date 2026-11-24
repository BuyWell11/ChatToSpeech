import { useEffect, useState } from 'react';
import type { AppConfig } from '../../../../electron/shared/config';
import type {
  DesktopState,
  EditableSettings,
  TwitchSettingsInput,
} from '../../../../electron/shared/contract';
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
  onSaveTwitch: (input: TwitchSettingsInput) => Promise<DesktopState | undefined>;
  onError: (message: string) => void;
}

export function SettingsPage({ state, busy, error, onSave, onSaveTwitch, onError }: SettingsPageProps) {
  const [draft, setDraft] = useState<AppConfig>(state.config);
  const [regexText, setRegexText] = useState(JSON.stringify(state.config.REGEX_REPLACEMENTS ?? {}, null, 2));
  const [bansText, setBansText] = useState(state.config.BANS.join('\n'));
  const [channelsText, setChannelsText] = useState(state.config.TWITCH_CHANNELS.join('\n'));
  const [twitchUsername, setTwitchUsername] = useState(state.config.TWITCH_USERNAME ?? '');
  const [oauthToken, setOauthToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const savedSettings = JSON.stringify({
    MESSAGE_COOLDOWN_MS: state.config.MESSAGE_COOLDOWN_MS,
    DEFAULT_MODEL_NAME: state.config.DEFAULT_MODEL_NAME,
    TTS_GENDERS: state.config.TTS_GENDERS,
    BANS: state.config.BANS,
    REGEX_REPLACEMENTS: state.config.REGEX_REPLACEMENTS,
    RVC_SETTINGS: state.config.RVC_SETTINGS,
  });
  const savedTwitchSettings = JSON.stringify({
    channels: state.config.TWITCH_CHANNELS,
    username: state.config.TWITCH_USERNAME,
    tokenConfigured: state.tokenConfigured,
  });

  useEffect(() => {
    setDraft(state.config);
    setRegexText(JSON.stringify(state.config.REGEX_REPLACEMENTS ?? {}, null, 2));
    setBansText(state.config.BANS.join('\n'));
    setChannelsText(state.config.TWITCH_CHANNELS.join('\n'));
    setTwitchUsername(state.config.TWITCH_USERNAME ?? '');
    setOauthToken('');
  }, [savedSettings, savedTwitchSettings]);

  const submitTwitch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const updated = await onSaveTwitch({
      channels: channelsText.split(/[\r\n,]+/).map((channel) => channel.trim()).filter(Boolean),
      username: twitchUsername,
      oauthToken,
    });
    if (updated) setOauthToken('');
  };

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
      <form className={styles.form} onSubmit={submitTwitch}>
        <SettingsSection title="Подключение Twitch" description="Изменения активного подключения применяются переподключением.">
          <div className={styles.grid}>
            <label>
              Каналы (по одному на строку)
              <textarea rows={3} value={channelsText} onChange={(event) => setChannelsText(event.target.value)} required />
            </label>
            <label>
              Twitch username бота
              <input
                autoComplete="username"
                maxLength={25}
                pattern="[A-Za-z0-9_]{1,25}"
                value={twitchUsername}
                onChange={(event) => setTwitchUsername(event.target.value)}
                required
              />
            </label>
            <label className={styles.tokenField}>
              OAuth-токен бота
              <span>
                <input
                  autoComplete="new-password"
                  placeholder={state.tokenConfigured ? 'Оставьте пустым, чтобы не менять сохранённый токен' : 'oauth:...'}
                  type={showToken ? 'text' : 'password'}
                  value={oauthToken}
                  onChange={(event) => setOauthToken(event.target.value)}
                  required={!state.tokenConfigured}
                />
                <Button onClick={() => setShowToken((visible) => !visible)} size="small" type="button">
                  {showToken ? 'Скрыть' : 'Показать'}
                </Button>
              </span>
            </label>
          </div>
          <div className={styles.footer}>
            <span>Сохранённый токен не показывается и хранится зашифрованным. Пустое поле оставляет его без изменений.</span>
            <Button disabled={busy} tone="primary" type="submit">Сохранить Twitch-настройки</Button>
          </div>
        </SettingsSection>
      </form>
      <form className={styles.form} onSubmit={submit}>
        <SettingsSection title="Озвучка" description="Основные параметры синтеза и воспроизведения.">
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
