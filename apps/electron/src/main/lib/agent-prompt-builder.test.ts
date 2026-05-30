import { describe, expect, test } from 'bun:test'
import { buildBuiltinAgents, buildSystemPrompt, buildDynamicContext } from './agent-prompt-builder'
import type { PromaPermissionMode } from '@proma/shared'

describe('buildBuiltinAgents', () => {
  describe('when Claude is available', () => {
    test('should include model field for all agents', () => {
      const agents = buildBuiltinAgents(true)

      expect(agents['code-reviewer']).toHaveProperty('model', 'haiku')
      expect(agents['explorer']).toHaveProperty('model', 'haiku')
      expect(agents['researcher']).toHaveProperty('model', 'haiku')
    })

    test('should include all required fields', () => {
      const agents = buildBuiltinAgents(true)

      for (const agent of Object.values(agents)) {
        expect(agent).toHaveProperty('description')
        expect(agent).toHaveProperty('prompt')
        expect(agent).toHaveProperty('tools')
        expect(agent.description).toBeTruthy()
        expect(agent.prompt).toBeTruthy()
        expect(Array.isArray(agent.tools)).toBe(true)
        expect(agent.tools!.length).toBeGreaterThan(0)
      }
    })
  })

  describe('when Claude is not available', () => {
    test('should not include model field', () => {
      const agents = buildBuiltinAgents(false)

      expect(agents['code-reviewer']).not.toHaveProperty('model')
      expect(agents['explorer']).not.toHaveProperty('model')
      expect(agents['researcher']).not.toHaveProperty('model')
    })

    test('should still include all other required fields', () => {
      const agents = buildBuiltinAgents(false)

      for (const [name, agent] of Object.entries(agents)) {
        expect(agent).toHaveProperty('description')
        expect(agent).toHaveProperty('prompt')
        expect(agent).toHaveProperty('tools')
      }
    })
  })

  describe('agent definitions', () => {
    test('code-reviewer should have Read, Glob, Grep, Bash tools', () => {
      const agents = buildBuiltinAgents(true)
      expect(agents['code-reviewer']!.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash'])
    })

    test('explorer should have Read, Glob, Grep, Bash tools', () => {
      const agents = buildBuiltinAgents(true)
      expect(agents['explorer']!.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash'])
    })

    test('researcher should have Read, Glob, Grep, Bash, WebSearch, WebFetch tools', () => {
      const agents = buildBuiltinAgents(true)
      expect(agents['researcher']!.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'])
    })
  })
})

describe('buildSystemPrompt', () => {
  const baseContext = {
    sessionId: 'test-session-123',
    permissionMode: 'auto' as PromaPermissionMode,
    memoryEnabled: false,
  }

  describe('core sections', () => {
    test('should include Proma Agent header', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('# Proma Agent')
      expect(prompt).toContain('Claude Agent SDK')
    })

    test('should include tool usage guidelines', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 工具使用指南')
      expect(prompt).toContain('读取文件用 Read')
      expect(prompt).toContain('编辑已有文件用 Edit')
    })

    test('should include user information', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 用户信息')
    })
  })

  describe('SubAgent strategy section', () => {
    describe('when Claude is available', () => {
      test('should include model selection strategy', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: true })
        expect(prompt).toContain('## SubAgent 委派策略')
        expect(prompt).toContain('model')
        expect(prompt).toContain('haiku')
        expect(prompt).toContain('sonnet')
        expect(prompt).toContain('opus')
      })

      test('should list all builtin agents with default models', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: true })
        expect(prompt).toContain('**explorer**（默认 haiku）')
        expect(prompt).toContain('**researcher**（默认 haiku）')
        expect(prompt).toContain('**code-reviewer**（默认 haiku）')
      })

      test('should include typical workflow section', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: true })
        expect(prompt).toContain('### 典型工作流（复杂任务）')
        expect(prompt).toContain('委派 `explorer`')
        expect(prompt).toContain('委派 `researcher`')
        expect(prompt).toContain('委派 `code-reviewer`')
      })
    })

    describe('when Claude is not available', () => {
      test('should not include model selection strategy', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: false })
        expect(prompt).toContain('## SubAgent 委派策略')
        // 不应包含模型选择策略小节
        expect(prompt).not.toContain('### 模型选择策略')
        // 不应给 agent 标注默认模型
        expect(prompt).not.toContain('默认 haiku')
        expect(prompt).not.toContain('默认 sonnet')
      })

      test('should list builtin agents without model info', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: false })
        expect(prompt).toContain('**explorer**：')
        expect(prompt).toContain('**researcher**：')
        expect(prompt).toContain('**code-reviewer**：')
        expect(prompt).not.toContain('默认 haiku')
      })

      test('should warn about model parameter usage', () => {
        const prompt = buildSystemPrompt({ ...baseContext, claudeAvailable: false })
        expect(prompt).toContain('不要通过 `model` 参数指定模型别名')
      })
    })
  })

  describe('workspace information', () => {
    test('should include workspace info when provided', () => {
      const prompt = buildSystemPrompt({
        ...baseContext,
        workspaceName: 'test-workspace',
        workspaceSlug: 'test-slug',
      })
      expect(prompt).toContain('## 工作区')
      expect(prompt).toContain('test-workspace')
      expect(prompt).toContain('test-slug')
    })

    test('should not include workspace section when not provided', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).not.toContain('## 工作区')
    })
  })

  describe('uncertainty handling section', () => {
    test('should include guidance on using AskUserQuestion', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 不确定性处理')
      expect(prompt).toContain('AskUserQuestion')
    })
  })

  describe('plan mode section', () => {
    test('should specify plan file path', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 计划模式文件路径')
      expect(prompt).toContain('.context/plan/')
    })
  })

  describe('documentation output section', () => {
    test('should include CLAUDE.md guidance', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('### CLAUDE.md')
    })

    test('should include .context/ directory guidance', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('### .context/ 目录')
      expect(prompt).toContain('note.md')
      expect(prompt).toContain('todo.md')
    })
  })

  describe('task completion standards', () => {
    test('should include completion criteria', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 任务完成标准')
    })
  })

  describe('interaction norms', () => {
    test('should include interaction guidelines', () => {
      const prompt = buildSystemPrompt(baseContext)
      expect(prompt).toContain('## 交互规范')
    })
  })
})

