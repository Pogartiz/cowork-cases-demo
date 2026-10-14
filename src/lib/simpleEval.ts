/** Simplified L1 check for cases without harness-parity metrics (e.g. baf). */

export interface SimpleExpected {
  expected: {
    refused: boolean
    answer: unknown
  }
  answer_type?: string
  notes?: string
  acceptable_source_sets?: string[][]
  source_policy?: string
  expected_by_variant?: Record<string, { refused: boolean; answer: unknown }>
}

export interface SimpleResult {
  task_pass: boolean
  note: string
  detail?: string
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

export function resolveExpected(
  spec: SimpleExpected,
  variant: 'A' | 'B',
): { refused: boolean; answer: unknown } {
  const by = spec.expected_by_variant
  if (by && by[variant]) return by[variant]
  return spec.expected
}

export function evaluateSimple(
  agent: { answer: unknown; sources: string[]; refused: boolean },
  gold: { refused: boolean; answer: unknown },
): SimpleResult {
  if (gold.refused) {
    if (agent.refused && agent.answer === null) {
      return { task_pass: true, note: 'корректный отказ (упрощённо)' }
    }
    return {
      task_pass: false,
      note: 'ожидался отказ',
      detail: 'Упрощённая сверка — не эквивалент Toolathlon task_pass.',
    }
  }
  if (agent.refused) {
    return {
      task_pass: false,
      note: 'лишний отказ',
      detail: 'Упрощённая сверка — не эквивалент Toolathlon task_pass.',
    }
  }
  const ok = stableStringify(agent.answer) === stableStringify(gold.answer)
  return {
    task_pass: ok,
    note: ok ? 'ответ совпал (упрощённо)' : 'ответ не совпал',
    detail: 'Упрощённая сверка JSON — не эквивалент Toolathlon task_pass.',
  }
}
