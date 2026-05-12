import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallback } from 'react'
import Particles from '@tsparticles/react'
import { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import Dexie, { type Table } from 'dexie'
import {
  ArchiveRestore,
  Calendar,
  Check,
  ChevronDown,
  Circle,
  Download,
  Edit3,
  Inbox,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { Engine, ISourceOptions } from '@tsparticles/engine'

type Priority = 'low' | 'medium' | 'high'
type ViewKey = 'today' | 'all' | 'important' | 'completed' | 'overdue' | 'trash'

type Task = {
  id: string
  title: string
  description: string
  completed: boolean
  priority: Priority
  dueDate: string
  tags: string[]
  deleted: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
}

type Draft = {
  title: string
  description: string
  priority: Priority
  dueDate: string
  tags: string
}

class LumaTodoDb extends Dexie {
  tasks!: Table<Task, string>

  constructor() {
    super('lumaTodo')
    this.version(1).stores({
      tasks: 'id, completed, priority, dueDate, deleted, createdAt',
    })
  }
}

const db = new LumaTodoDb()

const navItems: Array<{ key: ViewKey; label: string; icon: typeof Calendar }> = [
  { key: 'today', label: '今日', icon: Calendar },
  { key: 'all', label: '全部', icon: LayoutGrid },
  { key: 'important', label: '重要', icon: Star },
  { key: 'completed', label: '完成', icon: Check },
  { key: 'overdue', label: '逾期', icon: Inbox },
  { key: 'trash', label: '回收站', icon: Trash2 },
]

const priorityMeta: Record<Priority, { label: string; className: string; dot: string }> = {
  low: {
    label: 'Low',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    dot: 'bg-emerald-300',
  },
  medium: {
    label: 'Medium',
    className: 'bg-violet-50 text-violet-700 ring-violet-100',
    dot: 'bg-violet-300',
  },
  high: {
    label: 'High',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    dot: 'bg-rose-300',
  },
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()

const initialDraft: Draft = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: todayKey(),
  tags: '',
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<ViewKey>('today')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [particlesReady, setParticlesReady] = useState(false)

  useEffect(() => {
    initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine)
    }).then(() => setParticlesReady(true))
  }, [])

  useEffect(() => {
    db.tasks.toArray().then((items) => {
      if (items.length) {
        setTasks(items)
        return
      }

      const seeded = createStarterTasks()
      db.tasks.bulkPut(seeded).then(() => setTasks(seeded))
    })
  }, [])

  const stats = useMemo(() => {
    const active = tasks.filter((task) => !task.deleted)
    const today = todayKey()
    return {
      active: active.filter((task) => !task.completed).length,
      today: active.filter((task) => task.dueDate === today && !task.completed).length,
      completed: active.filter((task) => task.completed).length,
      high: active.filter((task) => task.priority === 'high' && !task.completed).length,
    }
  }, [tasks])

  const visibleTasks = useMemo(() => {
    const today = todayKey()
    const normalizedQuery = query.trim().toLowerCase()

    return tasks
      .filter((task) => {
        if (view === 'trash') return task.deleted
        if (task.deleted) return false
        if (view === 'today') return task.dueDate === today && !task.completed
        if (view === 'important') return task.priority === 'high' && !task.completed
        if (view === 'completed') return task.completed
        if (view === 'overdue') return task.dueDate && task.dueDate < today && !task.completed
        return true
      })
      .filter((task) => {
        if (!normalizedQuery) return true
        return [task.title, task.description, task.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed)
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [query, tasks, view])

  const upsertTask = async (task: Task) => {
    await db.tasks.put(task)
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id)
      return exists ? current.map((item) => (item.id === task.id ? task : item)) : [task, ...current]
    })
  }

  const addTask = async () => {
    const title = draft.title.trim()
    if (!title) return

    await upsertTask({
      id: crypto.randomUUID(),
      title,
      description: draft.description.trim(),
      completed: false,
      priority: draft.priority,
      dueDate: draft.dueDate,
      tags: parseTags(draft.tags),
      deleted: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    setDraft({ ...initialDraft, dueDate: draft.dueDate || todayKey() })
  }

  const saveEdit = async () => {
    if (!editingTask) return
    const title = editingTask.title.trim()
    if (!title) return
    await upsertTask({ ...editingTask, title, updatedAt: nowIso() })
    setEditingTask(null)
  }

  const patchTask = async (task: Task, patch: Partial<Task>) => {
    await upsertTask({ ...task, ...patch, updatedAt: nowIso() })
  }

  const deleteForever = async (id: string) => {
    await db.tasks.delete(id)
    setTasks((current) => current.filter((task) => task.id !== id))
  }

  const exportTasks = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `luma-todo-${todayKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importTasks = async (file: File) => {
    const text = await file.text()
    const imported = JSON.parse(text) as Task[]
    const valid = imported.filter(isTask)
    await db.tasks.bulkPut(valid)
    const all = await db.tasks.toArray()
    setTasks(all)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f8faff] text-[#172033]">
      {particlesReady && <ParticleBackground />}
      <AmbientParticles />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,184,210,0.26),transparent_24%),radial-gradient(circle_at_85%_8%,rgba(123,140,255,0.18),transparent_24%),linear-gradient(135deg,#fbfdff_0%,#f3f6ff_45%,#fff8fb_100%)]" />
      <div className="pointer-events-none absolute left-[12%] top-[14%] h-48 w-48 rounded-full bg-[#d9e1ff]/50 blur-3xl animate-float-slow" />
      <div className="pointer-events-none absolute right-[10%] top-[8%] h-56 w-56 rounded-full bg-[#ffd9eb]/45 blur-3xl animate-float-slower" />
      <div className="pointer-events-none absolute bottom-[8%] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-white/65 blur-3xl animate-float-slow" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.34)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.34)_1px,transparent_1px)] bg-[size:78px_78px] opacity-[0.18] [mask-image:radial-gradient(ellipse_at_center,black,transparent_76%)]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
        <DesktopSidebar view={view} setView={setView} stats={stats} />

        <div className="flex min-w-0 flex-1 flex-col gap-5 pb-24 lg:pb-0">
          <Header query={query} setQuery={setQuery} onExport={exportTasks} onImport={importTasks} />
          <Hero stats={stats} />
          <TaskComposer draft={draft} setDraft={setDraft} onAdd={addTask} />
          <TaskStream
            tasks={visibleTasks}
            view={view}
            onToggle={(task) =>
              patchTask(task, {
                completed: !task.completed,
                completedAt: task.completed ? undefined : nowIso(),
              })
            }
            onDelete={(task) => patchTask(task, { deleted: true })}
            onRestore={(task) => patchTask(task, { deleted: false })}
            onDeleteForever={deleteForever}
            onEdit={setEditingTask}
          />
        </div>
      </section>

      <MobileNav view={view} setView={setView} />
      <EditSheet task={editingTask} setTask={setEditingTask} onSave={saveEdit} />
    </main>
  )
}

function ParticleBackground() {
  const particlesLoaded = useCallback(async () => undefined, [])
  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      background: { color: 'transparent' },
      fpsLimit: 60,
      particles: {
        number: { value: window.innerWidth < 768 ? 20 : 44, density: { enable: true } },
        color: { value: ['#7b8cff', '#b99cff', '#ffb8d2', '#ffffff'] },
        opacity: { value: { min: 0.2, max: 0.58 } },
        size: { value: { min: 1.6, max: 4.8 } },
        move: { enable: true, speed: 0.32, direction: 'none', outModes: { default: 'out' } },
        links: { enable: true, color: '#d0d8ff', distance: 145, opacity: 0.16, width: 1 },
      },
      interactivity: {
        events: { onHover: { enable: window.innerWidth >= 768, mode: 'grab' }, resize: { enable: true } },
        modes: { grab: { distance: 160, links: { opacity: 0.28 } } },
      },
      detectRetina: true,
    }),
    [],
  )

  return (
    <Particles
      id="luma-particles"
      className="pointer-events-none absolute inset-0 z-[1]"
      particlesLoaded={particlesLoaded}
      options={options}
    />
  )
}

function AmbientParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <span className="absolute left-[8%] top-[18%] h-2.5 w-2.5 rounded-full bg-white/70 shadow-[0_0_32px_rgba(255,255,255,0.85)] animate-pulse-soft" />
      <span className="absolute left-[16%] top-[58%] h-3 w-3 rounded-full bg-[#c8d2ff] shadow-[0_0_28px_rgba(123,140,255,0.52)] animate-drift-slow" />
      <span className="absolute right-[18%] top-[26%] h-2 w-2 rounded-full bg-[#ffd0e5] shadow-[0_0_26px_rgba(255,184,210,0.56)] animate-drift" />
      <span className="absolute right-[9%] bottom-[24%] h-3.5 w-3.5 rounded-full bg-white/75 shadow-[0_0_30px_rgba(255,255,255,0.82)] animate-pulse-soft" />
      <span className="absolute left-1/2 top-[10%] h-1.5 w-1.5 rounded-full bg-[#b99cff] shadow-[0_0_22px_rgba(185,156,255,0.7)] animate-drift-slower" />
    </div>
  )
}

function DesktopSidebar({ view, setView, stats }: { view: ViewKey; setView: (view: ViewKey) => void; stats: { active: number } }) {
  return (
    <aside className="sticky top-7 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col rounded-[2rem] border border-white/60 bg-white/50 p-5 shadow-[0_24px_80px_rgba(114,126,170,0.16)] backdrop-blur-2xl lg:flex">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#172033] text-white shadow-lg shadow-slate-400/30">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-[-0.03em]">LumaTodo</p>
          <p className="text-xs text-slate-500">light focus space</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = view === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
                active
                  ? 'bg-[#172033] text-white shadow-xl shadow-slate-300/50'
                  : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon size={17} />
                {item.label}
              </span>
              {item.key === 'all' && <span className="text-xs opacity-70">{stats.active}</span>}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-[1.6rem] bg-white/65 p-4 ring-1 ring-white/70">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Focus tone</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">慢一点，但完成得漂亮一点。</p>
      </div>
    </aside>
  )
}

function Header({
  query,
  setQuery,
  onExport,
  onImport,
}: {
  query: string
  setQuery: (query: string) => void
  onExport: () => void
  onImport: (file: File) => void
}) {
  return (
    <header className="flex flex-col gap-3 rounded-[2rem] border border-white/60 bg-white/58 p-3 shadow-[0_22px_70px_rgba(114,126,170,0.12)] backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center justify-between px-2 lg:hidden">
        <div>
          <p className="text-xl font-semibold tracking-[-0.04em]">LumaTodo</p>
          <p className="text-xs text-slate-500">精致本地待办空间</p>
        </div>
        <Sparkles className="text-[#7b8cff]" size={22} />
      </div>

      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-500 ring-1 ring-white/80">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索任务、标签或描述"
          className="min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
        />
      </label>

      <div className="flex gap-2">
        <label className="grid cursor-pointer place-items-center rounded-2xl bg-white/72 px-4 py-3 text-sm text-slate-600 ring-1 ring-white/80 transition hover:bg-white">
          <Upload size={17} />
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImport(file)
              event.target.value = ''
            }}
          />
        </label>
        <button
          type="button"
          onClick={onExport}
          className="grid place-items-center rounded-2xl bg-[#172033] px-4 py-3 text-sm text-white shadow-lg shadow-slate-400/30 transition hover:-translate-y-0.5"
        >
          <Download size={17} />
        </button>
      </div>
    </header>
  )
}

function Hero({ stats }: { stats: { today: number; completed: number; high: number } }) {
  return (
    <section className="overflow-hidden rounded-[2.3rem] border border-white/60 bg-white/48 p-5 shadow-[0_26px_90px_rgba(114,126,170,0.14)] backdrop-blur-2xl sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.38em] text-[#7b8cff]">Today</p>
          <h1 className="max-w-2xl text-2xl font-semibold leading-[1.08] tracking-[-0.06em] text-[#172033] sm:text-[2.7rem] lg:text-[3rem]">
            把今天变轻一点。
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-500 sm:text-[0.98rem]">
            还有 {stats.today} 件今日事项，先处理最值得注意的一件，剩下的慢慢排好。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MiniStat label="今日" value={stats.today} />
          <MiniStat label="重要" value={stats.high} />
          <MiniStat label="完成" value={stats.completed} />
        </div>
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.4rem] bg-white/65 px-4 py-3 text-center ring-1 ring-white/80 sm:min-w-24">
      <p className="text-2xl font-semibold tracking-[-0.05em] text-[#172033]">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  )
}

function TaskComposer({
  draft,
  setDraft,
  onAdd,
}: {
  draft: Draft
  setDraft: (draft: Draft) => void
  onAdd: () => void
}) {
  return (
    <section className="rounded-[2rem] border border-white/60 bg-white/62 p-4 shadow-[0_22px_70px_rgba(114,126,170,0.12)] backdrop-blur-2xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-3 rounded-2xl bg-white/74 px-4 py-3 ring-1 ring-white/80">
          <Plus size={18} className="text-[#7b8cff]" />
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAdd()
            }}
            placeholder="What needs your attention?"
            className="min-w-0 flex-1 bg-transparent text-[0.98rem] outline-none placeholder:text-slate-400"
          />
        </div>
        <select
          value={draft.priority}
          onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
          className="rounded-2xl bg-white/74 px-4 py-3 text-sm text-slate-600 outline-none ring-1 ring-white/80"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input
          type="date"
          value={draft.dueDate}
          onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          className="rounded-2xl bg-white/74 px-4 py-3 text-sm text-slate-600 outline-none ring-1 ring-white/80"
        />
        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl bg-[#172033] px-6 py-3 text-sm font-medium text-white shadow-xl shadow-slate-400/25 transition hover:-translate-y-0.5"
        >
          添加
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_280px]">
        <input
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="补充一点描述，可留空"
          className="rounded-2xl bg-white/58 px-4 py-3 text-sm outline-none ring-1 ring-white/80 placeholder:text-slate-400"
        />
        <input
          value={draft.tags}
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
          placeholder="标签，用逗号分隔"
          className="rounded-2xl bg-white/58 px-4 py-3 text-sm outline-none ring-1 ring-white/80 placeholder:text-slate-400"
        />
      </div>
    </section>
  )
}

function TaskStream({
  tasks,
  view,
  onToggle,
  onDelete,
  onRestore,
  onDeleteForever,
  onEdit,
}: {
  tasks: Task[]
  view: ViewKey
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  onRestore: (task: Task) => void
  onDeleteForever: (id: string) => void
  onEdit: (task: Task) => void
}) {
  return (
    <section className="min-h-[360px] rounded-[2.2rem] border border-white/60 bg-white/42 p-4 shadow-[0_22px_70px_rgba(114,126,170,0.12)] backdrop-blur-2xl sm:p-5">
      <div className="mb-4 flex items-center justify-between px-1">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Task flow</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-[#172033]">
            {navItems.find((item) => item.key === view)?.label}
          </h2>
        </div>
        <button className="hidden items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-xs text-slate-500 ring-1 ring-white/80 sm:flex">
          Smart order <ChevronDown size={14} />
        </button>
      </div>

      <AnimatePresence mode="popLayout">
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                trashMode={view === 'trash'}
                onToggle={() => onToggle(task)}
                onDelete={() => onDelete(task)}
                onRestore={() => onRestore(task)}
                onDeleteForever={() => onDeleteForever(task.id)}
                onEdit={() => onEdit(task)}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid min-h-52 place-items-center rounded-[1.8rem] border border-dashed border-white/80 bg-white/35 text-center"
          >
            <div>
              <Sparkles className="mx-auto mb-3 text-[#b99cff]" />
              <p className="font-medium text-slate-700">这里现在很安静</p>
              <p className="mt-1 text-sm text-slate-400">添加一个任务，或者换个视图看看。</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function TaskCard({
  task,
  trashMode,
  onToggle,
  onDelete,
  onRestore,
  onDeleteForever,
  onEdit,
}: {
  task: Task
  trashMode: boolean
  onToggle: () => void
  onDelete: () => void
  onRestore: () => void
  onDeleteForever: () => void
  onEdit: () => void
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      className="group rounded-[1.7rem] border border-white/72 bg-white/70 p-4 shadow-[0_16px_45px_rgba(114,126,170,0.10)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/86"
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={trashMode}
          className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 transition ${
            task.completed
              ? 'bg-[#172033] text-white ring-[#172033]'
              : 'bg-white/80 text-slate-400 ring-slate-200 hover:text-[#7b8cff]'
          } ${trashMode ? 'opacity-40' : ''}`}
        >
          {task.completed ? <Check size={15} /> : <Circle size={13} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3
                className={`text-base font-semibold tracking-[-0.03em] text-[#172033] ${
                  task.completed ? 'text-slate-400 line-through decoration-slate-300' : ''
                }`}
              >
                {task.title}
              </h3>
              {task.description && <p className="mt-1 text-sm leading-6 text-slate-500">{task.description}</p>}
            </div>
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs ring-1 ${priorityMeta[task.priority].className}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${priorityMeta[task.priority].dot}`} />
              {priorityMeta[task.priority].label}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {task.dueDate && (
              <span className="rounded-full bg-white/65 px-3 py-1 ring-1 ring-white/80">{formatDate(task.dueDate)}</span>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#f4f0ff] px-3 py-1 text-[#7b6fd6]">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {trashMode ? (
            <>
              <IconButton label="恢复" onClick={onRestore} icon={<ArchiveRestore size={15} />} />
              <IconButton label="永久删除" onClick={onDeleteForever} icon={<X size={15} />} danger />
            </>
          ) : (
            <>
              <IconButton label="编辑" onClick={onEdit} icon={<Edit3 size={15} />} />
              <IconButton label="删除" onClick={onDelete} icon={<Trash2 size={15} />} danger />
            </>
          )}
        </div>
      </div>
    </motion.article>
  )
}

function IconButton({ label, icon, onClick, danger = false }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-full bg-white/70 ring-1 ring-white/80 transition hover:-translate-y-0.5 ${
        danger ? 'text-rose-500' : 'text-slate-500'
      }`}
    >
      {icon}
    </button>
  )
}

