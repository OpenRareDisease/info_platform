# 智能新闻爬虫系统

基于 **LangChain + Playwright + Qwen3-max** 的智能自适应新闻爬虫。

## ✨ 特点

- 🧠 **智能分析**：自动分析网站结构，无需手动配置
- 🎯 **自适应爬取**：根据页面类型自动调整策略
- 🛡️ **反 Cloudflare**：使用 playwright-stealth，自动处理验证
- 📝 **完整提取**：提取完整正文（不是摘要）
- 🌏 **智能翻译**：自动翻译成中文并生成两个版本
  - **专业版 MD**：保持原文专业性的中文翻译
  - **小白版 MD**：通俗易懂的简化版本
- 🗂️ **分类存储**：按网站域名自动分类，支持 JSONL + Markdown
- 🚀 **零配置**：输入 URL 即可运行

## 🚀 快速开始

### 1. 安装依赖

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装 Python 包
pip install -r requirements.txt

# 安装浏览器
playwright install chromium
```

### 2. 配置环境变量

环境变量已在 `.env` 文件中配置好：

```bash
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=sk-5129582e8435491e8e964bb2f3d1a1f7
MODEL_NAME=qwen-max
```

### 3. 运行爬虫

```bash
# 基本用法
python main.py --url https://rarediseases.org/news/

# 限制文章数量
python main.py --url https://rarediseases.org/news/ --max-articles 20

# 详细输出
python main.py --url https://rarediseases.org/news/ --verbose
```

## 📁 项目结构

```
rare_disease_news_bot/
├── config/
│   ├── __init__.py
│   └── settings.py              # 全局配置
├── core/
│   ├── __init__.py
│   ├── browser_tools.py          # 浏览器工具（反 Cloudflare）
│   ├── agent.py                  # 智能 Agent
│   ├── explorer.py               # 网站结构探索器
│   ├── extractor.py              # 内容提取器
│   └── markdown_generator.py     # Markdown 文档生成器
├── data/
│   └── articles/                 # 文章存储（按网站分类）
│       └── rarediseases.org/
│           ├── articles.jsonl    # 文章数据
│           ├── history.txt       # 已爬取 URL
│           ├── markdown_professional/  # 专业版 MD（翻译）
│           └── markdown_simplified/    # 小白版 MD（简化）
├── utils/
│   ├── __init__.py
│   ├── storage.py                # 数据存储
│   └── helpers.py                # 辅助函数
├── main.py                       # 主入口
├── requirements.txt
├── .env                          # 环境变量
└── README.md
```

## 🔧 工作原理

### 5 个阶段

1. **探索阶段** 🔍
   - 访问目标 URL
   - 等待 Cloudflare 验证（8秒）
   - 使用 Qwen3-max 分析页面结构
   - 识别页面类型（列表页/单文章）

2. **收集阶段** 📋
   - 根据页面类型提取文章链接
   - 处理分页（如果需要）
   - 应用数量限制

3. **提取阶段** 📄
   - 逐个访问文章页面
   - 使用 Qwen3-max 提取完整内容
   - 验证数据质量

4. **翻译阶段** 🌏
   - 使用 Qwen3-max 翻译成中文
   - 生成专业版 Markdown（保持原文专业性）
   - 生成小白版 Markdown（通俗易懂）
   - 自动保存到对应目录

5. **总结阶段** 📊
   - 统计成功/失败数量
   - 显示存储位置
   - 生成元数据

### 反 Cloudflare 机制

- ✅ 使用 `playwright-stealth` 反检测
- ✅ 有界面模式（headless=False）
- ✅ 自定义 User-Agent
- ✅ 每次导航后等待 8-10 秒
- ✅ 自动检测验证页面并延长等待

## 📝 数据格式

### 1. articles.jsonl（每行一个 JSON）

```json
{
  "title": "文章标题",
  "date": "2025-12-08",
  "author": "作者名",
  "categories": ["分类1", "分类2"],
  "content": "完整正文内容...",
  "summary": "自动生成的摘要",
  "url": "https://example.com/article",
  "source_website": "example.com",
  "scraped_at": "2025-12-14T16:00:00Z",
  "content_length": 2845
}
```

### 2. Markdown 文档

每篇文章会生成两个 Markdown 文件：

#### 专业版（markdown_professional/）
- 保持原文的专业性和准确性
- 正确翻译医学术语
- 适合医疗专业人士阅读

#### 小白版（markdown_simplified/）
- 用通俗易懂的语言重写
- 解释专业术语
- 适合普通读者理解

**Markdown 格式示例**：

```markdown
<div align="center">

