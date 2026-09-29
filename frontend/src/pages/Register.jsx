import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { extractErrorMessage } from '../api/axios';
import { LogoReversed } from '../components/Brand/Logo';

function passwordStrength(pw) {
  if (!pw) return { label: '', tone: 'muted', score: 0 };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 1) return { label: 'Weak', tone: 'red', score };
  if (score <= 3) return { label: 'Okay', tone: 'warning', score };
  return { label: 'Strong', tone: 'teal', score };
}

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const strength = useMemo(() => passwordStrength(password), [password]);

  function validate() {
    if (username.trim().length < 3) return 'Username must be at least 3 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await register({ username: username.trim(), email: email.trim(), password });
      toast.success('Account created — welcome to Freight Malawi!');
      navigate('/dashboard');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--fm-navy)', padding: 16 }}>
      <div className="fm-card fm-card-pad" style={{ width: '100%', maxWidth: 420, background: 'var(--fm-white)' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <LogoReversed height={26} />
        </div>
        <p style={{ textAlign: 'center', color: 'var(--fm-muted)', marginBottom: 20 }}>Create your transport company account</p>
        <form onSubmit={handleSubmit} noValidate>
          {error && <div className="fm-badge fm-badge-red" style={{ display: 'block', marginBottom: 14, padding: 10 }}>{error}</div>}
          <div className="fm-field">
            <label htmlFor="reg-username">Username</label>
            <input id="reg-username" className="fm-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="fm-field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" className="fm-input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="fm-field">
            <label htmlFor="reg-password">Password</label>
            <input id="reg-password" type="password" className="fm-input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {password && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--fm-border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(strength.score / 5) * 100}%`, height: '100%', background: `var(--fm-${strength.tone === 'red' ? 'red' : strength.tone === 'warning' ? 'warning' : 'teal'})` }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--fm-muted)' }}>{strength.label}</span>
              </div>
            )}
          </div>
          <div className="fm-field">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input id="reg-confirm" type="password" className="fm-input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button type="submit" className="fm-btn fm-btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={submitting}>
            <UserPlus size={16} /> {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 14 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
