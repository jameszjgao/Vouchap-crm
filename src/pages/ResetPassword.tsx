import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Login.css';

export default function ResetPassword({ onDone }: { onDone?: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      setDone(true);
      setLoading(false);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>设置新密码</h1>
        <p className="login-subtitle">此密码只用于 Adaven CRM（Hub），与 Vouchap 产品登录无关。</p>
        {done && !onDone ? (
          <p className="login-ok">密码已更新，请使用新密码登录。</p>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label>
              <span>新密码</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>确认新密码</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading} className="login-btn">
              {loading ? '保存中…' : '保存密码'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