function MobileNav({ view, setView }: { view: ViewKey; setView: (view: ViewKey) => void }) {
  const items = navItems.slice(0, 4)
  return (
    <nav className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 justify-between rounded-full border border-white/70 bg-white/75 p-2 shadow-[0_18px_60px_rgba(114,126,170,0.18)] backdrop-blur-2xl lg:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const active = view === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-full px-3 py-2 text-[11px] transition ${
              active ? 'bg-[#172033] text-white' : 'text-slate-400'
            }`}
          >
            <Icon size={16} />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

function EditSheet({
  task,
  setTask,
  onSave,
}: {
  task: Task | null
  setTask: (task: Task | null) => void
  onSave: () => void
}) {
  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30 grid place-items-end bg-slate-900/18 p-3 backdrop-blur-sm sm:place-items-center"
          onClick={() => setTask(null)}
        >
          <motion.section
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_26px_90px_rgba(50,60,90,0.22)] backdrop-blur-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Edit task</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">调整任务</h2>
              </div>
              <button onClick={() => setTask(null)} className="rounded-full bg-white/80 p-2 text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={task.title}
                onChange={(event) => setTask({ ...task, title: event.target.value })}
                className="w-full rounded-2xl bg-white/75 px-4 py-3 outline-none ring-1 ring-white/80"
              />
              <textarea
                value={task.description}
                onChange={(event) => setTask({ ...task, description: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-2xl bg-white/75 px-4 py-3 outline-none ring-1 ring-white/80"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={task.priority}
                  onChange={(event) => setTask({ ...task, priority: event.target.value as Priority })}
                  className="rounded-2xl bg-white/75 px-4 py-3 outline-none ring-1 ring-white/80"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <input
                  type="date"
                  value={task.dueDate}
                  onChange={(event) => setTask({ ...task, dueDate: event.target.value })}
                  className="rounded-2xl bg-white/75 px-4 py-3 outline-none ring-1 ring-white/80"
                />
              </div>
              <input
                value={task.tags.join(', ')}
                onChange={(event) => setTask({ ...task, tags: parseTags(event.target.value) })}
                className="w-full rounded-2xl bg-white/75 px-4 py-3 outline-none ring-1 ring-white/80"
              />
            </div>
            <button
              type="button"
              onClick={onSave}
              className="mt-5 w-full rounded-2xl bg-[#172033] px-5 py-3 font-medium text-white shadow-xl shadow-slate-400/30"
            >
              保存调整
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function parseTags(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6)
}

function formatDate(value: string) {
  if (!value) return '无日期'
  const today = todayKey()
  if (value === today) return '今天'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (value === tomorrow.toISOString().slice(0, 10)) return '明天'
  return value.slice(5).replace('-', '/')
}

function isTask(task: unknown): task is Task {
  if (!task || typeof task !== 'object') return false
  const item = task as Partial<Task>
  return typeof item.id === 'string' && typeof item.title === 'string'
}

function createStarterTasks(): Task[] {
  const now = nowIso()
  return [
    {
      id: crypto.randomUUID(),
      title: '整理今天最重要的一件事',
      description: '先把注意力放在一个明确目标上。',
      completed: false,
      priority: 'high',
      dueDate: todayKey(),
      tags: ['focus', 'today'],
      deleted: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: '试试编辑、完成和回收站',
      description: '这是示例任务，可以随时删除。',
      completed: false,
      priority: 'medium',
      dueDate: todayKey(),
      tags: ['demo'],
      deleted: false,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

export default App
