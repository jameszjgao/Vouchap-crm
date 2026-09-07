import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? '邮箱或密码不正确。Hub 是独立登录，不能用 Vouchap / 旧 CRM 密码。'
            : authError.message,
        );
        setLoading(false);
        return;
      }
      if (!data?.user) {
        setError('登录失败，请重试');
        setLoading(false);
        return;
      }
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('请先填写邮箱，再发送重置邮件');
      return;
    }
    setResetting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(
          `${resetError.message}。Hub 若未配置发信，请让已登录的管理员在「团队人员」里直接设新密码。`,
        );
      } else {
        setInfo('如果该邮箱在运营名单中，重置链接已发送。未收到邮件时，请让管理员在「团队人员」里重置。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Adaven 运营管理</h1>
        <p className="login-subtitle">使用 Hub 运营账号登录（与 Vouchap 产品账号不是同一套）</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@example.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          {info && <p className="login-ok">{info}</p>}
          <button type="submit" disabled={loading} className="login-btn">
            {loading ? '登录中…' : '登录'}
          </button>
          <button type="button" className="login-link" disabled={resetting} onClick={handleForgot}>
            {resetting ? '发送中…' : '忘记密码'}
          </button>
        </form>
      </div>
    </div>
  );
}
