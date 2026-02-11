import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Nav } from './components/Nav'
import { Home } from './pages/Home'
import { Explore } from './pages/Explore'
import { AgentProfile } from './pages/AgentProfile'
import { Dashboard } from './pages/Dashboard'
import { ClaimInvite } from './pages/ClaimInvite'
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
            <Route path="/explore" element={<Explore />} />
            <Route path="/agent/:id" element={<AgentProfile />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:connectionId" element={<Conversation />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/claim/:token" element={<ClaimInvite />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
