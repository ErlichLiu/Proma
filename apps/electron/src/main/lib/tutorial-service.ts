/**
 * 教程服务
 *
 * 负责读取教程内容和创建欢迎对话。
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { createConversation, appendMessage, findSystemAssistantConversation } from './conversation-manager'
import { getConversationAttachmentsDir } from './config-paths'
import type { ConversationMeta, FileAttachment, ChatMessage } from '@proma/shared'

/**
 * 获取教程文件路径
 *
 * 开发模式：从 monorepo 根目录读取
 * 生产模式：从 extraResources 读取
 */
function getTutorialFilePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'tutorial.md')
  }
  // 开发模式：resources/ 经 build:resources 复制到 dist/resources/
  return join(__dirname, 'resources/tutorial.md')
}

/**
 * 读取教程内容
 *
 * @returns 教程 markdown 文本，读取失败返回 null
 */
export function getTutorialContent(): string | null {
  const filePath = getTutorialFilePath()

  if (!existsSync(filePath)) {
    console.warn('[教程服务] 教程文件不存在:', filePath)
    return null
  }

  try {
    return readFileSync(filePath, 'utf-8')
  } catch (error) {
    console.error('[教程服务] 读取教程文件失败:', error)
    return null
  }
}

/**
 * 获取 FAQ 文件路径
 */
function getFaqFilePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'faq.md')
  }
  return join(__dirname, 'resources/faq.md')
}

/**
 * 读取 FAQ 内容
 */
export function getFaqContent(): string | null {
  const filePath = getFaqFilePath()
  if (!existsSync(filePath)) {
    console.warn('[教程服务] FAQ 文件不存在:', filePath)
    return null
  }
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (error) {
    console.error('[教程服务] 读取 FAQ 文件失败:', error)
    return null
  }
}

/**
 * 获取或创建系统助手对话
 *
 * 如果该类型的系统助手对话已存在，直接返回；否则创建新对话并注入初始消息。
 */
export function ensureSystemAssistantConversation(
  type: 'onboarding' | 'troubleshoot',
): ConversationMeta | null {
  const existing = findSystemAssistantConversation(type)
  if (existing) return existing

  if (type === 'onboarding') {
    return createOnboardingConversation()
  } else {
    return createTroubleshootConversation()
  }
}

function createOnboardingConversation(): ConversationMeta | null {
  const tutorialContent = getTutorialContent()
  if (!tutorialContent) {
    console.warn('[教程服务] 无法读取教程内容，跳过创建冷启动向导对话')
    return null
  }

  try {
    const meta = createConversation('启动助手', undefined, undefined, 'onboarding')

    const attachmentId = randomUUID()
    const attachmentFilename = 'Proma 使用教程.md'
    const localPath = `${meta.id}/${attachmentId}.md`
    const dir = getConversationAttachmentsDir(meta.id)
    const fullPath = join(dir, `${attachmentId}.md`)
    const cleanedContent = tutorialContent.replace(/!\[.*?\]\(.*?\)\n*/g, '')
    writeFileSync(fullPath, cleanedContent, 'utf-8')

    const attachment: FileAttachment = {
      id: attachmentId,
      filename: attachmentFilename,
      mediaType: 'text/markdown',
      localPath,
      size: Buffer.byteLength(cleanedContent, 'utf-8'),
    }

    const now = Date.now()
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: '你好，我是 Proma 的新用户。这是完整的 Proma 使用教程，作为你的参考知识库。',
      createdAt: now,
      attachments: [attachment],
    }
    appendMessage(meta.id, userMessage)

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: `你好，欢迎来到 Proma！我是启动助手，帮你把 Proma 真正用起来。

---

**第一步：配置 AI 渠道和模型**

Proma 需要连接一个 AI 渠道才能工作。推荐新手从 **DeepSeek V4 Pro** 开始——性价比高，适合日常 Agent 任务。
点击左下角的设置按钮➡️立即订阅➡️付款完成

或者你也可以配置自己的APIKEY
配置方式：
1. 点击左下角的**设置**按钮（齿轮图标）
2. 进入 **渠道** 标签页
3. 点击「添加渠道」→ 选择 DeepSeek → 填入你的 API Key
4. 保存后，在底部模型选择器中选择 DeepSeek V4 Pro 作为默认模型

---

渠道配好之后，或者你已经配好了，直接告诉我下面几件事，我帮你做后续设置——**不需要等，随时可以回复**：

**1. 你的职业和日常工作是什么？**（比如产品、开发、运营、销售、设计……）

**2. 你日常用什么工具协作——飞书还是钉钉？**
Proma 可以直接接入，自动处理消息、任务和通知。

**3. 你最想把什么重复性工作交给 AI？**
比如：整理会议记录、分析数据报表、代码审查、写文案、做竞品调研……

说完之后我会帮你安装最适合的 Skills，并决定是在 Chat 模式里完成，还是切到 Agent 模式让 Proma 直接动手帮你做。`,
      createdAt: now + 1,
      model: 'Proma',
    }
    appendMessage(meta.id, assistantMessage)

    console.log(`[教程服务] 已创建冷启动向导对话: ${meta.id}`)
    return meta
  } catch (error) {
    console.error('[教程服务] 创建冷启动向导对话失败:', error)
    return null
  }
}

