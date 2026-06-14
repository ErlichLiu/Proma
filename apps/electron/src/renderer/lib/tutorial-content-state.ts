export interface TutorialContentState {
  state: 'ready' | 'error'
  content: string
}

export function normalizeTutorialContentResult(content: string | null): TutorialContentState {
  if (content === null) {
    return {
      state: 'error',
      content: '',
    }
  }

  return {
    state: 'ready',
    content,
  }
}
