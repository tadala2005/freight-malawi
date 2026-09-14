import React from 'react';

export default function LogoSingleColor({ height = 32, color = '#0B2A4A' }) {
  return (
    <svg height={height} viewBox="0 0 220 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Freight Malawi">
      <g fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 34 L18 22 L27 29 L42 12" />
      </g>
      <path d="M34 26 C34 19 29 14 24 14 C19 14 14 19 14 26 C14 33 24 42 24 42 C24 42 34 33 34 26 Z" fill={color} />
      <circle cx="24" cy="26" r="4.5" fill="#FFFFFF" />
      <text x="52" y="21" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="700" fill={color}>FREIGHT</text>
      <text x="52" y="37" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="700" fill={color} letterSpacing="1">MALAWI</text>
    </svg>
  );
}
