import { Loader2 } from 'lucide-react';

export default function Button({
  variant = 'primary', size = 'md', loading = false, disabled = false,
  children, icon: Icon, type = 'button', onClick, className = '', title, ...rest
}) {
  const variantClass = {
    primary: 'fm-btn-primary',
    secondary: 'fm-btn-secondary',
    danger: 'fm-btn-danger',
    ghost: 'fm-btn-ghost',
  }[variant] || 'fm-btn-primary';
  const sizeClass = size === 'sm' ? 'fm-btn-sm' : '';

  return (
    <button
      type={type}
      className={`fm-btn ${variantClass} ${sizeClass} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin-icon" style={{ animation: 'spin 0.7s linear infinite' }} /> : (Icon ? <Icon size={16} /> : null)}
      {children}
    </button>
  );
}
