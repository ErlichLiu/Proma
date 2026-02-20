import { describe, expect, it } from 'bun:test'
import { decideTitleTrigger } from './title-trigger'

describe('decideTitleTrigger', () => {
  it('queues title generation on real first message', () => {
    const decision = decideTitleTrigger({
      skipAutoTitle: false,
      messageCountBeforeSend: 0,
      content: 'hello world',
      alreadyTriggered: false,
    })
    expect(decision).toEqual({ shouldQueue: true, reason: 'should_queue' })
  })

  it('does not queue when skip flag is set (resend/edit path)', () => {
    const decision = decideTitleTrigger({
      skipAutoTitle: true,
      messageCountBeforeSend: 0,
      content: 'hello world',
      alreadyTriggered: false,
    })
    expect(decision.reason).toBe('skip_auto_title_option')
    expect(decision.shouldQueue).toBeFalse()
  })

  it('does not queue when not first message', () => {
    const decision = decideTitleTrigger({
      skipAutoTitle: false,
      messageCountBeforeSend: 3,
      content: 'hello world',
      alreadyTriggered: false,
    })
    expect(decision.reason).toBe('not_first_message')
    expect(decision.shouldQueue).toBeFalse()
  })

  it('does not queue for empty message', () => {
    const decision = decideTitleTrigger({
      skipAutoTitle: false,
      messageCountBeforeSend: 0,
      content: '   ',
      alreadyTriggered: false,
    })
    expect(decision.reason).toBe('empty_user_message')
    expect(decision.shouldQueue).toBeFalse()
  })

  it('does not queue duplicate first-turn attempts', () => {
    const decision = decideTitleTrigger({
      skipAutoTitle: false,
      messageCountBeforeSend: 0,
      content: 'hello world',
      alreadyTriggered: true,
    })
    expect(decision.reason).toBe('duplicate_first_turn_guard')
    expect(decision.shouldQueue).toBeFalse()
  })
})
