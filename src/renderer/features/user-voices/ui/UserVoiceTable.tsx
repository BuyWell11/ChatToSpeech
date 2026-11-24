import { useMemo, useState } from 'react';
import type { DesktopState } from '../../../../electron/shared/contract';
import { Button } from '../../../shared/ui/Button/Button';
import styles from './UserVoiceTable.module.scss';

interface UserVoiceTableProps {
  state: DesktopState;
  busy: boolean;
  onSetVoice: (username: string, voice: string) => void;
  onOpenVoices: () => void;
  onRefreshVoices: () => void;
}

export function UserVoiceTable({ state, busy, onSetVoice, onOpenVoices, onRefreshVoices }: UserVoiceTableProps) {
  const [query, setQuery] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newVoice, setNewVoice] = useState('');
  const options = [
    ...state.voices.male,
    ...state.voices.female,
    ...state.voices.rhvoice.map((voice) => `RHVoice: ${voice}`),
  ];
  const filteredUsers = useMemo(
    () => state.users.filter(({ username }) => username.includes(query.trim().toLowerCase())),
    [query, state.users],
  );

  const addUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = newUsername.trim().toLowerCase();
    if (!username || !newVoice) return;
    onSetVoice(username, newVoice);
    setNewUsername('');
  };

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ПЕРСОНАЛЬНЫЕ ГОЛОСА</p>
          <h2>Пользователи чата</h2>
        </div>
        <div className={styles.headerActions}>
          <Button disabled={busy} onClick={onOpenVoices} size="small">Папка моделей</Button>
          <Button disabled={busy || state.engineStatus !== 'ready'} onClick={onRefreshVoices} size="small">
            Обновить модели
          </Button>
          <span className={styles.count}>{state.users.length}</span>
        </div>
      </header>
      {state.users.length === 0 ? (
        <div className={styles.empty}>
          <strong>Пока нет назначений</strong>
          <span>
            Пользователь появится здесь после команды <code>!voice имя</code> в чате или ручного добавления голоса.
          </span>
        </div>
      ) : (
        <>
        <label className={styles.search}>
          <span>Поиск пользователя</span>
          <input
            type="search"
            placeholder="Введите Twitch username"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.tableWrap}>
          {filteredUsers.length === 0 ? (
            <p className={styles.noResults}>Пользователи не найдены.</p>
          ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ПОЛЬЗОВАТЕЛЬ</th>
                <th>ГОЛОС</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(({ username, voice }) => (
                <tr key={username}>
                  <td>
                    <span className={styles.avatar}>{username.slice(0, 1).toUpperCase()}</span>
                    {username}
                  </td>
                  <td>
                    <select
                      aria-label={`Голос для ${username}`}
                      disabled={busy || options.length === 0}
                      value={voice}
                      onChange={(event) => onSetVoice(username, event.target.value)}
                    >
                      {!options.includes(voice) && <option value={voice}>{voice} (не найден)</option>}
                      <option value="">Голос по умолчанию</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option.startsWith('RHVoice: ') ? `${option} · напрямую` : option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        </>
      )}
      <form className={styles.addUser} onSubmit={addUser}>
        <label>
          Twitch username
          <input
            autoComplete="off"
            maxLength={25}
            pattern="[A-Za-z0-9_]{1,25}"
            placeholder="username"
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Голос
          <select value={newVoice} onChange={(event) => setNewVoice(event.target.value)} required>
            <option value="">Выберите голос</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <Button disabled={busy || options.length === 0} size="small" type="submit">Добавить</Button>
      </form>
      <p className={styles.footnote}>
        Голоса RHVoice озвучивают текст напрямую; RVC-модели дополнительно меняют тембр. После добавления модели
        положите её в папку male или female и нажмите «Обновить модели».
      </p>
    </section>
  );
}
