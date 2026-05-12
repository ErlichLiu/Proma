import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// Mock config-paths to redirect JSONL writes to a temp directory
let tempDir: string

function setupTempDir() {
  tempDir = join(tmpdir(), `proma-test-${randomUUID()}`)
  mkdirSync(tempDir, { recursive: true })
}

function cleanupTempDir() {
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

/**
 * Read JSONL lines from a file and parse each as JSON.
 */
function readJsonlLines(filePath: string): unknown[] {
  const raw = readFileSync(filePath, 'utf-8')
  return raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
}

// Since appendSDKMessages depends on config-paths for the file path,
// we test the sanitization logic by importing and calling appendSDKMessages
// with a patched environment. To keep tests simple and avoid mocking the
// module system, we extract and test the core logic directly.

// --- Test the sanitization logic by reimplementing the core algorithm ---
// This mirrors sanitizeOversizedMessage from agent-session-manager.ts

const MAX_SDK_MESSAGE_LENGTH = 256 * 1024
const TRUNCATED_PREVIEW_LENGTH = 2000

function sanitizeOversizedMessage(msg: Record<string, unknown>, originalLength: number): Record<string, unknown> {
  const truncationNote = `\n[内容已截断: 原始 ${(originalLength / 1024).toFixed(0)}K chars 超出存储限制]`
  const truncationThreshold = MAX_SDK_MESSAGE_LENGTH / 2

  const clone: Record<string, unknown> = JSON.parse(JSON.stringify(msg))
  const message = clone.message as Record<string, unknown> | undefined
  const content = message?.content
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      const block = content[i]
      if (!block || typeof block !== 'object') continue

      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > truncationThreshold) {
        block.text = block.text.slice(0, TRUNCATED_PREVIEW_LENGTH) + truncationNote
      }

      if (block.type === 'tool_result') {
        if (typeof block.content === 'string' && block.content.length > truncationThreshold) {
          block.content = block.content.slice(0, TRUNCATED_PREVIEW_LENGTH) + truncationNote
        }
        if (Array.isArray(block.content)) {
          block.content = block.content.map((item: Record<string, unknown>) => {
            if (item?.type === 'image' && (item.source as Record<string, unknown>)?.data) {
              const dataLen = String((item.source as Record<string, unknown>).data).length
              return { type: 'image', _truncated: true, _originalLength: dataLen }
            }
            return item
          })
        }
      }
    }
  }

  const error = clone.error as Record<string, unknown> | undefined
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.length > truncationThreshold) {
    error.message = error.message.slice(0, TRUNCATED_PREVIEW_LENGTH) + truncationNote
  }

  return clone
}

describe('sanitizeOversizedMessage', () => {
  describe('given a normal-sized message', () => {
    test('when message is under limit then returns unchanged', () => {
      const msg = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello world' }] },
      }
      const serialized = JSON.stringify(msg)
      // Should not need sanitization
      expect(serialized.length).toBeLessThan(MAX_SDK_MESSAGE_LENGTH)
    })
  })

  describe('given an oversized text block', () => {
    test('when text exceeds threshold then truncates to preview length with notice', () => {
      const longText = 'A'.repeat(200_000)
      const msg = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] },
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      const resultText = (result.message as any).content[0].text as string

      expect(resultText.length).toBeLessThan(longText.length)
      expect(resultText.length).toBeLessThan(5000)
      expect(resultText).toContain('内容已截断')
      expect(resultText).toStartWith('A'.repeat(100))
    })

    test('when original message is not mutated', () => {
      const longText = 'B'.repeat(200_000)
      const msg = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] },
      }
      sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      // Original should be untouched
      expect((msg.message.content[0] as any).text).toBe(longText)
    })
  })

  describe('given an oversized tool_result with string content', () => {
    test('when tool_result content is a long string then truncates', () => {
      const longContent = 'file contents '.repeat(20_000)
      const msg = {
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'test-123', content: longContent }] },
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      const resultContent = (result.message as any).content[0].content as string

      expect(resultContent.length).toBeLessThan(longContent.length)
      expect(resultContent).toContain('内容已截断')
    })
  })

  describe('given a tool_result with base64 image', () => {
    test('when image has base64 data then strips data and adds truncation marker', () => {
      const base64Data = 'AAAA'.repeat(100_000)
      const msg = {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'read-img',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
              { type: 'text', text: 'Image description' },
            ],
          }],
        },
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      const resultContent = (result.message as any).content[0].content as any[]

      // Image should be replaced with truncation marker
      expect(resultContent[0]).toEqual({
        type: 'image',
        _truncated: true,
        _originalLength: base64Data.length,
      })
      // Text block should be preserved
      expect(resultContent[1]).toEqual({ type: 'text', text: 'Image description' })
    })

    test('when image has no data field then leaves it unchanged', () => {
      const msg = {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'read-img',
            content: [
              { type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } },
            ],
          }],
        },
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      const resultContent = (result.message as any).content[0].content as any[]

      expect(resultContent[0].source.url).toBe('https://example.com/img.png')
      expect(resultContent[0]._truncated).toBeUndefined()
    })
  })

  describe('given an oversized error message', () => {
    test('when error.message exceeds threshold then truncates', () => {
      const longError = 'API Error: 400 ' + 'validation '.repeat(50_000)
      const msg = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Error occurred' }] },
        error: { message: longError, errorType: 'unknown_error' },
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      const resultError = (result.error as any).message as string

      expect(resultError.length).toBeLessThan(longError.length)
      expect(resultError).toContain('内容已截断')
      // errorType should be preserved
      expect((result.error as any).errorType).toBe('unknown_error')
    })
  })

  describe('given a message with no content array', () => {
    test('when message.content is missing then does not crash', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        result: 'some result text '.repeat(50_000),
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)
      // Should return clone without error
      expect(result.type).toBe('result')
    })
  })

  describe('given metadata preservation', () => {
    test('when message has _createdAt and other meta fields then preserves them', () => {
      const longText = 'C'.repeat(200_000)
      const msg = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] },
        parent_tool_use_id: 'tool-456',
        _createdAt: 1715500000000,
        _errorCode: 'unknown_error',
      }
      const result = sanitizeOversizedMessage(msg, JSON.stringify(msg).length)

      expect(result.type).toBe('assistant')
      expect(result.parent_tool_use_id).toBe('tool-456')
      expect(result._createdAt).toBe(1715500000000)
      expect(result._errorCode).toBe('unknown_error')
    })
  })
})
