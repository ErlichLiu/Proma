# 社区贡献 Skills

Proma 支持社区贡献的 Skills，扩展 Agent 的能力。以下是社区贡献的优秀 Skills。

## 任务拆解 Skill

**贡献者**: [YUANXICHE98](https://github.com/YUANXICHE98)
**项目**: [TaskPilot](https://github.com/YUANXICHE98/TaskPilot)
**描述**: 将复杂项目智能拆解为多 Agent 可执行的任务树，并为每个任务匹配最适合的 AI 工具

### 功能特性

- ✅ 智能拆解 — 将复杂需求拆解成 2-5 层任务树
- ✅ Agent 匹配 — 为每个任务推荐最适合的 AI 工具（Cursor/Claude/Midjourney/Perplexity 等）
- ✅ Prompt 生成 — 为每个任务生成可直接使用的完整 Prompt 指令
- ✅ 三种模式 — 快速/详细/深度三档拆解深度
- ✅ 17 个模板 — 覆盖技术/电商/内容/Agent/教育/商业六大类常见项目

### 安装方法

#### 方式一：通过 Proma Agent 安装（推荐）

在 Proma Agent 中直接对话：

```
帮我安装 TaskPilot 任务拆解 Skill
```

Agent 会自动下载并配置到当前工作区。

#### 方式二：手动安装

1. 下载 Skill 文件：[task-decomposition-skill.md](https://github.com/YUANXICHE98/TaskPilot/blob/main/proma-skill/task-decomposition-skill.md)

2. 复制文件内容

3. 在 Proma Agent 中对话：
   ```
   帮我添加一个新的 Skill，名称是"任务拆解"，描述是"将复杂项目智能拆解为多 Agent 可执行的任务树"
   ```

4. 将 Skill 内容粘贴给 Agent

### 使用示例

**示例 1：快速拆解**
```
使用任务拆解 Skill，帮我快速拆解一个"开发个人博客系统"的项目
```

**示例 2：使用模板**
```
使用任务拆解 Skill，我想做一个 AI SaaS MVP，使用 SaaS MVP 模板，详细模式
```

**示例 3：深度拆解**
```
使用任务拆解 Skill，深度拆解"多 Agent 编排系统"项目，需要包含技术调研、架构设计、核心开发、测试部署全流程
```

### 详细文档

完整使用指南请查看：[任务拆解 Skill 文档](./task-decomposition.md)

---

## 贡献你的 Skill

欢迎贡献你的 Skill 到 Proma 社区！

### 贡献步骤

1. Fork [Proma 仓库](https://github.com/ErlichLiu/Proma)
2. 在 `docs/skills/` 目录下创建你的 Skill 文档
3. 在本文件中添加你的 Skill 介绍
4. 提交 PR

### Skill 文档规范

Skill 文档应包含以下内容：

```markdown
# [Skill 名称]

[简短描述]

## 功能特性

- 功能 1
- 功能 2
- ...

## 安装方法

### 方式一：通过 Proma Agent 安装
...

### 方式二：手动安装
...

## 使用示例

...

## 贡献

- 作者：[你的 GitHub 用户名]
- 项目：[相关项目链接]
- License：[许可证]
```

### PR 赠金计划

Proma 设有 PR 赠金计划，对合并的 PR 自动给予慷慨的赠金，支持在 Claude Code 等产品中使用。提交 PR 时请在描述中留下你的邮箱信息即可。

---

## License

所有社区贡献的 Skills 遵循各自声明的开源许可证。
