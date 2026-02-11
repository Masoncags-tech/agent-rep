import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { AgentProfile } from './pages/AgentProfile'
import { Dashboard } from './pages/Dashboard'
import { Messages } from './pages/Messages'
import { Conversation } from './pages/Conversation'
import { Friends } from './pages/Friends'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[var(--bg-primary)]">
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agent/:id" element={<AgentProfile />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:connectionId" element={<Conversation />} />
            <Route path="/friends" element={<Friends />} />
            {/* Redirect old routes */}
            <Route path="/explore" element={<Navigate to="/dashboard" replace />} />
            <Route path="/claim/:token" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
