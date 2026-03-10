# TaskPilot 任务拆解 Skill

将复杂项目智能拆解为多 Agent 可执行的任务树，并为每个任务匹配最适合的 AI 工具。

## 功能特性

- **智能拆解** — 将复杂需求拆解成 2-5 层任务树
- **Agent 匹配** — 为每个任务推荐最适合的 AI 工具（Cursor/Claude/Midjourney/Perplexity 等）
- **Prompt 生成** — 为每个任务生成可直接使用的完整 Prompt 指令
- **三种模式** — 快速/详细/深度三档拆解深度
- **17 个模板** — 覆盖技术/电商/内容/Agent/教育/商业六大类常见项目

## 安装方法

### 方式一：通过 Proma Agent 安装（推荐）

在 Proma Agent 中直接对话：

```
帮我安装 TaskPilot 任务拆解 Skill
```

Agent 会自动下载并配置到当前工作区。

### 方式二：手动安装

1. 下载 Skill 文件：[task-decomposition-skill.md](https://github.com/YUANXICHE98/TaskPilot/blob/main/proma-skill/task-decomposition-skill.md)

2. 将文件内容复制到工作区配置：
   ```bash
   # 编辑工作区配置
   nano ~/.proma/workspaces/YOUR_WORKSPACE/config.json
   ```

3. 在 `skills` 数组中添加：
   ```json
   {
     "skills": [
       {
         "name": "task-decomposition",
         "description": "智能任务拆解 - 将复杂项目拆解为多 Agent 可执行的任务树",
         "content": "... (粘贴 Skill 内容) ..."
       }
     ]
   }
   ```

4. 重启 Proma 或重新加载工作区

## 使用示例

### 示例 1：快速拆解

**用户输入**：
```
使用任务拆解 Skill，帮我快速拆解一个"开发个人博客系统"的项目
```

**Agent 输出**：
```markdown
# 项目拆解：个人博客系统

## 阶段 1：需求分析与技术选型

### 任务 1.1: 功能需求梳理
- **推荐 Agent**: Claude
- **优先级**: 高
- **预计时间**: 1 小时
- **Prompt 指令**:
  作为产品经理，为个人博客系统梳理核心功能需求。包括：文章发布与管理、分类标签、评论系统、RSS 订阅、SEO 优化、响应式设计。输出 PRD 文档，包含功能清单、用户故事和验收标准。

### 任务 1.2: 技术栈选型
- **推荐 Agent**: Perplexity
- **优先级**: 高
- **预计时间**: 30 分钟
- **Prompt 指令**:
  调研 2024 年最流行的博客技术栈方案。对比：Next.js + MDX、Astro、Hugo、Gatsby。从性能、SEO、开发体验、生态三个维度评估，推荐最适合个人博客的方案。

## 阶段 2：UI 设计

### 任务 2.1: 设计系统搭建
- **推荐 Agent**: v0.dev
- **优先级**: 中
- **预计时间**: 2 小时
- **Prompt 指令**:
  创建博客设计系统。包含：配色方案（主色+辅助色+中性色）、字体选择（标题+正文）、间距系统、组件库（按钮/卡片/输入框）。风格：现代简约，适合技术博客。

...（继续拆解）
```

### 示例 2：使用模板

**用户输入**：
```
使用任务拆解 Skill，我想做一个 AI SaaS MVP，使用 SaaS MVP 模板，详细模式
```

**Agent 输出**：
```markdown
# 项目拆解：AI SaaS MVP（基于模板）

## 项目概述
- **项目类型**: AI SaaS MVP
- **目标**: 2 周内完成 MVP 并获取第一批用户
- **核心功能**: 用户系统 + API + 前端 + AI 功能 + 支付集成
- **推荐技术栈**: Next.js 14 + Prisma + PostgreSQL + Stripe

## 阶段 1：用户系统与认证

### 任务 1.1: 数据库设计
- **推荐 Agent**: Cursor
- **优先级**: 高
- **前置依赖**: 无
- **预计时间**: 2 小时
- **Prompt 指令**:
  作为数据库架构师，使用 Prisma ORM 设计 SaaS 用户系统数据模型。包含：User（用户基本信息）、Account（OAuth 账号）、Session（会话）、Subscription（订阅）、Usage（使用量统计）。要求：支持多租户、软删除、时间戳。输出 schema.prisma 文件。
- **产出物**: schema.prisma

### 任务 1.2: NextAuth.js 认证集成
- **推荐 Agent**: Cursor
- **优先级**: 高
- **前置依赖**: 任务 1.1
- **预计时间**: 3 小时
- **Prompt 指令**:
  作为全栈开发工程师，使用 NextAuth.js 实现认证系统。支持：邮箱密码登录、Google OAuth、GitHub OAuth。配置 Prisma Adapter，实现会话管理、JWT 签名、CSRF 保护。代码要求：TypeScript 严格模式，完整错误处理，安全最佳实践。
- **产出物**: app/api/auth/[...nextauth]/route.ts

...（继续拆解）
```

### 示例 3：深度拆解

**用户输入**：
```
使用任务拆解 Skill，深度拆解"多 Agent 编排系统"项目，需要包含技术调研、架构设计、核心开发、测试部署全流程
```

**Agent 输出**：
```markdown
# 项目拆解：多 Agent 编排系统（深度模式）

## 项目概述
- **复杂度**: 高
- **预计任务数**: 10-15 个
- **总预计时间**: 6-8 周
- **技术栈**: LangGraph + Dify + FastAPI + Redis + React

## 第一阶段：技术调研与方案设计（Week 1-2）

### 任务 1.1: 多 Agent 框架调研
- **推荐 Agent**: Perplexity
- **优先级**: 高
- **预计时间**: 4 小时
- **Prompt 指令**:
  作为 AI 技术研究员，深度调研 2024 年多 Agent 编排框架。对比：AutoGen、CrewAI、LangGraph、MetaGPT。从以下维度评估：
  1. 架构设计（DAG/状态机/Actor 模型）
  2. Agent 通信协议（同步/异步/消息队列）
  3. 可观测性（日志/追踪/监控）
  4. 社区活跃度和生态
  5. 生产环境案例
  输出对比报告，推荐最适合企业级应用的方案。
- **产出物**: multi-agent-framework-comparison.md

### 任务 1.2: 知识图谱本体建模
- **推荐 Agent**: Claude
- **优先级**: 高
- **前置依赖**: 任务 1.1
- **预计时间**: 6 小时
- **Prompt 指令**:
  作为知识工程师，为多 Agent 系统设计知识图谱本体。包含：
  1. 实体类型定义（Agent/Task/Tool/Resource/Event）
  2. 关系类型定义（depends_on/uses/produces/triggers）
  3. 属性定义（状态/优先级/时间戳/元数据）
  4. 推理规则（任务依赖传递/资源冲突检测）
  使用 OWL/RDF 标准，输出本体文件和可视化图。
- **产出物**: ontology.owl + ontology-diagram.png

### 任务 1.3: 系统架构设计
- **推荐 Agent**: Claude
- **优先级**: 高
- **前置依赖**: 任务 1.1, 1.2
- **预计时间**: 8 小时
- **Prompt 指令**:
  作为系统架构师，设计多 Agent 编排系统的完整架构。包含：
  1. 整体架构图（C4 Model - Context/Container/Component）
  2. Agent 通信协议设计（消息格式/序列化/版本控制）
  3. 任务调度策略（优先级队列/负载均衡/超时重试）
  4. 状态管理方案（Redis/PostgreSQL/内存）
  5. 可观测性设计（OpenTelemetry 集成）
  6. 安全设计（认证/授权/审计）
  输出架构文档 + Mermaid 图 + 技术选型说明。
- **产出物**: architecture.md + diagrams/

...（继续深度拆解，包含开发、测试、部署等所有阶段）
```

## 支持的 Agent 类型

| Agent | 适用场景 | 示例任务 |
|-------|---------|---------|
| **Cursor** | 代码编写、重构、调试 | 实现 API 接口、重构组件、修复 Bug |
| **Claude** | 文档撰写、需求分析、架构设计 | 编写 PRD、设计系统架构、技术方案 |
| **ChatGPT** | 通用问答、头脑风暴、文案创作 | 营销文案、产品命名、内容策划 |
| **Midjourney** | UI 设计、图标设计、视觉素材 | 设计 Logo、UI 原型、配图 |
| **Perplexity** | 技术调研、竞品分析、文献检索 | 技术选型、市场调研、论文检索 |
| **v0.dev** | 前端组件快速原型 | React 组件、页面布局、交互原型 |
| **ComfyUI** | 图像处理工作流 | 批量图片处理、风格迁移、图像增强 |
| **Dify** | 自动化工作流编排 | 多步骤自动化、数据处理流程 |

## 17 个内置模板

### 技术类（4 个）
1. **AI SaaS MVP** — 用户系统 + API + 前端 + 变现
2. **开源工具项目** — GitHub 开源 + CLI/SDK + 文档
3. **Chrome 插件** — Manifest V3 + Popup + 商店上架
4. **移动 App MVP** — 跨平台 App + 后端 + 上架

### 电商类（3 个）
5. **跨境电商独立站** — 建站 + 品牌 + 客服 + 运营
6. **国内电商运营** — 多平台运营 + 直播 + 供应链
7. **知识付费产品** — 课程/社群/咨询 + 交付体系

### 内容类（3 个）
8. **自媒体矩阵** — 多平台内容 + AI 生产 + 变现
9. **播客/音频节目** — 节目策划 + 录制 + 分发 + 变现
10. **技术博客与 SEO** — 博客搭建 + SEO + 技术写作

### Agent 类（3 个）
11. **多 Agent 系统** — 知识图谱 + 决策引擎 + 编排
12. **RAG 知识库** — 文档解析 + 向量检索 + 对话
13. **AI 客服机器人** — 意图识别 + 多轮对话 + 人工转接

### 教育类（2 个）
14. **在线课程** — 录制 + 平台 + 分销 + 社群
15. **编程训练营** — 课程体系 + 实战项目 + 就业服务

### 商业类（2 个）
16. **商业计划书** — 市场分析 + 财务模型 + 融资材料
17. **品牌策划** — 品牌定位 + 视觉设计 + 传播策略

## 拆解模式

### 快速模式（1-2 层）
- 适合：简单项目、快速验证
- 任务数：4-6 个
- 拆解深度：只拆解到主要阶段
- 示例：个人博客、简单工具

### 详细模式（2-3 层）
- 适合：中等复杂度项目
- 任务数：8-12 个
- 拆解深度：拆解到具体可执行任务
- 示例：SaaS MVP、电商独立站

### 深度模式（3-5 层）
- 适合：复杂项目、企业级应用
- 任务数：10-20 个
- 拆解深度：包含技术调研、架构设计、开发、测试、部署全流程
- 示例：多 Agent 系统、企业级平台

## 输出格式

每个任务包含以下信息：

```markdown
### 任务 X.Y: [任务名称]

- **描述**: [任务详细描述]
- **推荐 Agent**: [Agent 名称]
- **优先级**: [高/中/低]
- **预计时间**: [时间估算]
- **前置依赖**: [依赖的其他任务]
- **Prompt 指令**:
  ```
  [可直接复制使用的完整 Prompt]
  ```
- **产出物**: [任务完成后的交付物]
```

## 技术实现

本 Skill 基于 [TaskPilot](https://github.com/YUANXICHE98/TaskPilot) 项目的核心算法提取而来。

TaskPilot 是一个 Electron 桌面应用，提供可视化的任务拆解界面和流式输出体验。如果你需要更强大的功能（递归细化、任务模板库、导出 Markdown 等），可以下载完整版 TaskPilot。

## 贡献

本 Skill 由 [YUANXICHE98](https://github.com/YUANXICHE98) 贡献。

如果你有改进建议或发现问题，欢迎：
- 在 [TaskPilot 仓库](https://github.com/YUANXICHE98/TaskPilot) 提 Issue
- 在 [Proma 仓库](https://github.com/ErlichLiu/Proma) 提 PR

## License

AGPL-3.0 — 与 TaskPilot 和 Proma 保持一致
