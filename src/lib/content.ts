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

export type Mode = 'agent' | 'author'

export interface DemoMeta {
  title: string
  case_id: string
  cutoff_date: string
  default_mode: Mode
  disclaimer: string
  tour: TourStep[]
  assignments: AssignmentMeta[]
  trap_labels: Record<string, string>
  skill_labels: Record<string, string>
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
}

export interface WorkspaceNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: WorkspaceNode[]
}

/** Static tree mirroring content/workspace (snapshot). */
export const WORKSPACE_TREE: WorkspaceNode = {
  name: 'workspace',
  path: '',
  type: 'dir',
  children: [
    {
      name: 'протоколы',
      path: 'протоколы',
      type: 'dir',
      children: Array.from({ length: 12 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0')
        return {
          name: `протокол_${n}.md`,
          path: `протоколы/протокол_${n}.md`,
          type: 'file' as const,
        }
      }),
    },
    { name: 'регламент.md', path: 'регламент.md', type: 'file' },
    {
      name: 'сканы',
      path: 'сканы',
      type: 'dir',
      children: [
        {
          name: 'скан_протокол_05.png',
          path: 'сканы/скан_протокол_05.png',
          type: 'file',
        },
      ],
    },
    { name: 'output', path: 'output', type: 'dir', children: [] },
  ],
}
