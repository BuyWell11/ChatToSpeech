import subprocess as sp
from twitch_chat_irc import twitch_chat_irc
from rhvoice_wrapper import TTS
import queue
import threading
import os
import re
import json
import sys
from dataclasses import dataclass

pathToVCL = None
channelName = None
users = None
bans = None


@dataclass
class ChatMessage:
    username: str
    text: str


def clean_massage(message):
    link_pattern = r'http[s]?://\S+|www\.\S+'
    cleaned_message = re.sub(link_pattern, 'ссылка', message)
    return cleaned_message.strip()


def check_or_create_settings():
    global pathToVCL
    global channelName
    global users
    global bans
    settings_file = 'settings.json'
    
    if os.path.exists(settings_file):
        with open(settings_file, 'r', encoding='utf-8') as file:
            settings = json.load(file)
        
        if 'channelName' in settings and 'pathToVCL' in settings:
            channelName = settings['channelName']
            pathToVCL = settings['pathToVCL']
            users = settings['users']
            bans = settings['bans']
            print(f'Настройки загружены из файла: channel-name={channelName}, path-to-VCL={pathToVCL}')
            print(f'Голоса: {users}')
            print(f'Баны: {bans}')
        else:
            print('Файл settings.json найден, но в нём отсутствуют необходимые параметры.')
            get_and_save_settings(settings_file)
    else:
        print('Файл settings.json не найден.')
        get_and_save_settings(settings_file)


def get_and_save_settings(filename):
    global pathToVCL
    global channelName
    global users
    global bans
    channelName = input('Введите channelName: ')
    pathToVCL = input('Введите pathToVCL: ')
    users = {}
    bans = []
    
    settings = {
        'channelName': channelName,
        'pathToVCL': pathToVCL,
        'users': {},
        'bans': []
    }
    
    with open(filename, 'w', encoding='utf-8') as file:
        json.dump(settings, file, ensure_ascii=False, indent=4)
    
    print(f'Настройки сохранены в файл {filename}.')


check_or_create_settings()

messagesQueue = queue.Queue()
connection = twitch_chat_irc.TwitchChatIRC()
tts = TTS(threads=1)

print(f'Доступные голоса {tts.voices}.')


def doSound(message):
    global users
    voice = users.get(message.username, 'anna')
    data = tts.get(message.text, voice=voice, format_="wav", sets=None)
    aplay = sp.Popen([pathToVCL, "-vvv", "-", "--intf", "dummy", "--play-and-exit"], stdin=sp.PIPE)
    aplay._stdin_write(data)
    aplay.wait()


def callback(message):
    global messagesQueue
    global bans
    if(message["message"][0] == '!'):
        return
    if(message["display-name"] in bans):
        return
    cleaned_message = clean_massage(message["message"])
    print(message["display-name"] + " " + cleaned_message)
    messagesQueue.put(ChatMessage(message["display-name"], cleaned_message))


def twitchListener():
    global messagesQueue
    connection.listen(channelName, on_message=callback)


if __name__ == '__main__':
    twitch_thread = threading.Thread(target=twitchListener)
    twitch_thread.daemon = True
    twitch_thread.start()


while True:
    if not messagesQueue.empty():
        doSound(messagesQueue.get())
