import { describe, expect, test } from 'bun:test'
import { normalizeLatexDelimiters } from './normalize-latex'

describe('normalizeLatexDelimiters', () => {
  test('转换行内公式 \\(...\\) → $...$', () => {
    expect(normalizeLatexDelimiters('设主观价值为 \\(u_i\\)。')).toBe('设主观价值为 $u_i$。')
  })

  test('转换块级公式 \\[...\\] → $$...$$', () => {
    expect(normalizeLatexDelimiters('\\[ EV = \\sum p_i u_i \\]')).toBe('$$ EV = \\sum p_i u_i $$')
  })

  test('支持跨行块级公式', () => {
    const input = '\\[\n  EV = \\sum p_i u_i\n\\]'
    expect(normalizeLatexDelimiters(input)).toBe('$$\n  EV = \\sum p_i u_i\n$$')
  })

  test('同一段文本中行内 + 块级混用', () => {
    const input = '稀有度为 \\(i\\)，公式为 \\[ EV = \\sum p_i u_i \\]'
    expect(normalizeLatexDelimiters(input)).toBe('稀有度为 $i$，公式为 $$ EV = \\sum p_i u_i $$')
  })

  test('保留已有的 $...$ / $$...$$ 不被改写', () => {
    expect(normalizeLatexDelimiters('已有 $x$ 与 $$y$$')).toBe('已有 $x$ 与 $$y$$')
  })

  test('跳过 inline code 内的字面量', () => {
    const input = '示例：`\\(x\\)` 不应被替换，但 \\(y\\) 要替换。'
    expect(normalizeLatexDelimiters(input)).toBe('示例：`\\(x\\)` 不应被替换，但 $y$ 要替换。')
  })

  test('跳过 fenced code block 内的字面量', () => {
    const input = '```tex\n\\[ a + b \\]\n```\n外面 \\(c\\) 要替换'
    expect(normalizeLatexDelimiters(input)).toBe('```tex\n\\[ a + b \\]\n```\n外面 $c$ 要替换')
  })

  test('完全不含目标分隔符时原样返回（快路径）', () => {
    const input = '普通文本，含 $x$ 和 ```code```'
    expect(normalizeLatexDelimiters(input)).toBe(input)
  })

  test('空字符串安全', () => {
    expect(normalizeLatexDelimiters('')).toBe('')
  })

  test('未配对的 \\[ 不会吞掉后续文本', () => {
    // 只有左分隔符没有右分隔符时，非贪婪正则匹配失败，原样保留
    const input = '半句 \\[ 不完整'
    expect(normalizeLatexDelimiters(input)).toBe('半句 \\[ 不完整')
  })

  test('多个公式独立替换，不会跨公式吞噬', () => {
    const input = '\\[A\\] 中间 \\[B\\]'
    expect(normalizeLatexDelimiters(input)).toBe('$$A$$ 中间 $$B$$')
  })

  test('inline code 紧邻文本时保护后位置恢复正确', () => {
    const input = 'aaa`x`bbb \\(y\\) ccc'
    expect(normalizeLatexDelimiters(input)).toBe('aaa`x`bbb $y$ ccc')
  })
})
