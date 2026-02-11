import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConnections } from '../hooks/useMessages'

export function Nav() {
  const { user, isSignedIn, signIn, signOut } = useAuth()
  const location = useLocation()
  const { connections } = useConnections(user?.id)

  const isActive = (path: string) => location.pathname.startsWith(path)

  // Count unread messages from real connection data
  const unreadCount = isSignedIn
    ? connections
        .filter(c => c.status === 'accepted')
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0)
    : 0

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-card)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-bold">
            <span className="gradient-text">Clanked</span>
            <span className="text-[var(--text-secondary)]">In</span>
          </Link>
          {/* Search moved to Friends page */}
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          {isSignedIn && (
            <>
              <Link
                to="/dashboard"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive('/dashboard')
                    ? 'text-[var(--text-primary)] bg-[var(--bg-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span className="hidden md:inline">Dashboard</span>
              </Link>

              <Link
                to="/messages"
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive('/messages')
                    ? 'text-[var(--text-primary)] bg-[var(--bg-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden md:inline">Messages</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-pink)] px-1 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>

              <Link
                to="/friends"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive('/friends')
                    ? 'text-[var(--text-primary)] bg-[var(--bg-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="hidden md:inline">Friends</span>
              </Link>
            </>
          )}

          {isSignedIn ? (
            <div className="flex items-center gap-2 ml-2">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5">
                {user!.twitterAvatar ? (
                  <img
                    src={user!.twitterAvatar}
                    alt={user!.twitterName}
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-xs">
                    {user!.twitterName.charAt(0)}
                  </div>
                )}
                <span className="text-sm font-medium hidden md:inline">{user!.twitterName}</span>
              </div>
              <button
                onClick={signOut}
                className="text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                title="Sign out"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black hover:bg-[var(--accent-hover)] ml-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
