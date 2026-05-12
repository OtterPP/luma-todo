import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Dexie, { type Table } from 'dexie'
import {
  ArchiveRestore,
  Calendar,
  Check,
  ChevronDown,
  Circle,
  Download,
  Edit3,
  Flag,
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

type Stats = {
  active: number
  today: number
  completed: number
  high: number
  overdue: number
  total: number
  completionRate: number
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

const viewCopy: Record<ViewKey, { title: string; kicker: string }> = {
  today: { title: '今日任务', kicker: '把注意力留给眼前这一轮' },
  all: { title: '全部任务', kicker: '完整视野，轻一点推进' },
  important: { title: '重要任务', kicker: '先处理高影响事项' },
  completed: { title: '已完成', kicker: '这些都已经落地了' },
  overdue: { title: '逾期任务', kicker: '把拖住你的事情重新排队' },
  trash: { title: '回收站', kicker: '可以恢复，也可以彻底清理' },
}

const priorityMeta: Record<Priority, { label: string; className: string; dot: string; rail: string }> = {
  low: {
    label: '低',
    className: 'bg-teal-50 text-teal-700 ring-teal-100',
    dot: 'bg-teal-400',
    rail: 'bg-teal-400',
  },
  medium: {
    label: '中',
    className: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
    dot: 'bg-indigo-400',
    rail: 'bg-indigo-400',
  },
  high: {
    label: '高',
    className: 'bg-rose-50 text-rose-700 ring-rose-100',
    dot: 'bg-rose-400',
    rail: 'bg-rose-400',
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

  const stats = useMemo<Stats>(() => {
    const active = tasks.filter((task) => !task.deleted)
    const today = todayKey()
    const completed = active.filter((task) => task.completed).length
    const total = active.length

    return {
      active: active.filter((task) => !task.completed).length,
      today: active.filter((task) => task.dueDate === today && !task.completed).length,
      completed,
      high: active.filter((task) => task.priority === 'high' && !task.completed).length,
      overdue: active.filter((task) => task.dueDate && task.dueDate < today && !task.completed).length,
      total,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
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
    <main className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <div className="fixed inset-x-0 top-0 h-72 bg-[linear-gradient(135deg,#172033_0%,#24324a_48%,#445a7c_100%)]" />
      <div className="fixed inset-0 bg-[linear-gradient(90deg,rgba(23,32,51,0.05)_1px,transparent_1px),linear-gradient(rgba(23,32,51,0.05)_1px,transparent_1px)] bg-[size:42px_42px] opacity-40" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[272px_1fr] lg:px-8 lg:py-7">
        <DesktopSidebar view={view} setView={setView} stats={stats} />

        <div className="min-w-0 pb-24 lg:pb-0">
          <Header query={query} setQuery={setQuery} onExport={exportTasks} onImport={importTasks} />
          <Dashboard stats={stats} />
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

function DesktopSidebar({ view, setView, stats }: { view: ViewKey; setView: (view: ViewKey) => void; stats: Stats }) {
  return (
    <aside className="sticky top-7 hidden h-[calc(100vh-3.5rem)] flex-col rounded-lg border border-white/12 bg-[#111827]/92 p-4 text-white shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-xl lg:flex">
      <div className="mb-8 flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#172033] shadow-lg shadow-slate-950/20">
          <Sparkles size={20} />
        </div>
        <div>
          <p className="text-lg font-semibold">LumaTodo</p>
          <p className="text-xs text-slate-300">local focus desk</p>
        </div>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = view === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${
                active
                  ? 'bg-white text-[#172033] shadow-sm'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon size={17} />
                {item.label}
              </span>
              {item.key === 'all' && <span className="text-xs opacity-70">{stats.active}</span>}
              {item.key === 'overdue' && stats.overdue > 0 && <span className="text-xs text-rose-300">{stats.overdue}</span>}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-white/10 bg-white/8 p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
          <span>完成率</span>
          <span>{stats.completionRate}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/12">
          <div className="h-full rounded-full bg-[#7dd3fc]" style={{ width: `${stats.completionRate}%` }} />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-200">今天先拿下一件最关键的事。</p>
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
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center justify-between lg:hidden">
        <div>
          <p className="text-xl font-semibold text-white">LumaTodo</p>
          <p className="text-xs text-slate-200">精致本地待办空间</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-[#172033]">
          <Sparkles size={20} />
        </div>
      </div>

      <label className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-white/70 bg-white/92 px-4 py-3 text-sm text-slate-500 shadow-sm backdrop-blur">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索任务、标签或描述"
          className="min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
        />
      </label>

      <div className="flex gap-2">
        <label
          className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg border border-white/70 bg-white/92 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          title="导入 JSON"
        >
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
          className="grid h-11 w-11 place-items-center rounded-lg bg-[#f97316] text-white shadow-sm transition hover:-translate-y-0.5"
          title="导出 JSON"
        >
          <Download size={17} />
        </button>
      </div>
    </header>
  )
}

function Dashboard({ stats }: { stats: Stats }) {
  return (
    <section className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="overflow-hidden rounded-lg bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 p-5 sm:grid-cols-[1fr_160px] sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase text-[#f97316]">Today</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight text-[#172033] sm:text-4xl">
              把今天变轻一点。
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
              还有 {stats.today} 件今日事项，先处理最值得注意的一件，剩下的慢慢排好。
            </p>
          </div>
          <ProgressRing value={stats.completionRate} />
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100 sm:grid-cols-4">
          <MiniStat label="今日" value={stats.today} tone="text-sky-600" />
          <MiniStat label="进行中" value={stats.active} tone="text-[#172033]" />
          <MiniStat label="重要" value={stats.high} tone="text-rose-600" />
          <MiniStat label="完成" value={stats.completed} tone="text-teal-600" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <InsightCard icon={<Flag size={18} />} label="高优先级" value={stats.high} accent="bg-rose-500" />
        <InsightCard icon={<Inbox size={18} />} label="需要追回" value={stats.overdue} accent="bg-amber-500" />
        <InsightCard icon={<Check size={18} />} label="全部记录" value={stats.total} accent="bg-teal-500" />
      </div>
    </section>
  )
}

function ProgressRing({ value }: { value: number }) {
  return (
    <div className="grid place-items-center">
      <div
        className="grid h-32 w-32 place-items-center rounded-full"
        style={{ background: `conic-gradient(#14b8a6 ${value * 3.6}deg, #e5e7eb 0deg)` }}
      >
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white">
          <div className="text-center">
            <p className="text-3xl font-semibold text-[#172033]">{value}%</p>
            <p className="text-xs text-slate-400">完成率</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="border-r border-slate-100 px-5 py-4 last:border-r-0">
      <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  )
}

function InsightCard({ icon, label, value, accent }: { icon: ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white bg-white/95 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <span className={`grid h-10 w-10 place-items-center rounded-md text-white ${accent}`}>{icon}</span>
      <div>
        <p className="text-2xl font-semibold text-[#172033]">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
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
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 xl:grid-cols-[1fr_140px_150px_52px]">
        <label className="flex min-w-0 items-center gap-3 rounded-md bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
          <Plus size={18} className="text-[#f97316]" />
          <input
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onAdd()
            }}
            placeholder="What needs your attention?"
            className="min-w-0 flex-1 bg-transparent text-[0.98rem] outline-none placeholder:text-slate-400"
          />
        </label>
        <select
          value={draft.priority}
          onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}
          className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none ring-1 ring-slate-100"
        >
          <option value="low">低优先级</option>
          <option value="medium">中优先级</option>
          <option value="high">高优先级</option>
        </select>
        <input
          type="date"
          value={draft.dueDate}
          onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
          className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none ring-1 ring-slate-100"
        />
        <button
          type="button"
          onClick={onAdd}
          className="grid h-12 place-items-center rounded-md bg-[#172033] text-white shadow-sm transition hover:-translate-y-0.5"
          title="添加任务"
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_280px]">
        <input
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          placeholder="补充一点描述，可留空"
          className="rounded-md bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-100 placeholder:text-slate-400"
        />
        <input
          value={draft.tags}
          onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
          placeholder="标签，用逗号分隔"
          className="rounded-md bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-100 placeholder:text-slate-400"
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
    <section className="min-h-[360px]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-400">{viewCopy[view].kicker}</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#172033]">{viewCopy[view].title}</h2>
        </div>
        <button className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 shadow-sm sm:flex">
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
            className="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-300 bg-white/70 text-center"
          >
            <div>
              <Sparkles className="mx-auto mb-3 text-[#f97316]" />
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(15,23,42,0.11)]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${priorityMeta[task.priority].rail}`} />
      <div className="flex gap-3 pl-1">
        <button
          type="button"
          onClick={onToggle}
          disabled={trashMode}
          className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 transition ${
            task.completed
              ? 'bg-[#172033] text-white ring-[#172033]'
              : 'bg-white text-slate-400 ring-slate-200 hover:text-[#f97316]'
          } ${trashMode ? 'opacity-40' : ''}`}
        >
          {task.completed ? <Check size={15} /> : <Circle size={13} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3
                className={`text-base font-semibold text-[#172033] ${
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
            {task.dueDate && <span className="rounded-md bg-slate-50 px-2.5 py-1">{formatDate(task.dueDate)}</span>}
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-indigo-50 px-2.5 py-1 text-indigo-600">
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

function IconButton({ label, icon, onClick, danger = false }: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md bg-slate-50 ring-1 ring-slate-100 transition hover:-translate-y-0.5 ${
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
    <nav className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 justify-between rounded-lg border border-slate-200 bg-white/92 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:hidden">
      {items.map((item) => {
        const Icon = item.icon
        const active = view === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-md px-3 py-2 text-[11px] transition ${
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
          className="fixed inset-0 z-30 grid place-items-end bg-slate-950/35 p-3 backdrop-blur-sm sm:place-items-center"
          onClick={() => setTask(null)}
        >
          <motion.section
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl rounded-lg border border-white bg-white p-5 shadow-[0_26px_90px_rgba(15,23,42,0.25)]"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Edit task</p>
                <h2 className="mt-1 text-2xl font-semibold">调整任务</h2>
              </div>
              <button onClick={() => setTask(null)} className="rounded-md bg-slate-50 p-2 text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={task.title}
                onChange={(event) => setTask({ ...task, title: event.target.value })}
                className="w-full rounded-md bg-slate-50 px-4 py-3 outline-none ring-1 ring-slate-100"
              />
              <textarea
                value={task.description}
                onChange={(event) => setTask({ ...task, description: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-md bg-slate-50 px-4 py-3 outline-none ring-1 ring-slate-100"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={task.priority}
                  onChange={(event) => setTask({ ...task, priority: event.target.value as Priority })}
                  className="rounded-md bg-slate-50 px-4 py-3 outline-none ring-1 ring-slate-100"
                >
                  <option value="low">低优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="high">高优先级</option>
                </select>
                <input
                  type="date"
                  value={task.dueDate}
                  onChange={(event) => setTask({ ...task, dueDate: event.target.value })}
                  className="rounded-md bg-slate-50 px-4 py-3 outline-none ring-1 ring-slate-100"
                />
              </div>
              <input
                value={task.tags.join(', ')}
                onChange={(event) => setTask({ ...task, tags: parseTags(event.target.value) })}
                className="w-full rounded-md bg-slate-50 px-4 py-3 outline-none ring-1 ring-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={onSave}
              className="mt-5 w-full rounded-md bg-[#172033] px-5 py-3 font-medium text-white shadow-sm"
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
