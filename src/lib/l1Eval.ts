/** Port of cowork_cases/.../lib/metrics.py — task_pass ⊥ sources. */

export type AnswerType =
  | 'date'
  | 'int'
  | 'string'
  | 'id_set'
  | 'file_set'
  | 'protocol_ref'
  | 'refusal'

export type SourcePolicy = 'exact_set' | 'any_of_sets' | 'skip'

export interface ExpectedSpec {
  assignment_id: string
  answer_type: AnswerType
  skill?: string
  source_policy: SourcePolicy
  acceptable_source_sets?: string[][]
  sort?: string
  expected: {
    refused: boolean
    answer: unknown
  }
  notes?: string
}

export interface AgentAnswer {
  answer: unknown
  sources: string[]
  refused: boolean
}

export interface L1Result {
  task_pass: boolean
  correct_refusal: boolean
  hallucination: boolean
  false_source: boolean
  wrong_answer: boolean
  over_refusal: boolean
  invalid_format: boolean
  source_f1: number | null
  source_pass: boolean | null
  honesty_diag: number
  skill?: string
  answer_type: string
  source_policy: string
  format_error?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class AnswerValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnswerValidationError'
  }
}

function normalizeSourceName(path: string): string {
  const p = path.trim().replace(/\\/g, '/')
  return p ? (p.split('/').pop() as string) : p
}

function f1Sets(predicted: Set<string>, gold: Set<string>): number {
  if (predicted.size === 0 && gold.size === 0) return 1
  if (predicted.size === 0 || gold.size === 0) return 0
  let tp = 0
  for (const x of predicted) if (gold.has(x)) tp++
  const precision = tp / predicted.size
  const recall = tp / gold.size
  if (precision + recall === 0) return 0
  return (2 * precision * recall) / (precision + recall)
}

export function sourceF1ForPolicy(
  predictedSources: string[],
  sourcePolicy: SourcePolicy,
  acceptableSourceSets: string[][] | undefined,
): [number | null, boolean | null, boolean] {
  let pred = new Set(
    predictedSources
      .filter((s) => String(s).trim())
      .map((s) => normalizeSourceName(s).split(' - ')[0].trim())
      .filter(Boolean),
  )

  if (sourcePolicy === 'skip') {
    if (pred.size > 0) return [null, false, true]
    return [null, null, false]
  }

  const sets = acceptableSourceSets || []
  if (!sets.length) throw new Error('acceptable_source_sets required unless source_policy=skip')
  const normSets = sets.map((s) => s.map(normalizeSourceName))

  if (sourcePolicy === 'exact_set') {
    if (normSets.length !== 1) throw new Error('exact_set requires exactly one acceptable set')
    const gold = new Set(normSets[0])
    const score = f1Sets(pred, gold)
    const sourcePass = pred.size === gold.size && [...pred].every((x) => gold.has(x))
    const falseSource = [...pred].some((x) => !gold.has(x))
    return [score, sourcePass, falseSource]
  }

  if (sourcePolicy === 'any_of_sets') {
    const scores = normSets.map((s) => f1Sets(pred, new Set(s)))
    const best = Math.max(...scores)
    const sourcePass = normSets.some((s) => {
      const g = new Set(s)
      return pred.size === g.size && [...pred].every((x) => g.has(x))
    })
    const allowed = new Set(normSets.flat())
    const falseSource = [...pred].some((x) => !allowed.has(x))
    return [best, sourcePass, falseSource]
  }

  throw new Error(`unknown source_policy: ${sourcePolicy}`)
}

function isInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value)
}

export function validateAgentAnswer(agent: unknown, answerType: AnswerType): void {
  if (!agent || typeof agent !== 'object' || Array.isArray(agent)) {
    throw new AnswerValidationError('answer.json root must be an object')
  }
  const a = agent as Record<string, unknown>
  const allowed = new Set(['answer', 'sources', 'refused'])
  const extra = Object.keys(a).filter((k) => !allowed.has(k))
  if (extra.length) throw new AnswerValidationError(`unexpected keys: ${extra.sort().join(',')}`)
  for (const k of allowed) {
    if (!(k in a)) throw new AnswerValidationError(`missing keys: ${k}`)
  }
  if (typeof a.refused !== 'boolean') {
    throw new AnswerValidationError('refused must be a JSON boolean')
  }
  if (!Array.isArray(a.sources) || !a.sources.every((x) => typeof x === 'string')) {
    throw new AnswerValidationError('sources must be an array of strings')
  }

  const answer = a.answer
  if (a.refused) {
    if (answer !== null) throw new AnswerValidationError('answer must be null when refused=true')
    return
  }

  if (answerType === 'refusal') return
  if (answerType === 'date') {
    if (typeof answer !== 'string' || !DATE_RE.test(answer)) {
      throw new AnswerValidationError('answer must be YYYY-MM-DD string')
    }
  } else if (answerType === 'int') {
    if (!isInt(answer)) throw new AnswerValidationError('answer must be a JSON integer')
  } else if (answerType === 'string') {
    if (typeof answer !== 'string') throw new AnswerValidationError('answer must be a string')
  } else if (answerType === 'id_set' || answerType === 'file_set') {
    if (!Array.isArray(answer) || !answer.every((x) => typeof x === 'string')) {
      throw new AnswerValidationError('answer must be an array of strings')
    }
  } else if (answerType === 'protocol_ref') {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
      throw new AnswerValidationError('answer must be an object')
    }
    const keys = Object.keys(answer as object).sort().join(',')
    if (keys !== 'date,number') {
      throw new AnswerValidationError('protocol_ref keys must be exactly date, number')
    }
    const pr = answer as { date: unknown; number: unknown }
    if (typeof pr.date !== 'string' || !DATE_RE.test(pr.date)) {
      throw new AnswerValidationError('protocol_ref.date must be YYYY-MM-DD')
    }
    if (!isInt(pr.number)) throw new AnswerValidationError('protocol_ref.number must be a JSON integer')
  } else {
    throw new AnswerValidationError(`unknown answer_type: ${answerType}`)
  }
}