# 文章标题

</div>

**日期**: 2025-12-08  
**作者**: 作者名  
**标签**: 分类1、分类2  
**原文链接**: [https://example.com/article](https://example.com/article)

---

文章内容...
```

## 🎯 使用示例

### 示例 1：爬取罕见病新闻

```bash
python main.py --url https://rarediseases.org/news/ --max-articles 50
```

**输出**：
```
🚀 智能新闻爬虫系统
================================================================

📍 阶段 1: 探索网站结构
🔗 导航到: https://rarediseases.org/news/
⏳ 等待 8 秒...
✓ 页面加载完成
🔍 分析页面结构...
✓ 页面类型: article_list
✓ 文章数量: 10
✓ 分页: 是 (共 108 页)

📍 阶段 2: 收集文章链接
使用选择器: article h3 a
计划访问 5 页
✓ 共收集 50 个链接

📍 阶段 3: 提取文章内容
✓ [1/50] Kim Isenberg Joins NORD Board... (2845 字符)
✓ [2/50] Seven Centers Receive Grants... (3156 字符)
...

📊 爬取完成

  成功: 48
  失败: 2
  跳过: 0
  总计: 50

存储位置: data/articles/rarediseases.org/
```

### 示例 2：爬取单篇文章

```bash
python main.py --url https://example.com/article/123
```

系统会自动识别为单篇文章页面，直接提取内容。

## 🔍 查看结果

```bash
# 查看存储的文章
ls data/articles/rarediseases.org/

# 统计文章数量
wc -l data/articles/rarediseases.org/articles.jsonl

# 查看最新文章（JSON）
tail -n 1 data/articles/rarediseases.org/articles.jsonl | python -m json.tool

# 查看 Markdown 文件
ls data/articles/rarediseases.org/markdown_professional/
ls data/articles/rarediseases.org/markdown_simplified/

# 阅读某篇文章（专业版）
cat data/articles/rarediseases.org/markdown_professional/2025-12-08_某篇文章.md

# 阅读某篇文章（小白版）
cat data/articles/rarediseases.org/markdown_simplified/2025-12-08_某篇文章.md
```

## ⚙️ 配置说明

### settings.py 主要配置

```python
# 浏览器配置
HEADLESS = False              # 有界面模式（反 Cloudflare）
DEFAULT_WAIT_TIME = 8         # 默认等待时间（秒）
MAX_RETRIES = 3               # 最大重试次数

# LLM 配置
MODEL_NAME = "qwen-max"       # 模型名称
LLM_TEMPERATURE = 0           # 温度（0=确定性）
```

## 🛠️ 技术栈

- **LangChain**: Agent 框架
- **Qwen3-max**: 阿里云大模型（页面分析 + 内容提取）
- **Playwright**: 浏览器自动化
- **playwright-stealth**: 反检测
- **Rich**: 终端美化
- **BeautifulSoup4**: HTML 解析

## 📋 依赖列表

```
langchain>=0.1.0
langchain-openai
openai>=1.0.0
playwright
playwright-stealth
pyyaml
python-dotenv
rich
beautifulsoup4
lxml
```

## ❓ 常见问题

### Q: Cloudflare 验证一直通不过？

A: 
1. 确保使用有界面模式（`HEADLESS=False`）
2. 增加等待时间（修改 `DEFAULT_WAIT_TIME`）
3. 手动完成验证后程序会继续

### Q: 提取的内容不完整？

A: 
1. 检查文章页面是否需要滚动加载
2. 增加 HTML 截断长度（`extractor.py` 中的 `max_length`）
3. 检查 LLM 响应是否被截断

### Q: 如何支持更多网站？

A: 系统是自适应的，理论上支持所有新闻网站。如遇到特殊网站，可以：
1. 调整页面分析提示词（`explorer.py`）
2. 添加自定义选择器规则
3. 调整分页逻辑（`agent.py`）

### Q: 如何更换 LLM？

A: 修改 `.env` 文件：
```bash
# 使用 OpenAI
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_API_KEY=your-openai-key
MODEL_NAME=gpt-4

# 使用其他兼容 OpenAI API 的服务
OPENAI_API_BASE=your-api-base
OPENAI_API_KEY=your-api-key
MODEL_NAME=your-model-name
```
