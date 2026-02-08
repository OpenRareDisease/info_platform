# GitHub Actions Workflows

## sync-to-upstream.yml

自动同步下游仓库的更新到上游仓库的 GitHub Actions workflow。

### 功能说明

当 `main` 分支有代码更新（且由仓库 owner 提交）时，此 workflow 会：

1. **检查 Vercel 部署状态**：通过 GitHub Deployments API 和 Commit Status API 检查 Vercel 部署是否成功
2. **等待部署完成**：最多等待 10 分钟，每 30 秒检查一次部署状态
3. **检查变更**：检查当前分支与上游分支是否有差异
4. **检查现有 PR**：检查是否已存在未合并的同步 PR
5. **创建 PR**：如果部署成功且没有现有 PR，则向上游仓库创建 Pull Request
6. **更新现有 PR**：如果存在现有 PR，则在 PR 中添加评论通知

> **注意**：只有在 Vercel 部署成功（或超时）后才会创建 PR。

### 触发条件

- **自动触发**：当代码推送到 `main` 分支时（仅限仓库 owner 的提交）
- **手动触发**：可以在 GitHub Actions 页面手动触发

### 工作流程

```
代码推送到 main 分支（owner 合并 PR 后）
    ↓
检查 Vercel 部署状态（最多等待 10 分钟）
    ↓
部署成功或超时
    ↓
检查是否有变更
    ↓
检查是否存在未合并的 PR
    ↓
创建新 PR 或更新现有 PR
```

### 配置要求

1. **Personal Access Token (PAT)**（必需）：
   - 默认的 `GITHUB_TOKEN` **无法**向上游仓库创建 PR
   - **必须**在仓库 Settings → Secrets and variables → Actions 中添加一个名为 `PAT` 的 secret
   - PAT 需要以下权限：
     - `public_repo`（如果上游仓库是公开的）
     - `repo`（如果上游仓库是私有的）
   - 创建 PAT：
     1. 访问：GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
     2. 点击 "Generate new token (classic)"
     3. 选择 `public_repo` 权限（如果上游仓库是公开的）
     4. 复制生成的 token
     5. 在仓库 Settings → Secrets and variables → Actions 中添加 secret，名称为 `PAT`
   - **如果没有配置 PAT，workflow 会失败并提示错误**

2. **上游仓库权限**：确保上游仓库 `OpenRareDisease/info_platform` 允许从 fork 创建 PR

3. **仓库设置**：确保 Actions 已启用

### PR 内容

创建的 PR 包含以下信息：

- 来源仓库和提交信息
- 提交 SHA 和变更链接
- 检查清单

### 注意事项

1. **部署状态检查**：
   - 通过 GitHub Deployments API 和 Commit Status API 检查 Vercel 部署状态
   - 最多等待 10 分钟，每 30 秒检查一次
   - 如果超时仍未检测到部署状态，会假设部署成功并继续（可能 Vercel 还未创建 status）
2. **重复 PR**：如果已存在未合并的同步 PR，不会创建新的 PR，而是在现有 PR 中添加评论
3. **权限要求**：只有仓库 owner 的提交才会触发此 workflow
4. **上游仓库**：确保上游仓库允许从 fork 创建 PR（公开仓库默认允许）
5. **PR 来源**：PR 从下游仓库的 `main` 分支创建到上游仓库的 `main` 分支
6. **部署失败处理**：如果检测到部署失败，workflow 会停止，不会创建 PR

### 故障排查

如果 PR 创建失败，检查：

1. 上游仓库是否允许从 fork 创建 PR
2. GitHub Token 是否有足够权限
3. 是否有未合并的同步 PR 存在
4. 当前分支与上游分支是否有实际差异

### 手动触发

如果需要手动触发此 workflow：

1. 访问 GitHub Actions 页面
2. 选择 "Sync to Upstream Repository" workflow
3. 点击 "Run workflow"
4. 选择分支（通常是 `main`）
5. 点击 "Run workflow"
