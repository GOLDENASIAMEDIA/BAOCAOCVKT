import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import EmployeeDashboard from './components/EmployeeDashboard';
import LeaderDashboard from './components/LeaderDashboard';
import SubmissionTracker from './components/SubmissionTracker';
import GoldenAsiaEcosystem from './components/GoldenAsiaEcosystem';
import AdminSettings from './components/AdminSettings';
import { db } from './db';
import {
  LogOut, Sun, Moon, Info, ClipboardList, Settings,
  LayoutDashboard, CalendarCheck2, Menu, X
} from 'lucide-react';

const ADMIN_NAV = [
  { id: 'overview', label: 'Tổng quan báo cáo', icon: LayoutDashboard },
  { id: 'tracking', label: 'Theo dõi nộp báo cáo', icon: CalendarCheck2 },
  { id: 'ecosystem', label: 'Kênh dịch vụ Golden Asia', icon: Info },
  { id: 'settings', label: 'Cấu hình hệ thống', icon: Settings },
];

const USER_NAV = [
  { id: 'reports', label: 'Báo cáo của tôi', icon: ClipboardList },
  { id: 'ecosystem', label: 'Kênh dịch vụ Golden Asia', icon: Info },
];

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('reports');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const user = await db.auth.getCurrentUser();
      setCurrentUser(user);
      if (user) setActiveTab(user.role === 'admin' ? 'overview' : 'reports');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setActiveTab(user.role === 'admin' ? 'overview' : 'reports');
  };

  const handleLogout = async () => {
    await db.auth.signOut();
    setCurrentUser(null);
    setSidebarOpen(false);
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle('dark-mode');
  };

  const selectTab = (id) => {
    setActiveTab(id);
    setSidebarOpen(false);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)'
      }}>
        <div className="spinner" style={{ width: '3rem', height: '3rem', color: 'var(--accent-color)', marginBottom: '1rem' }}></div>
        <p style={{ fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>Đang khởi động ứng dụng...</p>
      </div>
    );
  }

  // ── Login screen (no sidebar) ──────────────────────────────────────────────
  if (!currentUser) {
    return (
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <button className="icon-btn" onClick={toggleTheme} title="Đổi giao diện sáng/tối">
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <Auth onAuthSuccess={handleAuthSuccess} />
      </main>
    );
  }

  const navItems = currentUser.role === 'admin' ? ADMIN_NAV : USER_NAV;
  const activeNav = navItems.find(n => n.id === activeTab) || navItems[0];

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Golden Asia Logo"
            style={{ height: '2.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(217, 119, 87, 0.25)' }} />
          <div>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem',
              background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              GOLDEN ASIA
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              BÁO CÁO KỸ THUẬT
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id}
                className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => selectTab(item.id)}>
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.25rem' }}>
            <div className="user-avatar" style={{ width: '2.25rem', height: '2.25rem', fontSize: '0.9rem', flexShrink: 0 }}>
              {currentUser.full_name?.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {currentUser.full_name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {currentUser.role === 'admin' ? 'Quản trị viên' : (currentUser.position || 'Nhân viên')}
              </div>
            </div>
          </div>
          <button className="btn btn-danger w-full" onClick={handleLogout}
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="app-main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} title="Mở menu">
              <Menu size={18} />
            </button>
            <span className="topbar-title">{activeNav.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`badge ${currentUser.role === 'admin' ? 'badge-success' : 'badge-info'}`}>
              {currentUser.role === 'admin' ? 'Admin' : 'Nhân viên'}
            </span>
            <button className="icon-btn" onClick={toggleTheme}
              title={isDarkMode ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}>
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          {activeTab === 'overview' && currentUser.role === 'admin' && <LeaderDashboard />}
          {activeTab === 'tracking' && currentUser.role === 'admin' && <SubmissionTracker />}
          {activeTab === 'settings' && currentUser.role === 'admin' && <AdminSettings />}
          {activeTab === 'reports' && currentUser.role !== 'admin' && <EmployeeDashboard user={currentUser} />}
          {activeTab === 'ecosystem' && <GoldenAsiaEcosystem user={currentUser} />}
        </main>

        <footer style={{
          textAlign: 'center', padding: '1.5rem 0', fontSize: '0.8rem',
          color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', marginTop: 'auto'
        }}>
          <div className="container">
            <p>© 2026 Hệ thống Báo cáo Tiến độ Công việc kỹ thuật — Golden Asia.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
