import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

ORIGINAL_CONFIG_DIR = Path.home() / ".my_ai_config"
CURRENT_CONFIG_DIR = ""

SAVE_PATH_CONFIG = Path(__file__).parent.parent.parent / "data"
SAVE_CONFIG = SAVE_PATH_CONFIG / "config.json"

def savePathConfig(modifiedPath: Optional[Path | str] = None) -> str | bool:
    SAVE_PATH_CONFIG.mkdir(exist_ok=True, parents=True)

    if modifiedPath is not None:
        try:
            tmp_file = SAVE_CONFIG.with_suffix(".tmp")
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump({"path": str(modifiedPath)}, f, indent=2, ensure_ascii=False)
            tmp_file.replace(SAVE_CONFIG)

            #切换空文件夹，直接初始化，以后需要初始化直接添加
            new_dir = Path(modifiedPath)
            new_dir.mkdir(exist_ok=True)
            cfg_file = new_dir / "configs.json"
            if not cfg_file.exists():
                init_cfg = {"configs": [], "active_id": None, "ConfigAvailableDetection": True}
                with open(cfg_file, "w", encoding="utf-8") as f:
                    json.dump(init_cfg, f, indent=2, ensure_ascii=False)
            (new_dir / "conversations").mkdir(exist_ok=True)
            return True

        except Exception as e:
            logger.exception("写入保存路径失败")
            return False

    if SAVE_CONFIG.exists():
        try:
            with open(SAVE_CONFIG, "r", encoding="utf-8") as f:
                data = json.load(f)
                path_val = data.get("path")
                if isinstance(path_val, str) and path_val.strip():
                    return path_val
                logger.warning("配置文件中path字段无效，使用默认目录")
                return str(ORIGINAL_CONFIG_DIR)
        except json.JSONDecodeError:
            logger.warning("配置文件json损坏")
    else:
        try:
            with open(SAVE_CONFIG, "w", encoding="utf-8") as f:
                json.dump({"path": str(ORIGINAL_CONFIG_DIR)}, f, indent=2, ensure_ascii=False)

        except Exception as e:
            logger.exception("创建默认保存路径配置失败")
        return str(ORIGINAL_CONFIG_DIR)

def ensure_dir() -> str | None:
    global CURRENT_CONFIG_DIR
    CONFIG_DIR = Path(savePathConfig())
    if CONFIG_DIR:
        CONFIG_DIR.mkdir(exist_ok=True)
        CURRENT_CONFIG_DIR = CONFIG_DIR
        return CURRENT_CONFIG_DIR
    else:
        return None
