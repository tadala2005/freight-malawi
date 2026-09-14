import React from 'react';
import Spinner from './Spinner.jsx';

export default function Button({
  children, variant = 'primary', size = 'md', loading = false,
  disabled = false, type = 'button', onClick, className = '', ...rest
}) {
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const variantClass = `btn-${variant}`;

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}
