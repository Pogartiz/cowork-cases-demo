import './style.css'
import {
  WORKSPACE_TREE,
  contentUrl,
  fetchJson,
  fetchText,
  type AssignmentMeta,
  type DemoMeta,
  type Mode,
  type TourStep,
  type WorkspaceNode,
} from './lib/content'
import { evaluateL1, type ExpectedSpec, type L1Result } from './lib/l1Eval'

type L2Preview = Record<
  string,
  {
    artifact?: string
    sheet?: string
    columns?: string[]
    rows?: Record<string, string>[]
    checklist?: string[]
    overdue?: { id: string; days_overdue: number; deadline: string }[]
    cancelled_ids?: string[]
    amended_ids?: string[]
    committee_summary?: {
      committee: string
      total: number
      overdue: number
      cancelled: number
    }[]
    status_counts?: Record<string, number>
    top5_overdue?: { id: string; days_overdue: number; deadline: string }[]
    slides?: number
  }
>

interface State {
  meta: DemoMeta
  mode: Mode
  selectedFile: string | null
  selectedAssignment: string | null
  sharedContext: string
  caseMd: string
  fileContent: string | null
  fileIsImage: boolean
  imageZoom: number
  taskMd: string | null
  expected: ExpectedSpec | null
  l2: L2Preview | null
  lastResult: L1Result | null
  tourActive: boolean
  tourIndex: number
  tourTriedL101: boolean
}

const app = document.querySelector<HTMLDivElement>('#app')!

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderTree(node: WorkspaceNode, selected: string | null, depth = 0): string {
  if (node.type === 'file') {
    return `<div class="tree-file ${selected === node.path ? 'active' : ''}" data-path="${esc(node.path)}" style="margin-left:${depth * 8}px">${esc(node.name)}</div>`
  }
  const kids = (node.children || []).map((c) => renderTree(c, selected, depth + 1)).join('')
  if (!node.path) return kids
  return `<details open style="margin-left:${depth * 4}px"><summary>${esc(node.name)}/</summary>${kids}</details>`
}

function answerTypeHint(t: string): string {
  switch (t) {
    case 'date':
      return 'Дата YYYY-MM-DD'
    case 'int':
      return 'Целое число'
    case 'string':
      return 'Строка (как в документах)'
    case 'id_set':
      return 'Список ID через запятую или с новой строки'
    case 'file_set':
      return 'Список имён файлов'
    case 'protocol_ref':
      return 'Дата протокола + номер'
    case 'refusal':
      return 'Ожидается отказ (refused)'
    default:
      return t
  }
}

