import subprocess as sp
from twitch_chat_irc import twitch_chat_irc
from rhvoice_wrapper import TTS
import queue
import threading
import os
import re

pathToVCL = None

channelName = None


def remove_links(message):
    link_pattern = r'http[s]?://\S+|www\.\S+'
    cleaned_message = re.sub(link_pattern, 'ссылка', message)
    return cleaned_message.strip()



def check_or_create_settings():
    global pathToVCL
    global channelName
    settings_file = 'settings.txt'
    
    if os.path.exists(settings_file):
        with open(settings_file, 'r') as file:
            settings = {}
            for line in file:
                key, value = line.strip().split('=')
                settings[key] = value
        
        if 'channel-name' in settings and 'path-to-VCL' in settings:
            channelName = settings['channel-name']
            pathToVCL = settings['path-to-VCL']
            print(f'Настройки загружены из файла: channel-name={channelName}, path-to-VCL={pathToVCL}')
        else:
            print('Файл settings.txt найден, но в нём отсутствуют необходимые параметры.')
            get_and_save_settings(settings_file)
    else:
        print('Файл settings.txt не найден.')
        get_and_save_settings(settings_file)

def get_and_save_settings(filename):
    global pathToVCL
    global channelName
    channelName = input('Введите channel-name: ')
    pathToVCL = input('Введите path-to-VCL: ')
    
    with open(filename, 'w') as file:
        file.write(f'channel-name={channelName}\n')
        file.write(f'path-to-VCL={pathToVCL}\n')
    
    print(f'Настройки сохранены в файл {filename}.')

check_or_create_settings()


messagesQueue=queue.Queue()

connection = twitch_chat_irc.TwitchChatIRC()

tts = TTS(threads=1)

def doSound(message):
    data = tts.get(message, voice='anna', format_="wav", sets=None)
    aplay = sp.Popen([pathToVCL, "-vvv", "-", "--intf", "dummy", "--play-and-exit"], stdin=sp.PIPE)
    aplay._stdin_write(data)
    aplay.wait()


def callback(message):
    global messagesQueue
    cleaned_message = remove_links(message["message"])
    print(message["display-name"] + " " + cleaned_message)
    messagesQueue.put(cleaned_message)


def twitchListener():
    global messagesQueue
    connection.listen(channelName, on_message=callback)
    
if __name__ == '__main__':
    thread = threading.Thread(target=twitchListener)
    thread.start()

    while True:
        if not messagesQueue.empty():
            doSound(messagesQueue.get())
