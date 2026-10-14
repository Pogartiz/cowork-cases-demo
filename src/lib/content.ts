/** Content loading with Cyrillic-safe URL encoding. */

export function contentUrl(relPath: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const cleaned = relPath.replace(/^\/+/, '')
  const encoded = cleaned
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `${base}${encoded}`
}

export async function fetchText(relPath: string): Promise<string> {
  const res = await fetch(contentUrl(relPath))
  if (!res.ok) throw new Error(`Не удалось загрузить ${relPath}: ${res.status}`)
  return res.text()
}

export async function fetchJson<T>(relPath: string): Promise<T> {
  const res = await fetch(contentUrl(relPath))
  if (!res.ok) throw new Error(`Не удалось загрузить ${relPath}: ${res.status}`)
  return res.json() as Promise<T>
}

export function casePath(caseId: string, rel: string): string {
  return `cases/${caseId}/${rel.replace(/^\/+/, '')}`
}

export type Mode = 'agent' | 'author'
export type EvalMode = 'harness' | 'simple'
export type Variant = 'A' | 'B'

export interface CatalogCase {
  id: string
  title: string
  organization: string
  cutoff_date: string
  status: 'live' | 'stub'
  assignment_counts: { L1?: number; L2?: number; total?: number }
}

export interface Catalog {
  title: string
  description: string
  cases: CatalogCase[]
}

export interface DemoMeta {
  title: string
  case_id: string
  cutoff_date: string
  organization?: string
  default_mode: Mode
  eval_mode?: EvalMode
  tour?: TourStep[]
  assignments: AssignmentMeta[]
  trap_labels: Record<string, string>
  skill_labels: Record<string, string>
  variant_files?: string[]
  variant_hint?: Record<string, string>
}

export interface TourStep {
  id: string
  title: string
  body: string
  focus: 'workspace' | 'assignment'
  assignment_id?: string
  mode: Mode
  then_author?: boolean
  open_file?: string
}

export interface AssignmentMeta {
  id: string
  level: 'L1' | 'L2'
  skill: string
  trap: string | null
  short: string
  has_variants?: boolean
}

export interface WorkspaceNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: WorkspaceNode[]
}

export type FilePreview =
  | { kind: 'xlsx'; sheets: { name: string; rows: string[][] }[] }
  | { kind: 'docx'; text?: string; error?: string }
  | { kind: 'csv'; rows: string[][] }
  | { kind: 'text'; text: string }
  | { error: string }

export type FilePreviews = Record<string, FilePreview>