function buildAgentPayload(
  answerType: string,
  refused: boolean,
  fields: Record<string, string>,
): unknown {
  const sources = (fields.sources || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (refused) {
    return { answer: null, sources, refused: true }
  }

  let answer: unknown
  if (answerType === 'date' || answerType === 'string') {
    answer = fields.answer?.trim() ?? ''
  } else if (answerType === 'int') {
    const n = Number(fields.answer)
    answer = Number.isInteger(n) && fields.answer.trim() !== '' ? n : fields.answer
  } else if (answerType === 'id_set' || answerType === 'file_set') {
    answer = (fields.answer || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (answerType === 'protocol_ref') {
    const num = Number(fields.number)
    answer = {
      date: fields.date?.trim() ?? '',
      number: Number.isInteger(num) ? num : fields.number,
    }
  } else {
    answer = fields.answer ?? null
  }

  return { answer, sources, refused: false }
}

function renderL1Form(state: State): string {
  const exp = state.expected
  if (!exp) return '<p class="muted">Эталон ещё не загружен…</p>'
  const t = exp.answer_type
  const hint = answerTypeHint(t)

  let fields = ''
  if (t === 'protocol_ref') {
    fields = `
      <label>Дата протокола<input type="text" name="date" placeholder="YYYY-MM-DD" /></label>
      <label>Номер протокола<input type="number" name="number" placeholder="5" /></label>`
  } else if (t === 'refusal') {
    fields = `<p class="muted">Для этого задания корректный исход — отказ. Отметьте «Отказ» ниже.</p>`
  } else if (t === 'id_set' || t === 'file_set') {
    fields = `<label>Ответ (${esc(hint)})<textarea name="answer" placeholder="Р-001&#10;Р-002"></textarea></label>`
  } else {
    fields = `<label>Ответ (${esc(hint)})<input type="text" name="answer" /></label>`
  }

  const result = state.lastResult
  let verdict = ''
  if (result) {
    const cls = result.task_pass ? 'pass' : 'fail'
    const title = result.task_pass ? 'Pass' : 'Fail'
    const reasons: string[] = []
    if (result.correct_refusal) reasons.push('корректный отказ')
    if (result.hallucination) reasons.push('галлюцинация на неотвечаемом')
    if (result.over_refusal) reasons.push('лишний отказ')
    if (result.wrong_answer) reasons.push('неверный ответ')
    if (result.invalid_format) reasons.push(`неверный формат${result.format_error ? ': ' + result.format_error : ''}`)
    const softParts: string[] = []
    if (result.source_f1 != null) softParts.push(`source_f1 = ${result.source_f1.toFixed(3)}`)
    if (result.source_pass != null) softParts.push(`source_pass = ${result.source_pass}`)
    if (result.false_source) softParts.push('false_source')
    softParts.push('sources не влияют на Pass/Fail')
    verdict = `<div class="verdict ${cls}"><strong>${title}</strong> — ${esc(reasons.join(', ') || 'ok')}
      <div class="soft">${esc(softParts.join(' · '))}</div></div>`
  }

  return `
    <form id="l1-form" class="form-grid">
      <p class="muted">Сверка как в харнессе: <code>task_pass</code> независим от sources.</p>
      ${fields}
      <label>Sources (необязательно для Pass)<textarea name="sources" placeholder="протокол_05.md"></textarea></label>
      <label class="row"><input type="checkbox" name="refused" /> Отказ (refused = true, answer = null)</label>
      <div class="row"><button class="btn primary" type="submit">Проверить</button></div>
    </form>
    ${verdict}`
}

function renderAuthorL1(state: State): string {
  if (state.mode !== 'author' || !state.expected) return ''
  const exp = state.expected
  const sources = (exp.acceptable_source_sets || [])
    .map((s, i) => `<li>набор ${i + 1}: ${esc(s.join(', '))}</li>`)
    .join('')
  return `<div class="author-box">
    <h3>Эталон (режим Автор)</h3>
    <pre class="markdown">${esc(JSON.stringify(exp.expected, null, 2))}</pre>
    <p><strong>answer_type:</strong> ${esc(exp.answer_type)} · <strong>source_policy:</strong> ${esc(exp.source_policy)}</p>
    ${sources ? `<p><strong>acceptable_source_sets</strong></p><ul>${sources}</ul>` : '<p class="muted">source_policy = skip</p>'}
    ${exp.notes ? `<p class="muted">${esc(exp.notes)}</p>` : ''}
  </div>`
}

function renderAuthorL2(state: State, id: string): string {
  if (state.mode !== 'author' || !state.l2 || !state.l2[id]) {
    return state.mode === 'agent'
      ? `<p class="muted">Переключитесь в «Автор», чтобы увидеть эталонную таблицу / чеклист артефакта.</p>`
      : ''
  }
  const p = state.l2[id]
  const checklist = (p.checklist || []).map((c) => `<li>${esc(c)}</li>`).join('')
  let table = ''
  if (p.columns && p.rows) {
    const head = p.columns.map((c) => `<th>${esc(c)}</th>`).join('')
    const body = p.rows
      .slice(0, 80)
      .map((r) => `<tr>${p.columns!.map((c) => `<td>${esc(String(r[c] ?? ''))}</td>`).join('')}</tr>`)
      .join('')
    table = `<div style="overflow:auto;max-height:360px;margin-top:8px"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
      ${p.rows.length > 80 ? `<p class="muted">Показаны первые 80 из ${p.rows.length} строк</p>` : ''}`
  }

  let extra = ''
  if (p.status_counts) {
    extra += `<p><strong>Счётчики:</strong> ${esc(JSON.stringify(p.status_counts))}</p>`
  }
  if (p.overdue) {
    extra += `<p><strong>Просроченные:</strong> ${esc(p.overdue.map((x) => `${x.id} (${x.days_overdue}д)`).join(', '))}</p>`
  }
  if (p.cancelled_ids) {
    extra += `<p><strong>Отменённые:</strong> ${esc(p.cancelled_ids.join(', ') || '—')}</p>`
  }
  if (p.amended_ids) {
    extra += `<p><strong>С переносом:</strong> ${esc(p.amended_ids.join(', ') || '—')}</p>`
  }
  if (p.committee_summary) {
    const rows = p.committee_summary
      .map(
        (c) =>
          `<tr><td>${esc(c.committee)}</td><td>${c.total}</td><td>${c.overdue}</td><td>${c.cancelled}</td></tr>`,
      )
      .join('')
    extra += `<table class="data"><thead><tr><th>Комитет</th><th>Всего</th><th>Просрочено</th><th>Отменено</th></tr></thead><tbody>${rows}</tbody></table>`
  }

  return `<div class="author-box">
    <h3>Эталон артефакта (режим Автор)</h3>
    <p><strong>Файл:</strong> ${esc(p.artifact || '')}${p.sheet ? ` · лист «${esc(p.sheet)}»` : ''}</p>
    <ul class="checklist">${checklist}</ul>
    ${table}
    ${extra}
  </div>`
}

function renderTour(state: State): string {
  if (!state.tourActive) return ''
  const step = state.meta.tour[state.tourIndex]
  const n = state.meta.tour.length
  const isLast = state.tourIndex >= n - 1
  return `<aside class="guide" id="guide" aria-label="Гид по кейсу">
    <div class="progress">Гид · шаг ${state.tourIndex + 1} из ${n}</div>
    <h2>${esc(step.title)}</h2>
    <p>${esc(step.body)}</p>
    <div class="row">
      <button class="btn" type="button" data-tour="skip">Закрыть гид</button>
      ${state.tourIndex > 0 ? `<button class="btn" type="button" data-tour="prev">Назад</button>` : ''}
      ${
        step.then_author && state.mode === 'agent'
          ? `<button class="btn primary" type="button" data-tour="author">Разобрать в Автор</button>`
          : ''
      }
      <button class="btn primary" type="button" data-tour="next">${isLast ? 'Готово' : 'Далее'}</button>
    </div>
  </aside>`
}

function render(state: State): void {
  const asg = state.meta.assignments.find((a) => a.id === state.selectedAssignment) || null
  const trapLabel =
    asg?.trap && state.mode === 'author' ? state.meta.trap_labels[asg.trap] : null
  const skillLabel = asg ? state.meta.skill_labels[asg.skill] || asg.skill : ''

  const filePanel = (() => {
    if (!state.selectedFile) {
      return `<div class="empty">Выберите файл в дереве слева</div>`
    }
    if (state.fileIsImage) {
      const src = contentUrl(`workspace/${state.selectedFile}`)
      return `
        <h2 class="viewer-title">${esc(state.selectedFile)}</h2>
        <div class="img-toolbar">
          <button class="btn" type="button" data-zoom="out">−</button>
          <button class="btn" type="button" data-zoom="reset">100%</button>
          <button class="btn" type="button" data-zoom="in">+</button>
          <a class="btn" href="${src}" target="_blank" rel="noreferrer">Открыть полностью</a>
        </div>
        <div class="img-wrap"><img id="scan-img" src="${src}" alt="${esc(state.selectedFile)}" style="width:${state.imageZoom * 100}%" /></div>`
    }
    return `<h2 class="viewer-title">${esc(state.selectedFile)}</h2><div class="markdown">${esc(state.fileContent || '')}</div>`
  })()

  const assignmentPanel = (() => {
    if (!asg) {
      return `<div class="empty">Выберите задание справа</div>`
    }
    const tags = `
      <div class="tags">
        <span class="tag skill">${esc(skillLabel)}</span>
        ${trapLabel ? `<span class="tag trap">${esc(trapLabel)}</span>` : ''}
        ${state.mode === 'author' && asg.trap === 'unanswerable' ? `<span class="tag trap">отказ</span>` : ''}
      </div>`
    const body = `
      <h2 class="viewer-title">${esc(asg.id)} · ${esc(asg.short)}</h2>
      ${tags}
      <div class="shared">${esc(state.sharedContext)}</div>
      <div class="markdown">${esc(state.taskMd || '')}</div>
      ${
        asg.level === 'L1'
          ? `${renderL1Form(state)}${renderAuthorL1(state)}`
          : `${renderAuthorL2(state, asg.id)}`
      }`
    return body
  })()

  app.classList.toggle('guide-open', state.tourActive)
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <h1>${esc(state.meta.title)}</h1>
        <div class="meta">Срез ${esc(state.meta.cutoff_date)} · демо пилота Cowork · snapshot</div>
      </div>
      <div class="top-actions">
        <span class="badge-mode ${state.mode}">${state.mode === 'agent' ? 'Агент' : 'Автор'}</span>
        <div class="mode-toggle" role="group" aria-label="Режим">
          <button type="button" data-mode="agent" class="${state.mode === 'agent' ? 'active' : ''}" data-mode-set="agent">Агент</button>
          <button type="button" data-mode="author" class="${state.mode === 'author' ? 'active' : ''}" data-mode-set="author">Автор</button>
        </div>
        <button class="btn" type="button" id="start-tour">Пройти гид</button>
      </div>
    </header>
    <div class="layout">
      <section class="panel">
        <div class="panel-h">Workspace</div>
        <div class="panel-b tree" id="tree">${renderTree(WORKSPACE_TREE, state.selectedFile)}</div>
      </section>
      <section class="panel">
        <div class="panel-h">
          <span>${state.selectedAssignment ? 'Задание' : 'Просмотр файла'}</span>
        </div>
        <div class="panel-b" id="main-pane">
          ${state.selectedAssignment ? assignmentPanel : filePanel}
        </div>
      </section>
      <section class="panel">
        <div class="panel-h">Задания <span class="muted">14</span></div>
        <div class="panel-b" id="asg-list">
          ${state.meta.assignments
            .map((a: AssignmentMeta) => {
              const skill = state.meta.skill_labels[a.skill] || a.skill
              const trap =
                state.mode === 'author' && a.trap ? state.meta.trap_labels[a.trap] : null
              return `<button type="button" class="asg-item ${state.selectedAssignment === a.id ? 'active' : ''}" data-asg="${esc(a.id)}">
                <span class="id">${esc(a.id)}</span>
                <span class="short">${esc(a.short)}</span>
                <span class="tags">
                  <span class="tag skill">${esc(skill)}</span>
                  ${trap ? `<span class="tag trap">${esc(trap)}</span>` : ''}
                </span>
              </button>`
            })
            .join('')}
        </div>
      </section>
    </div>
    ${state.mode === 'author' && !state.selectedAssignment ? `<section class="panel" style="max-width:1440px;margin:0 auto 24px;"><div class="panel-h">Заметки автора (case.md)</div><div class="panel-b markdown">${esc(state.caseMd)}</div></section>` : ''}
    ${renderTour(state)}
  `

  bind(state)
}

async function openFile(state: State, path: string): Promise<void> {
  state.selectedFile = path
  state.selectedAssignment = null
  state.lastResult = null
  state.fileIsImage = /\.(png|jpe?g|gif|webp)$/i.test(path)
  state.imageZoom = 1
  if (state.fileIsImage) {
    state.fileContent = null
  } else {
    state.fileContent = await fetchText(`workspace/${path}`)
  }
  render(state)
}

async function openAssignment(state: State, id: string): Promise<void> {
  state.selectedAssignment = id
  state.lastResult = null
  state.taskMd = await fetchText(`assignments/${id}/task.md`)
  const meta = state.meta.assignments.find((a) => a.id === id)!
  if (meta.level === 'L1') {
    state.expected = await fetchJson<ExpectedSpec>(`assignments/${id}/expected.json`)
  } else {
    state.expected = null
    if (!state.l2) {
      state.l2 = await fetchJson<L2Preview>('derived/l2_preview.json')
    }
  }
  render(state)
}

async function applyTourStep(state: State, step: TourStep): Promise<void> {
  state.mode = step.mode
  if (step.open_file) {
    await openFile(state, step.open_file)
  }
  if (step.focus === 'assignment' && step.assignment_id) {
    await openAssignment(state, step.assignment_id)
  } else if (step.focus === 'workspace' && !step.open_file) {
    state.selectedAssignment = null
    await openFile(state, 'регламент.md')
  }
  render(state)
}

function bind(state: State): void {
  document.querySelectorAll<HTMLElement>('[data-path]').forEach((el) => {
    el.addEventListener('click', () => {
      void openFile(state, el.dataset.path!)
    })
  })

  document.querySelectorAll<HTMLElement>('[data-asg]').forEach((el) => {
    el.addEventListener('click', () => {
      void openAssignment(state, el.dataset.asg!)
    })
  })

  document.querySelectorAll<HTMLElement>('[data-mode-set]').forEach((el) => {
    el.addEventListener('click', () => {
      state.mode = el.dataset.modeSet as Mode
      render(state)
    })
  })

  document.getElementById('start-tour')?.addEventListener('click', () => {
    state.tourActive = true
    state.tourIndex = 0
    state.tourTriedL101 = false
    void applyTourStep(state, state.meta.tour[0])
  })

  document.querySelectorAll<HTMLElement>('[data-tour]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.tour
      if (action === 'skip') {
        state.tourActive = false
        render(state)
        return
      }
      if (action === 'author') {
        state.mode = 'author'
        render(state)
        return
      }
      if (action === 'prev') {
        state.tourIndex = Math.max(0, state.tourIndex - 1)
        void applyTourStep(state, state.meta.tour[state.tourIndex])
        return
      }
      if (action === 'next') {
        const step = state.meta.tour[state.tourIndex]
        if (step.id === 'l1-01' && state.mode === 'agent' && !state.tourTriedL101 && !state.lastResult) {
          // Soft nudge: allow next, but prefer try — still allow skip forward
        }
        if (state.tourIndex >= state.meta.tour.length - 1) {
          state.tourActive = false
          render(state)
          return
        }
        state.tourIndex += 1
        void applyTourStep(state, state.meta.tour[state.tourIndex])
      }
    })
  })

  document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((el) => {
    el.addEventListener('click', () => {
      const z = el.dataset.zoom
      if (z === 'in') state.imageZoom = Math.min(4, state.imageZoom + 0.25)
      if (z === 'out') state.imageZoom = Math.max(0.5, state.imageZoom - 0.25)
      if (z === 'reset') state.imageZoom = 1
      const img = document.getElementById('scan-img') as HTMLImageElement | null
      if (img) img.style.width = `${state.imageZoom * 100}%`
      else render(state)
    })
  })

  const form = document.getElementById('l1-form') as HTMLFormElement | null
  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!state.expected) return
    const fd = new FormData(form)
    const refused = fd.get('refused') === 'on'
    const fields: Record<string, string> = {}
    fd.forEach((v, k) => {
      if (k !== 'refused') fields[k] = String(v)
    })
    const payload = buildAgentPayload(state.expected.answer_type, refused, fields)
    state.lastResult = evaluateL1(payload, state.expected)
    if (state.selectedAssignment === 'L1-01') state.tourTriedL101 = true
    render(state)
  })
}

async function main(): Promise<void> {
  const meta = await fetchJson<DemoMeta>('demo_meta.json')
  const sharedContext = await fetchText('shared_context.md')
  const caseMd = await fetchText('case.md')
  const state: State = {
    meta,
    mode: meta.default_mode || 'agent',
    selectedFile: null,
    selectedAssignment: null,
    sharedContext,
    caseMd,
    fileContent: null,
    fileIsImage: false,
    imageZoom: 1,
    taskMd: null,
    expected: null,
    l2: null,
    lastResult: null,
    tourActive: true,
    tourIndex: 0,
    tourTriedL101: false,
  }
  await applyTourStep(state, meta.tour[0])
}

main().catch((err) => {
  app.innerHTML = `<pre style="padding:24px;color:#8b1e1e">${esc(String(err))}</pre>`
  console.error(err)
})
