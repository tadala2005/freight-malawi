import React from 'react';

export default function Skeleton({ width = '100%', height = 16, style = {} }) {
  return (
    <div
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, ...style }}
    />
  );
}
