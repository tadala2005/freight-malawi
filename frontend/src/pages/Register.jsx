import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogoReversed from '../components/Brand/LogoReversed.jsx';
import Button from '../components/UI/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function scorePassword(pw) {
  let score = 0;
  if (pw.length >= 6) score += 1;
  if (pw.length >= 10) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(score, 3); // 0-3 buckets: weak/fair/strong-ish
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  const errors = {
    username: username.length > 0 && username.length < 3 ? 'Username must be at least 3 characters' : '',
    email: email.length > 0 && !EMAIL_RE.test(email) ? 'Enter a valid email address' : '',
    password: password.length > 0 && password.length < 6 ? 'Password must be at least 6 characters' : '',
    confirm: confirm.length > 0 && confirm !== password ? 'Passwords do not match' : '',
  };

  const isValid =
    username.length >= 3 && EMAIL_RE.test(email) && password.length >= 6 && confirm === password;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched({ username: true, email: true, password: true, confirm: true });
    if (!isValid) return;

    setLoading(true);
    setServerError('');
    try {
      await register(username, email, password);
      showToast('Account created', 'success');
      navigate('/');
    } catch (err) {
      setServerError(err.response?.data?.message || 'Unable to register');
    } finally {
      setLoading(false);
    }
  }

  const strengthLabel = ['Weak', 'Weak', 'Fair', 'Strong'][strength];

  return (
    <div className="auth-screen">
      <div className="auth-panel-left">
        <LogoReversed height={30} />
        <div>
          <h2 className="auth-headline">Real-time fuel intelligence for Malawi&rsquo;s freight fleets</h2>
          <p className="auth-support">
            Create a fleet manager account to register trucks, receive alerts, and review
            fuel and distance reports.
          </p>
        </div>
        <div className="auth-footer">MUBAS &middot; Final Year Project 2026</div>
      </div>

      <div className="auth-panel-right">
        <div className="auth-card">
          <h1>Create account</h1>
          <p className="card-subtitle">Set up your Freight Malawi fleet console</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Username</label>
              <input
                id="username" className={`form-input${touched.username && errors.username ? ' invalid' : ''}`}
                type="text" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, username: true }))}
              />
              {touched.username && errors.username && <span className="form-error">{errors.username}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email" className={`form-input${touched.email && errors.email ? ' invalid' : ''}`}
                type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              />
              {touched.email && errors.email && <span className="form-error">{errors.email}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password" className={`form-input${touched.password && errors.password ? ' invalid' : ''}`}
                type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              />
              {password.length > 0 && (
                <>
                  <div className="password-strength" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`password-strength-seg${i <= strength - 1 ? ` filled-${strength >= 3 ? 'strong' : strength === 2 ? 'fair' : 'weak'}` : ''}`}
                      />
                    ))}
                  </div>
                  <span className="form-hint">Password strength: {strengthLabel}</span>
                </>
              )}
              {touched.password && errors.password && <span className="form-error">{errors.password}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm" className={`form-input${touched.confirm && errors.confirm ? ' invalid' : ''}`}
                type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              />
              {touched.confirm && errors.confirm && <span className="form-error">{errors.confirm}</span>}
            </div>

            {serverError && <p className="form-error" role="alert" style={{ marginBottom: 16 }}>{serverError}</p>}

            <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!isValid} style={{ width: '100%' }}>
              Create account
            </Button>
          </form>

          <div className="auth-switch-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
