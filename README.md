# Rare Disease Info Platform

一个基于 Nuxt 3 的罕见病文章平台，集成了智能新闻爬虫系统，用于收集、翻译和展示罕见病相关的新闻文章。

🌐 **在线访问**: [www.raredisease.top](https://www.raredisease.top)

> ⚠️ **注意**: 本项目是 [上游仓库](https://github.com/OpenRareDisease/info_platform) 的 fork，用于 Vercel 部署（免费版 Vercel 只能关联个人 private 仓库）。由于只有 repo owner 的提交才能触发 CD，开发流程为：**先在个人仓库提 PR 给 Owner → Owner 合并触发 CD → 再提 PR 给上游仓库**。详见 [开发流程](#-开发流程) 部分。

## 🏗️ 架构图

<img width="3070" height="1684" alt="Architecture Diagram" src="https://github.com/user-attachments/assets/a09f8149-36ed-4f0a-9ce1-dfe9424f4614" />

## ✨ 功能特性

- 📰 **文章展示**：优雅的文章列表和详情页，支持 Markdown 渲染
- ✍️ **内容管理**：支持创建和编辑文章
- 🤖 **智能爬虫**：自动爬取罕见病新闻并翻译成中文（专业版和小白版）
- 🔄 **自动同步**：构建时自动将爬取的文章导入到数据库
- 🎨 **现代化 UI**：响应式设计，支持移动端

## 🛠️ 技术栈

### 前端框架
- **[Nuxt 3](https://nuxt.com)** - Vue 3 全栈框架
- **[Vue 3](https://vuejs.org)** - 渐进式 JavaScript 框架
- **[TypeScript](https://www.typescriptlang.org)** - 类型安全的 JavaScript
- **[Sass](https://sass-lang.com)** - CSS 预处理器

### 后端服务
- **[Supabase](https://supabase.com)** - 开源 Firebase 替代品（PostgreSQL 数据库）
- **Nuxt Server API** - 服务端 API 路由

### 工具库
- **[Markdown-it](https://github.com/markdown-it/markdown-it)** - Markdown 解析器
- **[ESLint](https://eslint.org)** + **[Prettier](https://prettier.io)** - 代码规范和格式化
- **[Husky](https://typicode.github.io/husky)** - Git hooks 管理

### 子项目：rare_disease_bot
- **[LangChain](https://www.langchain.com)** - LLM 应用开发框架
- **[Playwright](https://playwright.dev)** - 浏览器自动化
- **[Qwen3-max](https://dashscope.aliyuncs.com)** - 阿里云通义千问大模型
- **Python 3** - 爬虫脚本运行环境

### 部署
- **[Vercel](https://vercel.com)** - 前端部署平台

## 📁 项目结构

```
.
├── pages/                    # Nuxt 页面路由
│   ├── index.vue            # 文章列表页
│   └── notes/               # 文章相关页面
│       ├── [id].vue         # 文章详情页
│       └── edit.vue         # 文章编辑页
├── server/                  # 服务端代码
│   ├── api/                 # API 路由
│   │   └── notes/           # 文章相关 API
│   ├── articles/            # 爬虫生成的文章（Markdown）
│   ├── plugins/             # 服务端插件
│   └── scripts/             # 构建脚本
│       └── import-articles.js  # 文章导入脚本（prebuild）
├── rare_disease_bot/        # 智能新闻爬虫子项目
│   ├── config/              # 配置文件
│   ├── core/                # 核心功能模块
│   │   ├── agent.py         # 爬虫 Agent
│   │   ├── browser_tools.py # 浏览器工具
│   │   ├── explorer.py      # 网站结构探索器
│   │   ├── extractor.py     # 内容提取器
│   │   └── markdown_generator.py  # Markdown 生成器
│   ├── utils/               # 工具函数
│   ├── main.py              # 爬虫入口
│   └── requirements.txt     # Python 依赖
├── types/                   # TypeScript 类型定义
├── nuxt.config.ts          # Nuxt 配置
├── package.json            # Node.js 依赖
└── README.md               # 项目说明文档
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- Python 3.8+（用于运行 rare_disease_bot）
- Supabase 账户（用于数据库）

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
npm install
# 或
pnpm install --shamefully-hoist
# 或
yarn
```

### 2. 配置环境变量

创建 `.env` 文件（如果不存在）：

```bash
# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key  # 用于 prebuild 脚本
```

### 3. 运行开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 查看应用。

### 4. 构建生产版本

```bash
npm run build
```

构建时会自动执行 `prebuild` 脚本，将 `server/articles/` 目录下当天的文章导入到 Supabase。

### 5. 预览生产构建

```bash
npm run preview
```

## 📝 使用 rare_disease_bot 爬虫

`rare_disease_bot` 是一个独立的 Python 子项目，用于爬取罕见病新闻。

### 安装爬虫依赖

```bash
cd rare_disease_bot

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 安装浏览器
playwright install chromium
```

### 配置爬虫环境变量

在 `rare_disease_bot/.env` 文件中配置：

```bash
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=your_api_key
MODEL_NAME=qwen-max
```

### 运行爬虫

```bash
# 基本用法
python main.py --url https://rarediseases.org/news/

# 限制文章数量
python main.py --url https://rarediseases.org/news/ --max-articles 20

# 详细输出
python main.py --url https://rarediseases.org/news/ --verbose
```

爬取的文章会保存到 `server/articles/YYYYMMDD/域名/` 目录下，包含：
- `markdown_professional/` - 专业版中文翻译
- `markdown_simplified/` - 小白版中文翻译

详细使用说明请参考 [rare_disease_bot/README.md](./rare_disease_bot/README.md)

## 🚢 部署到 Vercel

### 1. 连接 GitHub 仓库

在 [Vercel](https://vercel.com) 中导入你的 GitHub 仓库。

### 2. 配置环境变量

在 Vercel 项目设置中添加以下环境变量：
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_KEY`

### 3. 部署

Vercel 会自动检测 Nuxt 项目并配置构建命令。每次推送到主分支都会自动部署。

### 构建流程

1. 执行 `npm run build`
2. 自动运行 `prebuild` 脚本（`server/scripts/import-articles.js`）
3. 扫描 `server/articles/` 目录下当天的文章
4. 将文章导入到 Supabase 数据库
5. 构建 Nuxt 应用

## 📚 开发指南

### 代码规范

项目使用 ESLint 和 Prettier 进行代码规范检查：

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint:fix

# 格式化代码
npm run format

# 检查格式
npm run format:check
```

### Git Hooks

项目配置了 Husky，在提交前会自动运行 lint-staged 检查代码。

## 🔧 技术细节

### 数据流程

1. **爬取阶段**：`rare_disease_bot` 爬取文章并保存为 Markdown 文件
2. **导入阶段**：构建时通过 `import-articles.js` 脚本导入到 Supabase
3. **展示阶段**：Nuxt 应用从 Supabase 读取数据并渲染

### API 路由

- `GET /api/notes` - 获取文章列表
- `GET /api/notes/[id]` - 获取文章详情
- `POST /api/notes` - 创建新文章
- `PATCH /api/notes/[id]` - 更新文章

### 数据库结构

文章存储在 Supabase 的 `notes` 表中，包含以下字段：
- `id` - UUID
- `title` - 标题
- `content` - Markdown 内容
- `category` - 分类（逗号分隔）
- `source` - 原文链接
- `published_at` - 发布时间
- `updated_by` - 更新者

## 🔄 开发流程

由于 Vercel 免费版限制（只能关联个人 private 仓库），且只有 repo owner 的提交才能触发 CD，本项目采用以下开发流程：

### 流程说明

1. **在个人仓库开发并提交 PR**
   - 在个人 fork 仓库（当前仓库）创建功能分支进行开发
   - 创建 Pull Request 提交给仓库 Owner

2. **Owner 合并触发 CD**
   - Owner 审查并合并 PR 到主分支
   - Owner 的提交会触发 Vercel CI/CD 自动部署

3. **同步到上游仓库**
   - CD 部署成功后，再向上游仓库提交 Pull Request
   - 上游仓库: [OpenRareDisease/info_platform](https://github.com/OpenRareDisease/info_platform)

### 工作流程示例

```bash
# 1. 在个人仓库创建功能分支
git checkout -b feat/new-feature
git add .
git commit -m "feat: 添加新功能"
git push origin feat/new-feature

# 2. 在 GitHub 上创建 PR 给 Owner
# 等待 Owner 审查并合并

# 3. Owner 合并后，同步到上游仓库
git remote add upstream https://github.com/OpenRareDisease/info_platform.git
git fetch upstream
git checkout main
git pull origin main
git push upstream main  # 或创建 PR 到上游仓库
```

> ⚠️ **重要**: 只有仓库 Owner 的提交才能触发 Vercel CD，因此必须先通过 PR 让 Owner 合并，然后再同步到上游仓库。

## 📖 相关文档

- [Nuxt 3 文档](https://nuxt.com/docs)
- [Supabase 文档](https://supabase.com/docs)
- [Vercel 部署文档](https://vercel.com/docs)
- [rare_disease_bot 详细说明](./rare_disease_bot/README.md)
- [上游仓库](https://github.com/OpenRareDisease/info_platform)

## 📄 License

本项目采用 [MIT License](LICENSE) 开源协议。
