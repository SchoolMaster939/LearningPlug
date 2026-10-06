import time
import uvicorn
import threading
import webview
import os
import server
from pathlib import Path
from tool.filePath import savePathConfig
from storage import load_ConfigAvailableDetect, ConfigAvailableDetect_switch, load_TreeModeAutoTopicRelevance, TreeModeAutoTopicRelevance_switch, load_Turns, updateTurns, load_SummaryTriggerThreshold, updateSummaryTriggerThreshold, load_RecentKeepTurns, updateRecentKeepTurns

base_url = "http://localhost:5173/src/html/index.html"

class Api:

    def get_base_url(self):
        return "http://127.0.0.1:8000"

    def open_folder_dialog(self):
        window = webview.active_window()
        folders = window.create_file_dialog(
            webview.FileDialog.FOLDER,
            directory='/',
        )
        if folders:
            return folders[0]
        return None

    def saveConfigPath(self, path) -> bool:
        return savePathConfig(Path(path))

    def readSavePath(self) -> str:
        return savePathConfig()

    def load_ConfigAvailableDetect(self) -> bool | None:
        return load_ConfigAvailableDetect()

    @staticmethod
    def ConfigAvailableDetect_switch(switch: bool):
        ConfigAvailableDetect_switch(switch)


    def load_TreeModeAutoTopicRelevance(self) -> bool | None:
        return load_TreeModeAutoTopicRelevance()

    @staticmethod
    def TreeModeAutoTopicRelevance_switch(switch: bool):
        TreeModeAutoTopicRelevance_switch(switch)


    def load_Turns(self) -> int | None:
        return load_Turns()

    @staticmethod
    def updateTurns(turns):
        updateTurns(turns)


    def load_SummaryTriggerThreshold(self):
        return load_SummaryTriggerThreshold()

    @staticmethod
    def updateSummaryTriggerThreshold(value):
        updateSummaryTriggerThreshold(value)


    def load_RecentKeepTurns(self):
        return load_RecentKeepTurns()

    @staticmethod
    def updateRecentKeepTurns(value):
        updateRecentKeepTurns(value)


def get_url():

    if os.getenv('DEV_MODE'):
        return 'http://localhost:5173/src/html/index.html'

    else:
        current_dir = os.path.dirname(os.path.abspath(__file__))

        return os.path.join(current_dir, 'dist', 'index.html')

def fastapi_server():
    uvicorn.run(
        app=server.app,
        host="127.0.0.1",
        port=8000,
        log_level="warning"
    )


if __name__ == '__main__':
    api_thread = threading.Thread(target=fastapi_server, daemon=True)
    api_thread.start()

    time.sleep(1.2)

    window = webview.create_window(
        '学习插件',
        base_url,
        width=1000,
        height=800,
        js_api=Api()
    )
    webview.start(debug=True)