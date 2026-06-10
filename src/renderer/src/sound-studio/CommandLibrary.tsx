import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'

export interface Command {
  id: string
  label: string
  prompt: string
}

const DEFAULT_COMMANDS: Command[] = [
  {
    id: '1',
    label: 'Add Melody',
    prompt: 'Add a melodic lead line that complements the existing tracks'
  },
  {
    id: '2',
    label: 'Add Bass Line',
    prompt: 'Add a deep bass line that follows the kick drum pattern'
  },
  {
    id: '3',
    label: 'Add Drum Loop',
    prompt: 'Generate a 4-bar drum loop using kick, snare, and hi-hat'
  },
  {
    id: '4',
    label: 'Trap Hats',
    prompt: 'Add 16th-note hi-hat rolls with every other hit at 50% velocity for a trap feel'
  },
  { id: '5', label: 'Add Reverb', prompt: 'Apply moderate reverb to all existing tracks' },
  {
    id: '6',
    label: 'Double BPM',
    prompt: 'Double the current BPM and compress note durations to match'
  },
  {
    id: '7',
    label: 'Halve BPM',
    prompt: 'Halve the current BPM and stretch note durations to match'
  },
  {
    id: '8',
    label: 'Fill Gaps',
    prompt: 'Add complementary notes to any silent sections of the timeline'
  },
  {
    id: '9',
    label: 'Randomize',
    prompt:
      'Generate a completely random composition using the current BPM and available instruments'
  }
]

interface CommandLibraryProps {
  onCommand: (prompt: string) => void
}

export function CommandLibrary({ onCommand }: CommandLibraryProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(true)
  const [commands, setCommands] = useState<Command[]>(DEFAULT_COMMANDS)
  const [isAdding, setIsAdding] = useState(false)
  const [editLabel, setEditLabel] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Apply dynamic x/y imperatively so no style={{}} is needed in JSX
  useLayoutEffect(() => {
    if (contextMenuRef.current && contextMenu) {
      contextMenuRef.current.style.left = `${contextMenu.x}px`
      contextMenuRef.current.style.top = `${contextMenu.y}px`
    }
  }, [contextMenu])

  // Load from settings
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).soundStudioApi as
      | { readSettings: (k: string) => Promise<string | null> }
      | undefined
    if (!api) return
    api.readSettings('commandLibrary').then((raw) => {
      if (raw) {
        try {
          setCommands(JSON.parse(raw))
        } catch {
          // use defaults
        }
      }
    })
  }, [])

  const persist = (cmds: Command[]): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).soundStudioApi as
      | { writeSettings: (k: string, v: string) => void }
      | undefined
    api?.writeSettings('commandLibrary', JSON.stringify(cmds))
  }

  const handleAdd = (): void => {
    if (!editLabel.trim() || !editPrompt.trim()) return
    const newCmd: Command = {
      id: crypto.randomUUID(),
      label: editLabel.trim(),
      prompt: editPrompt.trim()
    }
    const updated = [...commands, newCmd]
    setCommands(updated)
    persist(updated)
    setEditLabel('')
    setEditPrompt('')
    setIsAdding(false)
  }

  const handleDelete = (id: string): void => {
    const updated = commands.filter((c) => c.id !== id)
    setCommands(updated)
    persist(updated)
    setContextMenu(null)
  }

  const handleRightClick = (e: React.MouseEvent, id: string): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, id })
  }

  // Close context menu on outside click
  useEffect(() => {
    const handler = (): void => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  return (
    <div className="ss-command-library">
      {/* Header */}
      <div className="ss-section-header" onClick={() => setIsExpanded((v) => !v)}>
        <span>⚡ Command Library</span>
        <div className="ss-command-header-actions">
          <span className="ss-section-header-badge">{commands.length}</span>
          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </div>
      </div>

      {isExpanded && (
        <div className="ss-fade-in">
          <div className="ss-command-list">
            {commands.map((cmd) => (
              <button
                key={cmd.id}
                className="ss-command-chip"
                onClick={() => onCommand(cmd.prompt)}
                onContextMenu={(e) => handleRightClick(e, cmd.id)}
                title={cmd.prompt}
              >
                {cmd.label}
              </button>
            ))}
            <button className="ss-command-add-btn" onClick={() => setIsAdding(true)}>
              + Add
            </button>
          </div>

          {isAdding && (
            <div className="ss-command-edit-form">
              <input
                className="ss-input"
                placeholder="Label (e.g. Punchy Kick)"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                autoFocus
              />
              <input
                className="ss-input"
                placeholder="Prompt sent to Gemini..."
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                  if (e.key === 'Escape') setIsAdding(false)
                }}
              />
              <div className="ss-command-form-actions">
                <button className="ss-btn ss-btn--small primary" onClick={handleAdd}>
                  Save
                </button>
                <button className="ss-btn ss-btn--small" onClick={() => setIsAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="ss-context-menu" onClick={(e) => e.stopPropagation()}>
          <button className="ss-context-menu-item" onClick={() => handleDelete(contextMenu.id)}>
            <X size={10} /> Delete Command
          </button>
        </div>
      )}
    </div>
  )
}
