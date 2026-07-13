import React, { useState } from 'react';
import { db } from '../db';
import { LogIn, Key, Mail, ShieldCheck } from 'lucide-react';

export default function Auth({ onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user, error: loginError } = await db.auth.signIn(email, password);
      if (loginError) throw loginError;
      onAuthSuccess(user);
    } catch (err) {
      setError(err.message || 'Đã xảy ra lỗi, vui lòng kiểm tra lại!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="card-glass auth-card">
        <div className="text-center mb-3">
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Báo Cáo Kỹ Thuật
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Hệ thống quản lý & tổng hợp báo cáo tiến độ công việc
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid rgba(191, 77, 67, 0.25)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
              <input
                type="email"
                className="input-field w-full"
                placeholder="email@goldenasia.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                required
              />
            </div>
          </div>

          <div className="form-group mb-3">
            <label className="form-label">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <Key size={18} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
              <input
                type="password"
                className="input-field w-full"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={loading}
          >
            {loading ? (
              <div className="spinner"></div>
            ) : (
              <>
                <LogIn size={18} /> Đăng nhập
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px dashed var(--border-glass)'
        }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          <span>Tài khoản do công ty cấp. Liên hệ quản trị viên nếu bạn chưa có tài khoản hoặc quên mật khẩu.</span>
        </div>
      </div>
    </div>
  );
}
