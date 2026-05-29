import { describe, expect, test } from 'bun:test'
import type {
  FeishuChatBinding,
  FeishuGroupInfo,
} from '@proma/shared'
import {
  isSingleUserGroupForSender,
  resolveGroupMessageAccess,
} from './group-message-policy'

const userId = 'ou_user'
const otherUserId = 'ou_other'
const botOpenId = 'ou_bot'

function groupInfo(memberIds: string[]): Pick<FeishuGroupInfo, 'members'> {
  return {
    members: memberIds.map((openId) => ({
      openId,
      name: openId,
    })),
  }
}

function binding(userIdValue: string): Pick<FeishuChatBinding, 'userId'> {
  return { userId: userIdValue }
}

describe('飞书群聊消息准入策略', () => {
  test('Given Session 镜像群 When 用户没有 at Bot Then 允许继续同一个 Agent 会话', () => {
    const access = resolveGroupMessageAccess({
      isSessionMirrorGroup: true,
      isBotMentioned: false,
      groupInfo: groupInfo([userId, otherUserId]),
      senderOpenId: userId,
    })

    expect(access).toEqual({ accepted: true, reason: 'session-mirror' })
  })

  test('Given 普通群聊 When 用户 at Bot Then 允许处理消息', () => {
    const access = resolveGroupMessageAccess({
      isSessionMirrorGroup: false,
      isBotMentioned: true,
      groupInfo: groupInfo([userId, otherUserId]),
      senderOpenId: userId,
    })

    expect(access).toEqual({ accepted: true, reason: 'bot-mentioned' })
  })

  test('Given 群里只有一个真实用户 When 该用户没有 at Bot Then 允许免 at 续聊', () => {
    const access = resolveGroupMessageAccess({
      isSessionMirrorGroup: false,
      isBotMentioned: false,
      groupInfo: groupInfo([userId, botOpenId]),
      senderOpenId: userId,
      botOpenId,
      binding: binding(userId),
    })

    expect(access).toEqual({ accepted: true, reason: 'single-user-group' })
  })

  test('Given 绑定用户不是发送者 When 两人群里没有 at Bot Then 拒绝处理', () => {
    expect(isSingleUserGroupForSender({
      groupInfo: groupInfo([userId]),
      senderOpenId: userId,
      binding: binding(otherUserId),
    })).toBe(false)
  })

  test('Given 多人普通群聊 When 用户没有 at Bot Then 需要 at 后才处理', () => {
    const access = resolveGroupMessageAccess({
      isSessionMirrorGroup: false,
      isBotMentioned: false,
      groupInfo: groupInfo([userId, otherUserId]),
      senderOpenId: userId,
      binding: binding(userId),
    })

    expect(access).toEqual({ accepted: false, reason: 'needs-mention' })
  })
})
