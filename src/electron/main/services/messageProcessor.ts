import type { AppConfig } from '../../shared/config';
import type { VoiceGroups } from '../../shared/contract';

export interface ProcessedResult {
  shouldQueue: boolean;
  text?: string;
  voice?: string;
  commandReply?: string;
}

export class MessageProcessor {
  private static readonly LINK_PATTERN = /https?:\/\/\S+|www\.\S+/gi;

  public static process(
    username: string,
    message: string,
    updateUserVoice: (user: string, voice: string) => void,
    config: AppConfig,
    availableVoices: VoiceGroups = { male: [], female: [], rhvoice: [] },
  ): ProcessedResult {
    const trimmed = message.trim();
    const lowerUser = username.toLowerCase();
    const commandPrefix = config.BOT_COMMAND_PREFIX ?? '!';

    if (config.BANS.some((entry) => entry.toLowerCase() === username.toLowerCase())) {
      return { shouldQueue: false };
    }

    const regexReplacements = config.REGEX_REPLACEMENTS ?? {};
    let processedText = trimmed;

    for (const [pattern, replacement] of Object.entries(regexReplacements)) {
      try {
        const regex = new RegExp(pattern, 'gi');
        processedText = processedText.replace(regex, replacement);
      } catch (error) {
        console.warn(`[MessageProcessor] Некорректный regex в REGEX_REPLACEMENTS: ${pattern}`, error);
      }
    }

    if (processedText.startsWith(commandPrefix)) {
      return this.handleCommand(username, processedText, updateUserVoice, config, availableVoices);
    }

    const cleanedText = processedText.replace(this.LINK_PATTERN, 'ссылка').trim();
    const currentVoice = config.USER_VOICES[lowerUser] || config.DEFAULT_MODEL_NAME;

    return {
      shouldQueue: cleanedText.length > 0,
      text: cleanedText,
      voice: currentVoice,
    };
  }

  private static handleCommand(
    username: string,
    message: string,
    updateUserVoice: (user: string, voice: string) => void,
    config: AppConfig,
    availableVoices: VoiceGroups,
  ): ProcessedResult {
    const args = message.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const commandPrefix = config.BOT_COMMAND_PREFIX ?? '!';

    if (command === `${commandPrefix}voices` || command === `${commandPrefix}voice`) {
      if (command === `${commandPrefix}voices`) {
        const voiceList = [
          availableVoices.male.length > 0 ? `Мужские: ${availableVoices.male.join(', ')}` : '',
          availableVoices.female.length > 0 ? `Женские: ${availableVoices.female.join(', ')}` : '',
          availableVoices.rhvoice.length > 0
            ? `RHVoice (без нейроконвертации): ${availableVoices.rhvoice.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('; ') || `Нет доступных моделей. Голос по умолчанию: ${config.DEFAULT_MODEL_NAME}`;
        return {
          shouldQueue: false,
          commandReply: `Доступные голоса: ${voiceList}`,
        };
      }

      if (args.length === 1) {
        const currentVoice = config.USER_VOICES[username.toLowerCase()] || config.DEFAULT_MODEL_NAME;
        return {
          shouldQueue: false,
          commandReply: `Твой текущий голос: ${currentVoice}`,
        };
      }

      const selectedVoice = args.slice(1).join(' ');
      const normalizedVoice = this.findVoice(selectedVoice, availableVoices);
      if (!normalizedVoice) {
        return {
          shouldQueue: false,
          commandReply: `Голос "${selectedVoice}" не найден. Используй ${commandPrefix}voices, чтобы посмотреть доступные голоса.`,
        };
      }

      updateUserVoice(username.toLowerCase(), normalizedVoice);
      console.log(`[Bot] Пользователь ${username} изменил голос на: ${normalizedVoice}`);

      return {
        shouldQueue: false,
        commandReply: `Голос для ${username} установлен: ${normalizedVoice}`,
      };
    }

    if (command === `${commandPrefix}setvoice` || command === `${commandPrefix}set_voice`) {
      const selectedVoice = args.slice(1).join(' ');
      if (!selectedVoice) {
        return {
          shouldQueue: false,
          commandReply: `Использование: ${commandPrefix}voice <название_голоса>`,
        };
      }

      const normalizedVoice = this.findVoice(selectedVoice, availableVoices);
      if (!normalizedVoice) {
        return {
          shouldQueue: false,
          commandReply: `Голос "${selectedVoice}" не найден. Используй ${commandPrefix}voices, чтобы посмотреть доступные голоса.`,
        };
      }

      updateUserVoice(username.toLowerCase(), normalizedVoice);
      console.log(`[Bot] Пользователь ${username} изменил голос на: ${normalizedVoice}`);

      return {
        shouldQueue: false,
        commandReply: `Голос для ${username} установлен: ${normalizedVoice}`,
      };
    }

    return { shouldQueue: false };
  }

  private static findVoice(selectedVoice: string, availableVoices: VoiceGroups): string | undefined {
    const rhvoicePrefix = /^rhvoice:\s*/i;
    if (rhvoicePrefix.test(selectedVoice)) {
      const requestedVoice = selectedVoice.replace(rhvoicePrefix, '').trim();
      const rhvoice = availableVoices.rhvoice.find(
        (voice) => voice.toLowerCase() === requestedVoice.toLowerCase(),
      );
      return rhvoice ? `RHVoice: ${rhvoice}` : undefined;
    }

    const neuralVoice = [...availableVoices.male, ...availableVoices.female].find(
      (voice) => voice.toLowerCase() === selectedVoice.toLowerCase(),
    );
    if (neuralVoice) return neuralVoice;

    const rhvoice = availableVoices.rhvoice.find(
      (voice) => voice.toLowerCase() === selectedVoice.toLowerCase(),
    );
    return rhvoice ? `RHVoice: ${rhvoice}` : undefined;
  }
}
