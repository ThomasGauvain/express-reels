import { useState, type ReactElement } from 'react'
import './AuthModal.css'
import { useProjectStore } from '../store/projectStore'
import { X, Mail, Lock, User } from 'lucide-react'

export function AuthModal({ onClose }: { onClose: () => void }): ReactElement {
  const { login } = useProjectStore()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    login(email, isLogin ? 'Demo User' : name, password)
    onClose()
  }

  return (
    <div className="auth-style-1">
      <div className="auth-style-2">
        <button onClick={onClose} className="auth-style-3" aria-label="Close" title="Close">
          <X size={16} />
        </button>

        {/* Header */}
        <div className="auth-style-4">
          <div className="auth-style-5">
            <User size={20} className="text-white" />
          </div>
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{isLogin ? 'Sign in to access your projects' : 'Sign up to start creating'}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-style-6">
          {!isLogin && (
            <div className="auth-style-7">
              <label className="auth-style-8">Full Name</label>
              <div className="auth-style-9">
                <User size={16} className="auth-style-10" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="auth-style-11"
                />
              </div>
            </div>
          )}

          <div className="auth-style-12">
            <label className="auth-style-13">Email Address</label>
            <div className="auth-style-14">
              <Mail size={16} className="auth-style-15" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="auth-style-16"
              />
            </div>
          </div>

          <div className="auth-style-17">
            <label className="auth-style-18">Password</label>
            <div className="auth-style-19">
              <Lock size={16} className="auth-style-20" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="auth-style-21"
              />
            </div>
          </div>

          <button type="submit" className="auth-style-22">
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-style-23">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => setIsLogin(!isLogin)} className="auth-style-24">
            {isLogin ? 'Create one' : 'Sign in'}
          </span>
        </div>
      </div>
    </div>
  )
}
