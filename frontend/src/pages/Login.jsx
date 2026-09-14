import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogoReversed from '../components/Brand/LogoReversed.jsx';
import Button from '../components/UI/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
      showToast('Signed in successfully', 'success');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-panel-left">
        <LogoReversed height={30} />
        <div>
          <h2 className="auth-headline">Real-time fuel intelligence for Malawi&rsquo;s freight fleets</h2>
          <p className="auth-support">
            Track trucks, monitor fuel levels, and detect suspicious fuel losses across your
            fleet from a single live dashboard.
          </p>
        </div>
        <div className="auth-footer">MUBAS &middot; Final Year Project 2026</div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-card">
          <h1>Sign in</h1>
          <p className="card-subtitle">Access your Freight Malawi fleet console</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username"
                className="form-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="form-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</p>}
            <Button type="submit" variant="primary" size="lg" loading={loading} style={{ width: '100%' }}>
              Sign in
            </Button>
          </form>

          <div className="auth-switch-link">
            Don&rsquo;t have an account? <Link to="/register">Register</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