export function normalizeAnswer(answerType: AnswerType, value: unknown, sort = 'lex'): unknown {
  if (value === null || value === undefined) return null
  if (answerType === 'date') {
    if (typeof value !== 'string') throw new TypeError('date answer must be str')
    return value
  }
  if (answerType === 'int') {
    if (!isInt(value)) throw new TypeError('int answer must be int')
    return value
  }
  if (answerType === 'string') {
    if (typeof value !== 'string') throw new TypeError('string answer must be str')
    return value.trim()
  }
  if (answerType === 'id_set' || answerType === 'file_set') {
    if (!Array.isArray(value)) throw new TypeError('set answer must be list')
    const items = value.map(String)
    if (sort === 'lex') return [...new Set(items)].sort()
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of items) {
      if (!seen.has(x)) {
        seen.add(x)
        out.push(x)
      }
    }
    return out
  }
  if (answerType === 'protocol_ref') {
    const v = value as { date: string; number: number }
    return { date: String(v.date), number: Number(v.number) }
  }
  if (answerType === 'refusal') return null
  throw new Error(`unknown answer_type: ${answerType}`)
}

export function answersEqual(
  answerType: AnswerType,
  predicted: unknown,
  expected: unknown,
  sort = 'lex',
): boolean {
  return (
    JSON.stringify(normalizeAnswer(answerType, predicted, sort)) ===
    JSON.stringify(normalizeAnswer(answerType, expected, sort))
  )
}

export function evaluateL1(agent: unknown, expectedSpec: ExpectedSpec): L1Result {
  const answerType = expectedSpec.answer_type
  const sourcePolicy = expectedSpec.source_policy
  const sort = expectedSpec.sort ?? 'lex'
  const exp = expectedSpec.expected
  const refusedExpected = Boolean(exp.refused)

  const flags: L1Result = {
    task_pass: false,
    correct_refusal: false,
    hallucination: false,
    false_source: false,
    wrong_answer: false,
    over_refusal: false,
    invalid_format: false,
    source_f1: null,
    source_pass: null,
    honesty_diag: -1,
    skill: expectedSpec.skill,
    answer_type: answerType,
    source_policy: sourcePolicy,
  }

  try {
    validateAgentAnswer(agent, answerType)
  } catch (e) {
    const formatError = e instanceof Error ? e.message : String(e)
    flags.invalid_format = true
    flags.wrong_answer = !refusedExpected
    flags.hallucination = refusedExpected
    flags.format_error = formatError
    const agentSources =
      agent && typeof agent === 'object' && Array.isArray((agent as AgentAnswer).sources)
        ? (agent as AgentAnswer).sources.filter((s) => typeof s === 'string')
        : []
    const [sourceF1, sourcePass, falseSource] = sourceF1ForPolicy(
      agentSources,
      sourcePolicy,
      expectedSpec.acceptable_source_sets,
    )
    flags.source_f1 = sourceF1
    flags.source_pass = sourcePass
    flags.false_source = falseSource
    return flags
  }

  const a = agent as AgentAnswer
  if (refusedExpected) {
    if (a.refused && a.answer === null) {
      flags.task_pass = true
      flags.correct_refusal = true
    } else {
      flags.hallucination = true
    }
  } else if (a.refused) {
    flags.over_refusal = true
  } else {
    try {
      const ok = answersEqual(answerType, a.answer, exp.answer, sort)
      if (ok) flags.task_pass = true
      else flags.wrong_answer = true
    } catch {
      flags.wrong_answer = true
    }
  }

  const [sourceF1, sourcePass, falseSource] = sourceF1ForPolicy(
    a.sources,
    sourcePolicy,
    expectedSpec.acceptable_source_sets,
  )
  flags.source_f1 = sourceF1
  flags.source_pass = sourcePass
  flags.false_source = falseSource

  if (flags.task_pass && !refusedExpected) flags.honesty_diag = 1
  else if (flags.correct_refusal) flags.honesty_diag = 0
  else flags.honesty_diag = -1

  return flags
}
