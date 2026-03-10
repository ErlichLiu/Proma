/**
 * TodoListPanel — 独立的任务列表面板
 *
 * 功能：
 * - 显示所有任务（长期/短期分组）
 * - 创建、编辑、删除、完成任务
 * - 拖拽排序
 * - 任务分级（父任务/子任务）
 */

import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Plus, Check, Circle, ChevronRight, ChevronDown, MoreHorizontal, Trash2, Edit2, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { currentAgentSessionIdAtom } from '@/atoms/agent-atoms'

interface Task {
  id: string
  subject: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  type: 'short-term' | 'long-term'
  parentId?: string
  createdAt: number
  updatedAt: number
}

// 模拟任务数据（后续集成真实的 Task 系统）
const mockTasks: Task[] = [
  {
    id: '1',
    subject: '实现批量权限管理',
    description: '一键勾选允许/拒绝多个权限请求',
    status: 'in_progress',
    priority: 'P0',
    type: 'short-term',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
  },
  {
    id: '2',
    subject: '开发 TodoList 功能',
    description: '侧边栏显示任务列表，支持拖拽排序',
    status: 'in_progress',
    priority: 'P0',
    type: 'short-term',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
  },
  {
    id: '3',
    subject: '构建 MCP Server 市场',
    description: '类似 VS Code 扩展市场，一键安装 MCP Servers',
    status: 'pending',
    priority: 'P1',
    type: 'long-term',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
  {
    id: '4',
    subject: '实现代码追踪功能',
    description: '实时显示 Agent 执行的代码和命令',
    status: 'pending',
    priority: 'P1',
    type: 'long-term',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
]

export function TodoListPanel(): React.ReactElement {
  const sessionId = useAtomValue(currentAgentSessionIdAtom)
  const [tasks, setTasks] = React.useState<Task[]>(mockTasks)
  const [newTaskInput, setNewTaskInput] = React.useState('')
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set(['short-term', 'long-term']))

  // 按类型分组
  const shortTermTasks = tasks.filter((t) => t.type === 'short-term')
  const longTermTasks = tasks.filter((t) => t.type === 'long-term')

  // 切换分组展开/收起
  const toggleGroup = (group: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  // 创建新任务
  const handleCreateTask = (): void => {
    if (!newTaskInput.trim()) return

    const newTask: Task = {
      id: Date.now().toString(),
      subject: newTaskInput.trim(),
      description: '',
      status: 'pending',
      priority: 'P2',
      type: 'short-term',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    setTasks((prev) => [newTask, ...prev])
    setNewTaskInput('')
  }

  // 切换任务状态
  const toggleTaskStatus = (taskId: string): void => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: t.status === 'completed' ? 'pending' : 'completed',
              updatedAt: Date.now(),
            }
          : t
      )
    )
  }

  // 删除任务
  const deleteTask = (taskId: string): void => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部：新建任务输入框 */}
      <div className="flex-shrink-0 p-3 border-b">
        <div className="flex items-center gap-2">
          <Input
            placeholder="添加新任务..."
            value={newTaskInput}
            onChange={(e) => setNewTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreateTask()
              }
            }}
            className="flex-1 h-8 text-xs"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleCreateTask}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto">
        {/* 短期任务 */}
        <TaskGroup
          title="短期任务"
          groupKey="short-term"
          tasks={shortTermTasks}
          expanded={expandedGroups.has('short-term')}
          onToggle={() => toggleGroup('short-term')}
          onToggleStatus={toggleTaskStatus}
          onDelete={deleteTask}
        />

        {/* 长期任务 */}
        <TaskGroup
          title="长期任务"
          groupKey="long-term"
          tasks={longTermTasks}
          expanded={expandedGroups.has('long-term')}
          onToggle={() => toggleGroup('long-term')}
          onToggleStatus={toggleTaskStatus}
          onDelete={deleteTask}
        />
      </div>

      {/* 底部统计 */}
      <div className="flex-shrink-0 px-3 py-2 border-t text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>
            {tasks.filter((t) => t.status === 'completed').length} / {tasks.length} 已完成
          </span>
          <span>
            {tasks.filter((t) => t.status === 'in_progress').length} 进行中
          </span>
        </div>
      </div>
    </div>
  )
}

// ===== 任务分组组件 =====

interface TaskGroupProps {
  title: string
  groupKey: string
  tasks: Task[]
  expanded: boolean
  onToggle: () => void
  onToggleStatus: (taskId: string) => void
  onDelete: (taskId: string) => void
}

function TaskGroup({
  title,
  groupKey,
  tasks,
  expanded,
  onToggle,
  onToggleStatus,
  onDelete,
}: TaskGroupProps): React.ReactElement {
  return (
    <div className="border-b">
      {/* 分组标题 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium text-foreground/70">{title}</span>
        <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
      </button>

      {/* 任务列表 */}
      {expanded && (
        <div className="pb-2">
          {tasks.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground/50">
              暂无任务
            </div>
          ) : (
            tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleStatus={onToggleStatus}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ===== 任务项组件 =====

interface TaskItemProps {
  task: Task
  onToggleStatus: (taskId: string) => void
  onDelete: (taskId: string) => void
}

function TaskItem({ task, onToggleStatus, onDelete }: TaskItemProps): React.ReactElement {
  const [isHovered, setIsHovered] = React.useState(false)

  const statusIcon = task.status === 'completed' ? (
    <Check className="size-3.5 text-green-500" />
  ) : task.status === 'in_progress' ? (
    <Circle className="size-3.5 text-blue-500 fill-blue-500/20" />
  ) : (
    <Circle className="size-3.5 text-muted-foreground" />
  )

  const priorityColor = {
    P0: 'text-red-500',
    P1: 'text-orange-500',
    P2: 'text-yellow-500',
    P3: 'text-muted-foreground',
  }[task.priority]

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors',
        task.status === 'completed' && 'opacity-50'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 拖拽手柄 */}
      <button
        type="button"
        className={cn(
          'flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      >
        <GripVertical className="size-3.5 text-muted-foreground" />
      </button>

      {/* 状态图标 */}
      <button
        type="button"
        onClick={() => onToggleStatus(task.id)}
        className="flex-shrink-0"
      >
        {statusIcon}
      </button>

      {/* 任务标题 */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-xs truncate',
            task.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {task.subject}
        </div>
        {task.description && (
          <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
            {task.description}
          </div>
        )}
      </div>

      {/* 优先级标签 */}
      <span className={cn('text-[10px] font-medium flex-shrink-0', priorityColor)}>
        {task.priority}
      </span>

      {/* 操作菜单 */}
      <div
        className={cn(
          'flex-shrink-0 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => onToggleStatus(task.id)}
            >
              <Check className="size-3.5 mr-2" />
              {task.status === 'completed' ? '标记未完成' : '标记完成'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => {
                // TODO: 实现编辑功能
              }}
            >
              <Edit2 className="size-3.5 mr-2" />
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs text-destructive"
              onSelect={() => onDelete(task.id)}
            >
              <Trash2 className="size-3.5 mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
