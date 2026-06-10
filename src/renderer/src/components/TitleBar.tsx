import React, { useState, useRef, useEffect } from 'react'
import './TitleBar.css'
import { Minimize, Maximize, X, Film } from 'lucide-react'
import { useProjectStore } from '../store/projectStore'
import { AuthModal } from './AuthModal'
import { SettingsModal } from './SettingsModal'
import { ExportModal } from './ExportModal'

export function TitleBar(): React.ReactElement {
  const [openMenu, setOpenMenu] = useState<'File' | 'Edit' | 'Settings' | 'User' | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const titlebarRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const { past, future, newProject, loadProject, currentUser, logout } = useProjectStore()
  useEffect(() => {
    titlebarRef.current?.style.setProperty('-webkit-app-region', 'drag')
    menuRef.current?.style.setProperty('-webkit-app-region', 'no-drag')
    centerRef.current?.style.setProperty('-webkit-app-region', 'no-drag')
    rightRef.current?.style.setProperty('-webkit-app-region', 'no-drag')
  }, [])
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const handleMinimize = (): void => {
    window.electron.ipcRenderer.send('window-minimize')
  }
  const handleMaximize = (): void => {
    window.electron.ipcRenderer.send('window-maximize')
  }
  const handleClose = (): void => {
    window.electron.ipcRenderer.send('window-close')
  }
  const handleSaveProject = async (): Promise<void> => {
    const state = useProjectStore.getState()
    const projectData = {
      clips: state.clips,
      mediaLibrary: state.mediaLibrary,
      deletedSections: state.deletedSections,
      targetDuration: state.targetDuration,
      autoAdjustTargetDuration: state.autoAdjustTargetDuration
    }
    await window.api.saveProject(JSON.stringify(projectData, null, 2))
    setOpenMenu(null)
  }
  const handleOpenProject = async (): Promise<void> => {
    const result = await window.api.openProject()
    if (result) {
      try {
        const parsed = JSON.parse(result.data)
        loadProject(parsed)
      } catch (err) {
        console.error('Failed to parse project file', err)
      }
    }
    setOpenMenu(null)
  }
  return (
    <div ref={titlebarRef} className="titlebar titlebar-style-1">
      <div className="titlebar-left">
        <Film size={16} color="var(--color-accent)" />
        <span className="titlebar-style-2">Express Reels</span>

        {/* Main Menus */}
        <div ref={menuRef} className="titlebar-style-3">
          <div className="titlebar-style-4">
            <div
              onClick={() => setOpenMenu(openMenu === 'File' ? null : 'File')}
              className={`menu-trigger${openMenu === 'File' ? ' menu-trigger--active' : ''}`}
            >
              File
            </div>
            {openMenu === 'File' && (
              <div className="titlebar-style-5">
                <div
                  onClick={() => {
                    newProject()
                    setOpenMenu(null)
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-bg-light)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  className="titlebar-style-6"
                >
                  New Project
                </div>
                <div
                  onClick={handleOpenProject}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-bg-light)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  className="titlebar-style-7"
                >
                  Open Project...
                </div>
                <div
                  onClick={handleSaveProject}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-bg-light)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  className="titlebar-style-8"
                >
                  Save Project...
                </div>
              </div>
            )}
          </div>

          <div className="titlebar-style-9">
            <div
              onClick={() => setOpenMenu(openMenu === 'Edit' ? null : 'Edit')}
              className={`menu-trigger${openMenu === 'Edit' ? ' menu-trigger--active' : ''}`}
            >
              Edit
            </div>
            {openMenu === 'Edit' && (
              <div className="titlebar-style-10">
                <div
                  className={`menu-item titlebar-style-11${past.length === 0 ? ' menu-item--disabled' : ''}`}
                  onClick={() => {
                    if (past.length > 0) {
                      useProjectStore.getState().undo()
                      setOpenMenu(null)
                    }
                  }}
                >
                  <span>Undo</span>
                  <span className="titlebar-style-12">Ctrl+Z</span>
                </div>
                <div
                  className={`menu-item titlebar-style-13${future.length === 0 ? ' menu-item--disabled' : ''}`}
                  onClick={() => {
                    if (future.length > 0) {
                      useProjectStore.getState().redo()
                      setOpenMenu(null)
                    }
                  }}
                >
                  <span>Redo</span>
                  <span className="titlebar-style-14">Ctrl+Y</span>
                </div>
              </div>
            )}
          </div>

          <div className="titlebar-style-15">
            <div
              onClick={() => {
                setShowSettingsModal(true)
                setOpenMenu(null)
              }}
              className="menu-trigger"
            >
              Settings
            </div>
          </div>

          <div className="titlebar-style-16">
            <div
              onClick={() => {
                if (!currentUser) {
                  setShowAuthModal(true)
                  setOpenMenu(null)
                } else {
                  setOpenMenu(openMenu === 'User' ? null : 'User')
                }
              }}
              className={`menu-trigger titlebar-style-17${openMenu === 'User' ? ' menu-trigger--active' : ''}`}
            >
              {currentUser ? currentUser.name : 'Login'}
            </div>

            {openMenu === 'User' && currentUser && (
              <div className="titlebar-style-18">
                <div className="titlebar-style-19">{currentUser.email}</div>
                <div
                  onClick={() => {
                    setShowSettingsModal(true)
                    setOpenMenu(null)
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-bg-light)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  className="titlebar-style-20"
                >
                  Profile & Settings
                </div>
                <div
                  onClick={() => {
                    logout()
                    setOpenMenu(null)
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--color-bg-light)')
                  }
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  className="titlebar-style-21"
                >
                  Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={centerRef} className="titlebar-center titlebar-style-22">
        {/* Toggle removed per user request */}
      </div>

      <div ref={rightRef} className="titlebar-right titlebar-style-23">
        <button onClick={() => setShowExportModal(true)} className="titlebar-style-24">
          Export
        </button>
        <button className="window-control-btn" onClick={handleMinimize} title="Minimize">
          <Minimize size={14} />
        </button>
        <button className="window-control-btn" onClick={handleMaximize} title="Maximize">
          <Maximize size={14} />
        </button>
        <button className="window-control-btn close" onClick={handleClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  )
}
