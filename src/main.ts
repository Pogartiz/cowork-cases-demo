import './style.css'
import {
  casePath,
  contentUrl,
  fetchJson,
  fetchText,
  type AssignmentMeta,
  type Catalog,
  type CatalogCase,
  type DemoMeta,
  type FilePreview,
  type FilePreviews,
  type Mode,
  type TourStep,
  type Variant,
  type WorkspaceNode,
} from './lib/content'
import { evaluateL1, type ExpectedSpec, type L1Result } from './lib/l1Eval'
import {
  evaluateSimple,
  resolveExpected,
  type SimpleExpected,
  type SimpleResult,
} from './lib/simpleEval'

type L2Preview = Record<string, Record<string, unknown>>

type View = 'catalog' | 'case'

interface CaseState {
  caseId: string
  meta: DemoMeta
  mode: Mode
  variant: Variant
  tree: WorkspaceNode
  previews: FilePreviews
  selectedFile: string | null
  selectedAssignment: string | null
  sharedContext: string
  caseMd: string
  fileContent: string | null
  fileKind: 'text' | 'image' | 'pdf' | 'preview' | 'download'
  filePreview: FilePreview | null
  imageZoom: number
  taskMd: string | null
  expected: ExpectedSpec | SimpleExpected | null
  l2: L2Preview | null
  lastResult: L1Result | SimpleResult | null
  tourActive: boolean
  tourIndex: number
  tourTriedL101: boolean
}

interface AppState {
  view: View
  catalog: Catalog
  caseState: CaseState | null
}

const app = document.querySelector<HTMLDivElement>('#app')!

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hasTour(meta: DemoMeta): boolean {
  return Array.isArray(meta.tour) && meta.tour.length > 0
}

function evalMode(meta: DemoMeta): 'harness' | 'simple' {
  return meta.eval_mode === 'simple' ? 'simple' : 'harness'
}

function workspaceFileUrl(cs: CaseState, relPath: string): string {
  const variants = cs.meta.variant_files || []
  if (cs.variant === 'B' && variants.includes(relPath)) {
    return contentUrl(casePath(cs.caseId, `workspace_variants/B/${relPath}`))
  }
  return contentUrl(casePath(cs.caseId, `workspace/${relPath}`))
}

function previewKey(cs: CaseState, relPath: string): string {
  const variants = cs.meta.variant_files || []
  if (variants.includes(relPath)) {
    return `variant:${cs.variant}:${relPath}`
  }
  return relPath
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
      return 'Строка'
    case 'id_set':
    case 'file_set':
      return 'Список через запятую или с новой строки'
    case 'protocol_ref':
      return 'Дата протокола + номер'
    case 'refusal':
      return 'Ожидается отказ (refused)'
    default:
      return t || 'JSON answer'
  }
}

