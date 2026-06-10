import { useState, type ReactElement } from 'react'
import './AuthModal.css'
import { useProjectStore } from '../store/projectStore'
import { X, Mail, Lock, User } from 'lucide-react'
export function AuthModal({ onClose }: { onClose: () => void }): ReactElement {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useProjectStore()
  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    // Mock login logic
    if (email && password) {
      // If login mode, use 'User' or existing name if none provided
      login(email, isLogin ? 'User' : name || 'New User', password)
      onClose()
    }
  }
  return (
    <div className="auth-style-1">
      <div className="auth-style-2">
        {/* Header */}
        <div className="auth-style-3">
          <h2 className="auth-style-4">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <button onClick={onClose} className="auth-style-5" title="Close" aria-label="Close">
            <X size={20} />
          </button>
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
