# 搜索 Demo 本地启动说明

## 1. 目标

本文档只说明当前“搜索 Demo”怎么在本地启动，不展开 chatbot 历史方案。

页面入口：

- `/search-demo`

## 2. 环境变量

本功能至少依赖以下环境变量：

```bash
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=your_api_key
MODEL_NAME=qwen-max
BRAVE_API_KEY=your_brave_api_key
ENABLE_INTERNAL_KNOWLEDGE_BASE=false
```

字段说明：

- `OPENAI_API_BASE`: 大模型兼容接口地址
- `OPENAI_API_KEY`: 大模型调用密钥
- `MODEL_NAME`: 聚合整理时使用的模型名
- `BRAVE_API_KEY`: 联网搜索增强使用，建议配置

## 3. `.env` 配置方式

当前项目已经采用“主项目根目录放 `.env`”的方式，路径是：

- `/Users/simonchou/JhmkProjects/info_platform/.env`

推荐直接维护这一份 `.env`，启动时不需要再额外 `source` 其他路径。

`.env` 内容示例：

```bash
OPENAI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_API_KEY=your_api_key
MODEL_NAME=qwen-max
BRAVE_API_KEY=your_brave_api_key
```

Nuxt 启动时会自动读取项目根目录下的 `.env`。

## 4. 启动步骤

### 4.1 安装依赖

```bash
cd /Users/simonchou/JhmkProjects/info_platform
pnpm install
```

### 4.2 确认 Node 版本

当前项目本地开发建议使用 Node 20。

```bash
node -v
```

如果输出不是 `v20.x`，而是旧的 `v18`，直接运行 `pnpm dev` 可能会报：

```bash
crypto.hash is not a function
```

这时请先切到 Node 20，或者直接用 Node 20 显式启动。

### 4.3 启动

如果你的默认 `node` 已经是 Node 20：

```bash
cd /Users/simonchou/JhmkProjects/info_platform
pnpm dev
```

如果你的默认 `node` 还是旧版本，可以直接用这条命令启动：

```bash
cd /Users/simonchou/JhmkProjects/info_platform
PATH="/opt/homebrew/Cellar/node@20/20.20.2/bin:$PATH" /opt/homebrew/Cellar/node@20/20.20.2/bin/node /opt/homebrew/bin/pnpm dev
```

### 4.4 访问地址

默认访问：

- `http://localhost:3000/search-demo`

如果 3000 被占用，Nuxt 会自动切到别的端口，比如：

- `http://localhost:3001/search-demo`
- `http://localhost:3002/search-demo`

## 5. 启动后的预期

成功启动后，用户输入搜索词，页面会实时展示：

- 站内内容检索结果
- 权威来源搜索结果
- 互联网补充搜索结果
- 大模型聚合后的最终回答

## 6. 常见问题

### 6.1 没配置 `OPENAI_API_KEY`

现象：

- 最终回答阶段报错
- 或只能返回降级结果

处理：

- 检查 `/Users/simonchou/JhmkProjects/info_platform/.env`
- 确认启动前变量已经生效

### 6.2 没配置 `BRAVE_API_KEY`

现象：

- 联网搜索能力可能受限

处理：

- 补充 `BRAVE_API_KEY`

### 6.3 端口被占用

现象：

- 启动日志里提示 3000 被占用

处理：

- 直接打开 Nuxt 日志里显示的新端口
- 或结束占用 3000 的旧进程

### 6.4 `crypto.hash is not a function`

现象：

- `pnpm dev` 启动后立即报 `crypto.hash is not a function`

根因：

- 当前终端实际使用的是旧版 Node 18，而不是 Node 20

处理：

- 先执行 `node -v`
- 如果不是 `v20.x`，请切换到 Node 20
- 或直接使用上面的 Node 20 显式启动命令

## 7. 相关文档

- 前端对接文档：`docs/search-demo-frontend-handoff.md`