describe('buildDynamicContext', () => {
  const baseContext = {
    workspaceName: 'test-workspace',
    workspaceSlug: 'test-workspace',
    agentCwd: '/test/cwd',
  }

  test('should include current time', () => {
    const context = buildDynamicContext(baseContext)
    expect(context).toContain('**当前时间:')
  })

  test('should include workspace state when workspaceName provided', () => {
    const context = buildDynamicContext(baseContext)
    expect(context).toContain('<workspace_state>')
    expect(context).toContain('工作区: test-workspace')
    expect(context).toContain('</workspace_state>')
  })

  test('should include working directory', () => {
    const context = buildDynamicContext(baseContext)
    expect(context).toContain('<working_directory>/test/cwd</working_directory>')
  })

  test('should handle missing workspace slug', () => {
    const context = buildDynamicContext({ agentCwd: '/test/cwd' })
    expect(context).toContain('<working_directory>')
    expect(context).not.toContain('<workspace_state>')
  })

  test('should include workspace state without cwd', () => {
    const context = buildDynamicContext({
      workspaceName: 'test-workspace',
      workspaceSlug: 'test-workspace',
    })
    expect(context).toContain('<workspace_state>')
    expect(context).not.toContain('<working_directory>')
  })
})

describe('integration: SubAgent metadata consistency', () => {
  test('builtin agents should match system prompt descriptions', () => {
    const agents = buildBuiltinAgents(true)
    const systemPrompt = buildSystemPrompt({
      sessionId: 'test',
      permissionMode: 'auto' as PromaPermissionMode,
      memoryEnabled: false,
      claudeAvailable: true,
    })

    // Verify all agent names appear in system prompt
    for (const name of Object.keys(agents)) {
      expect(systemPrompt).toContain(`**${name}**`)
    }
  })

  test('non-Claude mode should be consistent between agents and prompt', () => {
    const agents = buildBuiltinAgents(false)
    const systemPrompt = buildSystemPrompt({
      sessionId: 'test',
      permissionMode: 'auto' as PromaPermissionMode,
      memoryEnabled: false,
      claudeAvailable: false,
    })

    // Agents should not have model field
    for (const agent of Object.values(agents)) {
      expect(agent).not.toHaveProperty('model')
    }

    // System prompt should not mention model selection
    expect(systemPrompt).not.toContain('默认 haiku')
    expect(systemPrompt).not.toContain('默认 sonnet')
  })
})
