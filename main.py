import subprocess as sp
from twitch_chat_irc import twitch_chat_irc
from rhvoice_wrapper import TTS
import queue
import threading

messagesQueue=queue.Queue()

channelName = input("Enter twitch channel name: ")

connection = twitch_chat_irc.TwitchChatIRC()

tts = TTS(threads=1)

def doSound(message):
    data = tts.get(message, voice='anna', format_="wav", sets=None)
    aplay = sp.Popen(["D:/VLC/vlc.exe", "-vvv", "-", "--intf", "dummy", "--play-and-exit"], stdin=sp.PIPE)
    aplay._stdin_write(data)
    aplay.wait()


def callback(message):
    global messagesQueue
    print(message["display-name"] + " " + message["message"])
    messagesQueue.put(message["message"])


def twitchListener():
    global messagesQueue
    connection.listen(channelName, on_message=callback)
    

if __name__ == '__main__':
    thread = threading.Thread(target=twitchListener)
    thread.start()

    while True:
        if not messagesQueue.empty():
            doSound(messagesQueue.get())