function createTroubleshootConversation(): ConversationMeta | null {
  const faqContent = getFaqContent()
  if (!faqContent) {
    console.warn('[教程服务] 无法读取 FAQ 内容，跳过创建问题排查助手对话')
    return null
  }

  try {
    const meta = createConversation('问题排查助手', undefined, undefined, 'troubleshoot')

    const attachmentId = randomUUID()
    const attachmentFilename = 'Proma 常见问题与解决方案.md'
    const localPath = `${meta.id}/${attachmentId}.md`
    const dir = getConversationAttachmentsDir(meta.id)
    const fullPath = join(dir, `${attachmentId}.md`)
    writeFileSync(fullPath, faqContent, 'utf-8')

    const attachment: FileAttachment = {
      id: attachmentId,
      filename: attachmentFilename,
      mediaType: 'text/markdown',
      localPath,
      size: Buffer.byteLength(faqContent, 'utf-8'),
    }

    const now = Date.now()
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: '你好，这是 Proma 的常见问题与解决方案文档，作为你的参考知识库。',
      createdAt: now,
      attachments: [attachment],
    }
    appendMessage(meta.id, userMessage)

    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: `你好！我是 Proma 问题排查助手，专门帮你解决使用过程中遇到的各种问题。

常见的问题类型包括：
- **网络与连接**：请求超时、API Key 无效、429 限流
- **对话问题**：生成中断、上下文丢失、回复慢
- **Skills 与工具**：Skill 没触发、MCP 连接失败
- **Agent 运行**：任务报错、定时任务不执行
- **安装与启动**：macOS/Windows 启动问题

**遇到了什么问题？** 直接描述症状就好，我会给你一步步的排查和解决方法。`,
      createdAt: now + 1,
      model: 'Proma',
    }
    appendMessage(meta.id, assistantMessage)

    console.log(`[教程服务] 已创建问题排查助手对话: ${meta.id}`)
    return meta
  } catch (error) {
    console.error('[教程服务] 创建问题排查助手对话失败:', error)
    return null
  }
}

/**
 * 创建一个预填教程内容的 Chat 对话：
 * 1. 创建对话
 * 2. 将教程文件保存为附件
 * 3. 追加 user 消息（携带教程附件）
 * 4. 追加 assistant 欢迎消息
 *
 * @returns 对话元数据，失败返回 null
 */
export function createWelcomeConversation(): ConversationMeta | null {
  const tutorialContent = getTutorialContent()
  if (!tutorialContent) {
    console.warn('[教程服务] 无法读取教程内容，跳过创建欢迎对话')
    return null
  }

  try {
    // 1. 创建对话
    const meta = createConversation('了解 Proma')

    // 2. 保存教程文件为附件
    const attachmentId = randomUUID()
    const attachmentFilename = 'Proma 使用教程.md'
    const localPath = `${meta.id}/${attachmentId}.md`
    const dir = getConversationAttachmentsDir(meta.id)
    const fullPath = join(dir, `${attachmentId}.md`)

    // 去掉图片标记，保留纯文本（图片在 Chat 上下文中无意义）
    const cleanedContent = tutorialContent.replace(/!\[.*?\]\(.*?\)\n*/g, '')
    writeFileSync(fullPath, cleanedContent, 'utf-8')

    const attachment: FileAttachment = {
      id: attachmentId,
      filename: attachmentFilename,
      mediaType: 'text/markdown',
      localPath,
      size: Buffer.byteLength(cleanedContent, 'utf-8'),
    }

    // 3. 追加 user 消息（携带教程附件作为 AI 的参考知识库）
    const now = Date.now()
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: '你好，我是 Proma 的新用户，希望快速上手。这是完整的使用教程，作为你的参考。',
      createdAt: now,
      attachments: [attachment],
    }
    appendMessage(meta.id, userMessage)

    // 4. 追加 assistant 欢迎消息（引导式对话：先了解用户，再生成个性化最佳实践）
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: `你好，欢迎来到 Proma！Proma 是一个通用的 Agent，其实它可以完成任何事，说实话这也挺难的，因为你要构建完整的工作环境才能做到，这会涉及到一些新的概念或者思考方式，不过别担心，我们做了很多设计可以帮助你靠谱稳定的越用越好用。

在介绍功能之前，想先认识一下你：

1. 怎么称呼你？
2. 你的职业或主要角色是什么？（比如独立开发者、产品经理、数据分析师、运营、学生……）
3. 你最近在做什么工作或项目？有哪些场景或痛点想交给 AI 帮忙？

了解你的背景之后，我会为你单独整理一份专属的 Proma 使用最佳实践——告诉你哪些功能最值得用、推荐的 Skills / MCP 配置，以及贴合你场景的工作流模板。

直接在下面回复就好，可以一次说完，也可以分几条慢慢聊。`,
      createdAt: now + 1,
      model: 'Proma',
    }
    appendMessage(meta.id, assistantMessage)

    console.log(`[教程服务] 已创建欢迎对话: ${meta.id}`)
    return meta
  } catch (error) {
    console.error('[教程服务] 创建欢迎对话失败:', error)
    return null
  }
}
