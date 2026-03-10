# TaskPilot Skill 使用指南

> 🎯 **基于**: [TaskPilot by YUANXICHE98](https://github.com/YUANXICHE98/TaskPilot)
> 📧 **作者**: cyxhappy9858@163.com
> 📅 **创建时间**: 2026-03-10

## ✅ 已完成

1. ✅ 创建了 TaskPilot Skill (`skills/taskpilot/SKILL.md`)
2. ✅ 集成了 Proma Task 系统（自动显示在侧边栏）
3. ✅ 支持动态增删改查任务
4. ✅ 标注了原生 TaskPilot 项目来源

## 🚀 立即使用

### 方式 1: 通过 Skill 命令（推荐）
```
/taskpilot
```

然后描述你的项目，例如：
```
我想做一个在线教育平台，需要视频播放、课程管理和支付功能
```

### 方式 2: 直接对话
直接告诉 Proma Agent：
```
帮我用 TaskPilot 拆解一个电商网站项目
```

## 📋 功能演示

### 示例 1: 创建博客系统

**用户输入**:
```
我想做一个技术博客，支持 Markdown 和代码高亮
```

**TaskPilot 会自动**:
1. 询问技术栈偏好（React/Vue/Next.js）
2. 拆解为 10-15 个原子任务
3. 使用 `TaskCreate` 创建所有任务
4. 设置任务依赖关系
5. 任务自动显示在 Proma 侧边栏

**侧边栏效果**:
```
📋 任务列表
├─ ✅ [1] 初始化 Next.js 项目
├─ ⏳ [2] 设计数据库 Schema (进行中)
├─ ⏸️ [3] 实现 Markdown 编辑器
├─ ⏸️ [4] 开发文章 API
└─ ⏸️ [5] 添加代码高亮功能
```

### 示例 2: 动态管理任务

**标记任务完成**:
```
任务 2 已经完成了
```
→ TaskPilot 会调用 `TaskUpdate({ taskId: "2", status: "completed" })`

**添加新任务**:
```
我还想加一个评论功能
```
→ TaskPilot 会创建新任务并设置依赖关系

**查看所有任务**:
```
显示当前所有任务
```
→ TaskPilot 会调用 `TaskList()` 并格式化输出

## 🎯 核心特性

### 1. 智能任务拆解
- **原子化**: 每个任务 1-4 小时可完成
- **依赖管理**: 自动识别前置依赖
- **优先级**: 标注关键路径

### 2. Agent 匹配推荐
为每个任务推荐最适合的工具：
- 代码编写 → Cursor / Claude Code
- UI 设计 → Midjourney / Figma
- 文档撰写 → Claude / GPT-4
- 数据分析 → Python + Pandas

### 3. 侧边栏 TODO 集成
- ✅ 自动显示在 Proma 侧边栏
- ✅ 实时同步状态
- ✅ 支持拖拽排序（如果 Proma 支持）
- ✅ 点击跳转到相关文件

### 4. 动态管理
- ➕ 随时添加新任务
- ✏️ 修改任务描述
- 🗑️ 删除不需要的任务
- 🔄 调整依赖关系

## 📊 与原生 TaskPilot 的对比

| 功能 | 原生 TaskPilot | Proma Skill 版本 |
|------|---------------|-----------------|
| 任务拆解算法 | ✅ | ✅ |
| Agent 匹配推荐 | ✅ | ✅ |
| 桌面应用 | ✅ | ❌ |
| 本地存储 | ✅ (~/.taskpilot/) | ✅ (Proma Task 系统) |
| 侧边栏显示 | ✅ | ✅ |
| 动态增删改 | ✅ | ✅ |
| 与 AI Agent 集成 | 部分 | ✅ (深度集成) |
| 跨项目管理 | ✅ | ✅ (通过工作区) |

## 🔧 高级用法

### 批量创建任务
```
帮我为这个项目创建完整的任务列表：
- 前端: React + TypeScript
- 后端: FastAPI + PostgreSQL
- 部署: Docker + AWS
```

### 查看项目进度
```
显示当前项目的完成进度
```

### 识别阻塞任务
```
哪些任务阻塞了其他任务？
```

### 推荐下一步
```
我应该先做哪个任务？
```

## 🎁 贡献到 Proma

### 当前状态
- ✅ Skill 已创建，可以立即使用
- ⏳ 准备提交 PR 到 Proma 官方仓库

### PR 计划
1. **Fork Proma 仓库** (已完成)
2. **创建功能分支** `feature/taskpilot-skill`
3. **提交 Skill 文件** 到 `docs/community-skills/taskpilot/`
4. **更新文档** 在 README 中添加说明
5. **提交 PR** 到 `ErlichLiu/Proma`

### PR 描述草稿
```markdown
## 新增 TaskPilot Skill - 智能项目任务拆解

### 功能
- 将复杂项目拆解为可管理的任务树
- 自动创建 Proma TODO 列表（侧边栏显示）
- 智能 Agent 匹配推荐
- 支持动态任务管理（增删改查）

### 基于
原生项目: https://github.com/YUANXICHE98/TaskPilot

### 测试
- ✅ 已在本地工作区测试
- ✅ 支持多种项目类型（Web/移动/数据分析）
- ✅ 与 Proma Task 系统完美集成

### 作者
cyxhappy9858@163.com
```

## 📝 待办事项

- [ ] 在 Proma 项目中创建 PR
- [ ] 添加更多示例项目模板
- [ ] 支持从 TaskPilot 桌面应用导入任务
- [ ] 添加任务时间估算功能
- [ ] 集成 GitHub Issues 同步

## 🤝 反馈与改进

如果你在使用过程中有任何建议，欢迎：
1. 在 TaskPilot 原项目提 Issue
2. 在 Proma 项目提 Issue
3. 直接联系作者: cyxhappy9858@163.com

---

**立即开始**: 在 Proma 中输入 `/taskpilot` 或直接描述你的项目！