function buildAgentPayload(
  answerType: string,
  refused: boolean,
  fields: Record<string, string>,
  simple: boolean,
): unknown {
  const sources = (fields.sources || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  if (refused) {
    return { answer: null, sources, refused: true }
  }

  if (simple) {
    const raw = (fields.answer || '').trim()
    if (!raw) return { answer: null, sources, refused: false }
    try {
      return { answer: JSON.parse(raw), sources, refused: false }
    } catch {
      return { answer: raw, sources, refused: false }
    }
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

function isHarnessResult(r: L1Result | SimpleResult): r is L1Result {
  return 'hallucination' in r
}

function renderL1Form(cs: CaseState): string {
  const exp = cs.expected
  if (!exp) return '<p class="muted">Эталон ещё не загружен…</p>'
  const simple = evalMode(cs.meta) === 'simple'
  const t = 'answer_type' in exp ? String(exp.answer_type || '') : ''
  const hint = answerTypeHint(t)

  let fields = ''
  if (!simple && t === 'protocol_ref') {
    fields = `
      <label>Дата протокола<input type="text" name="date" placeholder="YYYY-MM-DD" /></label>
      <label>Номер протокола<input type="number" name="number" placeholder="5" /></label>`
  } else if (!simple && t === 'refusal') {
    fields = `<p class="muted">Для этого задания корректный исход — отказ. Отметьте «Отказ» ниже.</p>`
  } else if (!simple && (t === 'id_set' || t === 'file_set')) {
    fields = `<label>Ответ (${esc(hint)})<textarea name="answer" placeholder="id1&#10;id2"></textarea></label>`
  } else if (simple) {
    fields = `<label>Ответ (JSON или строка)<textarea name="answer" placeholder='{"value": 92}'></textarea></label>`
  } else {
    fields = `<label>Ответ (${esc(hint)})<input type="text" name="answer" /></label>`
  }

  const result = cs.lastResult
  let verdict = ''
  if (result) {
    const cls = result.task_pass ? 'pass' : 'fail'
    const title = result.task_pass ? 'Pass' : 'Fail'
    if (isHarnessResult(result)) {
      const reasons: string[] = []
      if (result.correct_refusal) reasons.push('корректный отказ')
      if (result.hallucination) reasons.push('галлюцинация на неотвечаемом')
      if (result.over_refusal) reasons.push('лишний отказ')
      if (result.wrong_answer) reasons.push('неверный ответ')
      if (result.invalid_format)
        reasons.push(`неверный формат${result.format_error ? ': ' + result.format_error : ''}`)
      const softParts: string[] = []
      if (result.source_f1 != null) softParts.push(`source_f1 = ${result.source_f1.toFixed(3)}`)
      if (result.source_pass != null) softParts.push(`source_pass = ${result.source_pass}`)
      if (result.false_source) softParts.push('false_source')
      softParts.push('sources не влияют на Pass/Fail')
      verdict = `<div class="verdict ${cls}"><strong>${title}</strong> — ${esc(reasons.join(', ') || 'ok')}
        <div class="soft">${esc(softParts.join(' · '))}</div></div>`
    } else {
      verdict = `<div class="verdict ${cls}"><strong>${title}</strong> — ${esc(result.note)}
        <div class="soft">${esc(result.detail || '')}</div></div>`
    }
  }

  const intro = simple
    ? '<p class="muted">Упрощённая сверка (не Toolathlon task_pass).</p>'
    : '<p class="muted">Сверка как в харнессе: <code>task_pass</code> независим от sources.</p>'

  return `
    <form id="l1-form" class="form-grid">
      ${intro}
      ${fields}
      <label>Sources (необязательно)<textarea name="sources" placeholder="путь/к/файлу"></textarea></label>
      <label class="row"><input type="checkbox" name="refused" /> Отказ (refused = true, answer = null)</label>
      <div class="row"><button class="btn primary" type="submit">Проверить</button></div>
    </form>
    ${verdict}`
}

function renderAuthorL1(cs: CaseState): string {
  if (cs.mode !== 'author' || !cs.expected) return ''
  const exp = cs.expected as SimpleExpected & ExpectedSpec
  const gold = resolveExpected(exp, cs.variant)
  const sources = (exp.acceptable_source_sets || [])
    .map((s, i) => `<li>набор ${i + 1}: ${esc(s.join(', '))}</li>`)
    .join('')
  return `<div class="author-box">
    <h3>Эталон (режим Автор)${exp.expected_by_variant ? ` · вариант ${cs.variant}` : ''}</h3>
    <pre class="markdown">${esc(JSON.stringify(gold, null, 2))}</pre>
    ${exp.answer_type ? `<p><strong>answer_type:</strong> ${esc(String(exp.answer_type))} · <strong>source_policy:</strong> ${esc(String(exp.source_policy || ''))}</p>` : ''}
    ${sources ? `<p><strong>acceptable_source_sets</strong></p><ul>${sources}</ul>` : ''}
    ${exp.notes ? `<p class="muted">${esc(exp.notes)}</p>` : ''}
  </div>`
}

function renderAuthorL2(cs: CaseState, id: string): string {
  if (cs.mode !== 'author' || !cs.l2 || !cs.l2[id]) {
    return cs.mode === 'agent'
      ? `<p class="muted">Переключитесь в «Автор», чтобы увидеть эталон артефакта.</p>`
      : ''
  }
  let p = { ...cs.l2[id] } as Record<string, unknown>
  if (p.by_variant && typeof p.by_variant === 'object') {
    const by = p.by_variant as Record<string, Record<string, unknown>>
    const v = by[cs.variant] || by.A
    p = { ...p, ...v }
    delete p.by_variant
  }

  const checklist = Array.isArray(p.checklist)
    ? (p.checklist as string[]).map((c) => `<li>${esc(c)}</li>`).join('')
    : ''
  let table = ''
  if (Array.isArray(p.columns) && Array.isArray(p.rows)) {
    const columns = p.columns as string[]
    const rows = p.rows as Record<string, string>[]
    const head = columns.map((c) => `<th>${esc(c)}</th>`).join('')
    const body = rows
      .slice(0, 80)
      .map((r) => `<tr>${columns.map((c) => `<td>${esc(String(r[c] ?? ''))}</td>`).join('')}</tr>`)
      .join('')
    table = `<div style="overflow:auto;max-height:360px;margin-top:8px"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
  }

  const skip = new Set(['checklist', 'columns', 'rows', 'artifact', 'sheet', 'sidecar', 'note'])
  let extra = ''
  for (const [k, v] of Object.entries(p)) {
    if (skip.has(k) || v == null) continue
    if (typeof v === 'object') {
      extra += `<p><strong>${esc(k)}:</strong></p><pre class="markdown">${esc(JSON.stringify(v, null, 2))}</pre>`
    } else {
      extra += `<p><strong>${esc(k)}:</strong> ${esc(String(v))}</p>`
    }
  }

  return `<div class="author-box">
    <h3>Эталон артефакта (режим Автор)${cs.meta.assignments.find((a) => a.id === id)?.has_variants ? ` · вариант ${cs.variant}` : ''}</h3>
    <p><strong>Файл:</strong> ${esc(String(p.artifact || ''))}${p.sheet ? ` · лист «${esc(String(p.sheet))}»` : ''}</p>
    ${p.sidecar ? `<p><strong>Sidecar:</strong> ${esc(String(p.sidecar))}</p>` : ''}
    <ul class="checklist">${checklist}</ul>
    ${table}
    ${extra}
    ${p.note ? `<p class="muted">${esc(String(p.note))}</p>` : ''}
  </div>`
}

function renderPreview(preview: FilePreview): string {
  if ('error' in preview && preview.error && !('kind' in preview)) {
    return `<p class="muted">Preview: ${esc(preview.error)}</p>`
  }
  if ('kind' in preview && preview.kind === 'xlsx' && preview.sheets) {
    return preview.sheets
      .map((sh) => {
        const rows = sh.rows
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
          .join('')
        return `<h3 class="viewer-title" style="font-size:1rem">Лист «${esc(sh.name)}»</h3>
          <div style="overflow:auto;max-height:50vh"><table class="data"><tbody>${rows}</tbody></table></div>`
      })
      .join('')
  }
  if ('kind' in preview && preview.kind === 'csv' && preview.rows) {
    const rows = preview.rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
      .join('')
    return `<div style="overflow:auto;max-height:50vh"><table class="data"><tbody>${rows}</tbody></table></div>`
  }
  if ('kind' in preview && (preview.kind === 'docx' || preview.kind === 'text')) {
    if ('error' in preview && preview.error) {
      return `<p class="muted">${esc(preview.error)}</p>`
    }
    return `<div class="markdown">${esc(preview.text || '')}</div>`
  }
  return `<p class="muted">Нет preview для этого файла.</p>`
}

function renderTour(cs: CaseState): string {
  if (!cs.tourActive || !hasTour(cs.meta)) return ''
  const tour = cs.meta.tour!
  const step = tour[cs.tourIndex]
  const n = tour.length
  const isLast = cs.tourIndex >= n - 1
  return `<aside class="guide" id="guide" aria-label="Гид по кейсу">
    <div class="progress">Гид · шаг ${cs.tourIndex + 1} из ${n}</div>
    <h2>${esc(step.title)}</h2>
    <p>${esc(step.body)}</p>
    <div class="row">
      <button class="btn" type="button" data-tour="skip">Закрыть гид</button>
      ${cs.tourIndex > 0 ? `<button class="btn" type="button" data-tour="prev">Назад</button>` : ''}
      ${
        step.then_author && cs.mode === 'agent'
          ? `<button class="btn primary" type="button" data-tour="author">Разобрать в Автор</button>`
          : ''
      }
      <button class="btn primary" type="button" data-tour="next">${isLast ? 'Готово' : 'Далее'}</button>
    </div>
  </aside>`
}

function renderCatalog(state: AppState): void {
  document.title = 'Cowork cases demo'
  app.classList.remove('guide-open')
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <h1>${esc(state.catalog.title)}</h1>
        <div class="meta">${esc(state.catalog.description)}</div>
      </div>
    </header>
    <main class="catalog">
      <p class="catalog-lead">Выберите кейс. Live — можно открыть workspace и задания; «скоро» — заглушка.</p>
      <div class="catalog-grid">
        ${state.catalog.cases
          .map((c: CatalogCase) => {
            const counts = c.assignment_counts || {}
            const countLabel = counts.total
              ? `${counts.L1 || 0} L1 · ${counts.L2 || 0} L2`
              : ''
            if (c.status === 'stub') {
              return `<article class="case-card stub">
                <div class="case-card-top">
                  <h2>${esc(c.title)}</h2>
                  <span class="badge-stub">скоро</span>
                </div>
                <p class="muted">${esc(c.organization)}</p>
                <p class="muted">Срез ${esc(c.cutoff_date)}${countLabel ? ` · ${esc(countLabel)}` : ''}</p>
              </article>`
            }
            return `<button type="button" class="case-card live" data-open-case="${esc(c.id)}">
              <div class="case-card-top">
                <h2>${esc(c.title)}</h2>
                <span class="badge-live">live</span>
              </div>
              <p class="muted">${esc(c.organization)}</p>
              <p class="muted">Срез ${esc(c.cutoff_date)}${countLabel ? ` · ${esc(countLabel)}` : ''}</p>
            </button>`
          })
          .join('')}
      </div>
    </main>`

  document.querySelectorAll<HTMLElement>('[data-open-case]').forEach((el) => {
    el.addEventListener('click', () => {
      void openCase(state, el.dataset.openCase!)
    })
  })
}

function renderCase(state: AppState): void {
  const cs = state.caseState!
  const asg = cs.meta.assignments.find((a) => a.id === cs.selectedAssignment) || null
  const trapLabel =
    asg?.trap && cs.mode === 'author' ? cs.meta.trap_labels[asg.trap] : null
  const skillLabel = asg ? cs.meta.skill_labels[asg.skill] || asg.skill : ''
  document.title = `${cs.meta.title} — Cowork demo`

  const filePanel = (() => {
    if (!cs.selectedFile) return `<div class="empty">Выберите файл в дереве слева</div>`
    const src = workspaceFileUrl(cs, cs.selectedFile)
    if (cs.fileKind === 'image') {
      return `
        <h2 class="viewer-title">${esc(cs.selectedFile)}</h2>
        <div class="img-toolbar">
          <button class="btn" type="button" data-zoom="out">−</button>
          <button class="btn" type="button" data-zoom="reset">100%</button>
          <button class="btn" type="button" data-zoom="in">+</button>
          <a class="btn" href="${src}" target="_blank" rel="noreferrer">Открыть полностью</a>
        </div>
        <div class="img-wrap"><img id="scan-img" src="${src}" alt="${esc(cs.selectedFile)}" style="width:${cs.imageZoom * 100}%" /></div>`
    }
    if (cs.fileKind === 'pdf') {
      return `
        <h2 class="viewer-title">${esc(cs.selectedFile)}</h2>
        <div class="row" style="margin-bottom:8px"><a class="btn" href="${src}" target="_blank" rel="noreferrer">Скачать / открыть PDF</a></div>
        <iframe class="pdf-frame" src="${src}" title="${esc(cs.selectedFile)}"></iframe>`
    }
    if (cs.fileKind === 'preview' && cs.filePreview) {
      return `
        <h2 class="viewer-title">${esc(cs.selectedFile)}</h2>
        <div class="row" style="margin-bottom:8px"><a class="btn" href="${src}" download>Скачать оригинал</a></div>
        ${renderPreview(cs.filePreview)}`
    }
    if (cs.fileKind === 'download') {
      return `
        <h2 class="viewer-title">${esc(cs.selectedFile)}</h2>
        <div class="empty">В браузере нет preview для этого типа.<br/><a class="btn primary" href="${src}" download>Скачать файл</a></div>`
    }
    return `<h2 class="viewer-title">${esc(cs.selectedFile)}</h2><div class="markdown">${esc(cs.fileContent || '')}</div>`
  })()

  const variantBar = (() => {
    if (!asg?.has_variants) return ''
    const hint =
      cs.variant === 'B' && cs.meta.variant_hint?.B
        ? `<p class="muted variant-hint">${esc(cs.meta.variant_hint.B)}</p>`
        : ''
    return `<div class="variant-bar">
      <span>Вариант workspace:</span>
      <div class="mode-toggle" role="group" aria-label="Вариант A/B">
        <button type="button" data-variant="A" class="${cs.variant === 'A' ? 'active' : ''}">A</button>
        <button type="button" data-variant="B" class="${cs.variant === 'B' ? 'active' : ''}">B</button>
      </div>
      ${hint}
    </div>`
  })()

  const assignmentPanel = (() => {
    if (!asg) return `<div class="empty">Выберите задание справа</div>`
    const tags = `
      <div class="tags">
        <span class="tag skill">${esc(skillLabel)}</span>
        ${trapLabel ? `<span class="tag trap">${esc(trapLabel)}</span>` : ''}
      </div>`
    return `
      <h2 class="viewer-title">${esc(asg.id)} · ${esc(asg.short)}</h2>
      ${tags}
      ${variantBar}
      <div class="shared">${esc(cs.sharedContext)}</div>
      <div class="markdown">${esc(cs.taskMd || '')}</div>
      ${
        asg.level === 'L1'
          ? `${renderL1Form(cs)}${renderAuthorL1(cs)}`
          : `${renderAuthorL2(cs, asg.id)}`
      }`
  })()

  app.classList.toggle('guide-open', cs.tourActive)
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <button type="button" class="btn back-btn" id="back-catalog">← Каталог</button>
        <h1>${esc(cs.meta.title)}</h1>
        <div class="meta">Срез ${esc(cs.meta.cutoff_date)} · snapshot${cs.meta.organization ? ` · ${esc(cs.meta.organization)}` : ''}</div>
      </div>
      <div class="top-actions">
        <span class="badge-mode ${cs.mode}">${cs.mode === 'agent' ? 'Агент' : 'Автор'}</span>
        <div class="mode-toggle" role="group" aria-label="Режим">
          <button type="button" data-mode-set="agent" class="${cs.mode === 'agent' ? 'active' : ''}" data-mode="agent">Агент</button>
          <button type="button" data-mode-set="author" class="${cs.mode === 'author' ? 'active' : ''}" data-mode="author">Автор</button>
        </div>
        ${hasTour(cs.meta) ? `<button class="btn" type="button" id="start-tour">Пройти гид</button>` : ''}
      </div>
    </header>
    <div class="layout">
      <section class="panel">
        <div class="panel-h">Workspace</div>
        <div class="panel-b tree" id="tree">${renderTree(cs.tree, cs.selectedFile)}</div>
      </section>
      <section class="panel">
        <div class="panel-h">
          <span>${cs.selectedAssignment ? 'Задание' : 'Просмотр файла'}</span>
        </div>
        <div class="panel-b" id="main-pane">
          ${cs.selectedAssignment ? assignmentPanel : filePanel}
        </div>
      </section>
      <section class="panel">
        <div class="panel-h">Задания <span class="muted">${cs.meta.assignments.length}</span></div>
        <div class="panel-b" id="asg-list">
          ${cs.meta.assignments
            .map((a: AssignmentMeta) => {
              const skill = cs.meta.skill_labels[a.skill] || a.skill
              const trap =
                cs.mode === 'author' && a.trap ? cs.meta.trap_labels[a.trap] : null
              return `<button type="button" class="asg-item ${cs.selectedAssignment === a.id ? 'active' : ''}" data-asg="${esc(a.id)}">
                <span class="id">${esc(a.id)}${a.has_variants ? ' · A/B' : ''}</span>
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
    ${
      cs.mode === 'author' && !cs.selectedAssignment
        ? `<section class="panel" style="max-width:1440px;margin:0 auto 24px;"><div class="panel-h">Заметки автора (case.md)</div><div class="panel-b markdown">${esc(cs.caseMd)}</div></section>`
        : ''
    }
    ${renderTour(cs)}
  `

  bindCase(state)
}

function render(state: AppState): void {
  if (state.view === 'catalog' || !state.caseState) renderCatalog(state)
  else renderCase(state)
}

async function openFile(cs: CaseState, path: string): Promise<void> {
  cs.selectedFile = path
  cs.selectedAssignment = null
  cs.lastResult = null
  cs.imageZoom = 1
  cs.filePreview = null
  cs.fileContent = null

  const lower = path.toLowerCase()
  if (/\.(png|jpe?g|gif|webp)$/i.test(lower)) {
    cs.fileKind = 'image'
  } else if (lower.endsWith('.pdf')) {
    cs.fileKind = 'pdf'
  } else if (/\.(xlsx|docx|csv|txt)$/i.test(lower)) {
    const key = previewKey(cs, path)
    const preview = cs.previews[key] || cs.previews[path]
    if (preview) {
      cs.fileKind = 'preview'
      cs.filePreview = preview
    } else if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
      cs.fileKind = 'text'
      const variants = cs.meta.variant_files || []
      const rel =
        cs.variant === 'B' && variants.includes(path)
          ? casePath(cs.caseId, `workspace_variants/B/${path}`)
          : casePath(cs.caseId, `workspace/${path}`)
      cs.fileContent = await fetchText(rel)
    } else {
      cs.fileKind = 'download'
    }
  } else if (/\.(zip)$/i.test(lower)) {
    cs.fileKind = 'download'
  } else {
    cs.fileKind = 'text'
    const variants = cs.meta.variant_files || []
    const rel =
      cs.variant === 'B' && variants.includes(path)
        ? casePath(cs.caseId, `workspace_variants/B/${path}`)
        : casePath(cs.caseId, `workspace/${path}`)
    cs.fileContent = await fetchText(rel)
  }
}

async function openAssignment(cs: CaseState, id: string): Promise<void> {
  cs.selectedAssignment = id
  cs.lastResult = null
  cs.taskMd = await fetchText(casePath(cs.caseId, `assignments/${id}/task.md`))
  const meta = cs.meta.assignments.find((a) => a.id === id)!
  if (!meta.has_variants) cs.variant = 'A'
  if (meta.level === 'L1') {
    cs.expected = await fetchJson<ExpectedSpec | SimpleExpected>(
      casePath(cs.caseId, `assignments/${id}/expected.json`),
    )
  } else {
    cs.expected = null
    if (!cs.l2) {
      cs.l2 = await fetchJson<L2Preview>(casePath(cs.caseId, 'derived/l2_preview.json'))
    }
  }
}

async function applyTourStep(cs: CaseState, step: TourStep): Promise<void> {
  cs.mode = step.mode
  if (step.open_file) {
    await openFile(cs, step.open_file)
  }
  if (step.focus === 'assignment' && step.assignment_id) {
    await openAssignment(cs, step.assignment_id)
  } else if (step.focus === 'workspace' && !step.open_file) {
    cs.selectedAssignment = null
    try {
      await openFile(cs, 'регламент.md')
    } catch {
      const firstFile =
        cs.tree.children?.find((c) => c.type === 'file')?.path ||
        cs.tree.children?.flatMap((c) => c.children || []).find((c) => c.type === 'file')
          ?.path
      if (firstFile) await openFile(cs, firstFile)
    }
  }
}

async function openCase(state: AppState, caseId: string): Promise<void> {
  const meta = await fetchJson<DemoMeta>(casePath(caseId, 'demo_meta.json'))
  const tree = await fetchJson<WorkspaceNode>(casePath(caseId, 'workspace_tree.json'))
  const sharedContext = await fetchText(casePath(caseId, 'shared_context.md'))
  const caseMd = await fetchText(casePath(caseId, 'case.md'))
  let previews: FilePreviews = {}
  try {
    previews = await fetchJson<FilePreviews>(casePath(caseId, 'derived/file_previews.json'))
  } catch {
    previews = {}
  }

  const cs: CaseState = {
    caseId,
    meta,
    mode: meta.default_mode || 'agent',
    variant: 'A',
    tree,
    previews,
    selectedFile: null,
    selectedAssignment: null,
    sharedContext,
    caseMd,
    fileContent: null,
    fileKind: 'text',
    filePreview: null,
    imageZoom: 1,
    taskMd: null,
    expected: null,
    l2: null,
    lastResult: null,
    tourActive: false,
    tourIndex: 0,
    tourTriedL101: false,
  }

  state.view = 'case'
  state.caseState = cs

  if (hasTour(meta)) {
    cs.tourActive = true
    cs.tourIndex = 0
    await applyTourStep(cs, meta.tour![0])
  }

  // Fix hash
  history.replaceState(null, '', `#case/${caseId}`)
  render(state)
}

function bindCase(state: AppState): void {
  const cs = state.caseState!

  document.getElementById('back-catalog')?.addEventListener('click', () => {
    state.view = 'catalog'
    state.caseState = null
    history.replaceState(null, '', '#')
    render(state)
  })

  document.querySelectorAll<HTMLElement>('[data-path]').forEach((el) => {
    el.addEventListener('click', () => {
      void openFile(cs, el.dataset.path!).then(() => render(state))
    })
  })

  document.querySelectorAll<HTMLElement>('[data-asg]').forEach((el) => {
    el.addEventListener('click', () => {
      void openAssignment(cs, el.dataset.asg!).then(() => render(state))
    })
  })

  document.querySelectorAll<HTMLElement>('[data-mode-set]').forEach((el) => {
    el.addEventListener('click', () => {
      cs.mode = el.dataset.modeSet as Mode
      render(state)
    })
  })

  document.querySelectorAll<HTMLElement>('[data-variant]').forEach((el) => {
    el.addEventListener('click', () => {
      cs.variant = el.dataset.variant as Variant
      cs.lastResult = null
      // Refresh open file if it's a variant file
      if (cs.selectedFile && (cs.meta.variant_files || []).includes(cs.selectedFile)) {
        void openFile(cs, cs.selectedFile).then(() => render(state))
      } else {
        render(state)
      }
    })
  })

  document.getElementById('start-tour')?.addEventListener('click', () => {
    if (!hasTour(cs.meta)) return
    cs.tourActive = true
    cs.tourIndex = 0
    cs.tourTriedL101 = false
    void applyTourStep(cs, cs.meta.tour![0]).then(() => render(state))
  })

  document.querySelectorAll<HTMLElement>('[data-tour]').forEach((el) => {
    el.addEventListener('click', () => {
      const action = el.dataset.tour
      const tour = cs.meta.tour!
      if (action === 'skip') {
        cs.tourActive = false
        render(state)
        return
      }
      if (action === 'author') {
        cs.mode = 'author'
        render(state)
        return
      }
      if (action === 'prev') {
        cs.tourIndex = Math.max(0, cs.tourIndex - 1)
        void applyTourStep(cs, tour[cs.tourIndex]).then(() => render(state))
        return
      }
      if (action === 'next') {
        if (cs.tourIndex >= tour.length - 1) {
          cs.tourActive = false
          render(state)
          return
        }
        cs.tourIndex += 1
        void applyTourStep(cs, tour[cs.tourIndex]).then(() => render(state))
      }
    })
  })

  document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((el) => {
    el.addEventListener('click', () => {
      const z = el.dataset.zoom
      if (z === 'in') cs.imageZoom = Math.min(4, cs.imageZoom + 0.25)
      if (z === 'out') cs.imageZoom = Math.max(0.5, cs.imageZoom - 0.25)
      if (z === 'reset') cs.imageZoom = 1
      const img = document.getElementById('scan-img') as HTMLImageElement | null
      if (img) img.style.width = `${cs.imageZoom * 100}%`
      else render(state)
    })
  })

  const form = document.getElementById('l1-form') as HTMLFormElement | null
  form?.addEventListener('submit', (e) => {
    e.preventDefault()
    if (!cs.expected) return
    const fd = new FormData(form)
    const refused = fd.get('refused') === 'on'
    const fields: Record<string, string> = {}
    fd.forEach((v, k) => {
      if (k !== 'refused') fields[k] = String(v)
    })
    const simple = evalMode(cs.meta) === 'simple'
    const answerType =
      'answer_type' in cs.expected ? String((cs.expected as ExpectedSpec).answer_type || '') : ''
    const payload = buildAgentPayload(answerType, refused, fields, simple) as {
      answer: unknown
      sources: string[]
      refused: boolean
    }

    if (simple) {
      const gold = resolveExpected(cs.expected as SimpleExpected, cs.variant)
      cs.lastResult = evaluateSimple(payload, gold)
    } else {
      cs.lastResult = evaluateL1(payload, cs.expected as ExpectedSpec)
    }
    if (cs.selectedAssignment === 'L1-01') cs.tourTriedL101 = true
    render(state)
  })
}

async function main(): Promise<void> {
  const catalog = await fetchJson<Catalog>('catalog.json')
  const state: AppState = {
    view: 'catalog',
    catalog,
    caseState: null,
  }

  const hash = location.hash.replace(/^#/, '')
  const m = hash.match(/^case\/([^/]+)/)
  if (m) {
    const id = decodeURIComponent(m[1])
    if (catalog.cases.some((c) => c.id === id && c.status === 'live')) {
      await openCase(state, id)
      return
    }
  }
  render(state)
}

main().catch((err) => {
  app.innerHTML = `<pre style="padding:24px;color:#8b1e1e">${esc(String(err))}</pre>`
  console.error(err)
})
