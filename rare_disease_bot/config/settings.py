"""全局配置"""
import os
from pathlib import Path
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent

# API 配置
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "qwen-max")

# 浏览器配置
HEADLESS = False  # 使用有界面模式（反 Cloudflare）
DEFAULT_WAIT_TIME = int(os.getenv("DEFAULT_WAIT_TIME", "8"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))

# 用户代理
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# 数据存储
DATA_DIR = PROJECT_ROOT / "data" / "articles"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 日志配置
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# LLM 配置
LLM_TEMPERATURE = 0
LLM_MAX_TOKENS = 4096
