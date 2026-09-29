import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../api/axios';
import { LogoReversed } from '../components/Brand/Logo';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter your username and password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await login({ username, password });
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fm-navy)', padding: 16 }}>
      <div className="fm-card fm-card-pad" style={{ width: '100%', maxWidth: 400, background: 'var(--fm-white)' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <LogoReversed height={26} />
        </div>
        <p style={{ textAlign: 'center', color: 'var(--fm-muted)', marginBottom: 20 }}>Sign in to your fleet dashboard</p>
        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="fm-badge fm-badge-red" style={{ display: 'block', marginBottom: 14, padding: 10 }}>{error}</div>}
          <div className="fm-field">
            <label htmlFor="login-username">Username</label>
            <input id="login-username" className="fm-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="fm-field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" className="fm-input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="fm-btn fm-btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={submitting}>
            <LogIn size={16} /> {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>
          New to Freight Malawi? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
