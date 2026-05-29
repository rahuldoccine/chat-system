/** Shared mark SVG — viewBox 0 0 64 64 */
export const LOGO_MARK_VIEWBOX = '0 0 64 64';

export function LogoMarkDefs({ idPrefix = 'cs' }: { idPrefix?: string }) {
  const bg = `${idPrefix}-bg`;
  const border = `${idPrefix}-border`;
  const shine = `${idPrefix}-shine`;
  const dot = `${idPrefix}-dot`;
  const bubble = `${idPrefix}-bubble`;
  return (
    <defs>
      <linearGradient id={bg} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#3730a3" />
        <stop offset="35%" stopColor="#4f46e5" />
        <stop offset="68%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#9333ea" />
      </linearGradient>
      <linearGradient id={border} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
      </linearGradient>
      <radialGradient id={shine} cx="30%" cy="22%" r="55%" fx="30%" fy="22%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={dot} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
      <linearGradient id={bubble} x1="18" y1="22" x2="46" y2="46" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#f8fafc" />
      </linearGradient>
      <filter id={`${idPrefix}-shadow`} x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1e1b4b" floodOpacity="0.45" />
      </filter>
      <filter id={`${idPrefix}-glow`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="2.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export function LogoMarkShapes({ idPrefix = 'cs' }: { idPrefix?: string }) {
  const bg = `${idPrefix}-bg`;
  const border = `${idPrefix}-border`;
  const shine = `${idPrefix}-shine`;
  const dot = `${idPrefix}-dot`;
  const bubble = `${idPrefix}-bubble`;
  return (
    <>
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="17"
        fill={`url(#${bg})`}
        filter={`url(#${idPrefix}-shadow)`}
      />
      <rect
        x="3.5"
        y="3.5"
        width="57"
        height="57"
        rx="16.5"
        fill={`url(#${shine})`}
      />
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="17"
        fill="none"
        stroke={`url(#${border})`}
        strokeWidth="1.25"
      />

      {/* Back bubble — conversation depth */}
      <path
        d="M38 17.5h13.5a5.5 5.5 0 0 1 5.5 5.5v7a5.5 5.5 0 0 1-5.5 5.5H44l-3.5 4.5V35.5H38a5.5 5.5 0 0 1-5.5-5.5v-7a5.5 5.5 0 0 1 5.5-5.5z"
        fill="#ffffff"
        fillOpacity="0.22"
      />

      {/* Main bubble */}
      <path
        d="M15.5 21.5h27.5a7.5 7.5 0 0 1 7.5 7.5v9.5a7.5 7.5 0 0 1-7.5 7.5H29.5l-6.5 7.8V46H15.5a7.5 7.5 0 0 1-7.5-7.5V29a7.5 7.5 0 0 1 7.5-7.5z"
        fill={`url(#${bubble})`}
        filter={`url(#${idPrefix}-glow)`}
      />

      {/* Typing indicator */}
      <circle cx="23.5" cy="33.5" r="2.6" fill={`url(#${dot})`} />
      <circle cx="32" cy="33.5" r="2.6" fill={`url(#${dot})`} opacity="0.82" />
      <circle cx="40.5" cy="33.5" r="2.6" fill={`url(#${dot})`} opacity="0.64" />

      {/* Live / online signal */}
      <circle cx="49" cy="15" r="8.5" fill="#22c55e" fillOpacity="0.18" />
      <circle cx="49" cy="15" r="5.25" fill="#22c55e" stroke="#ffffff" strokeWidth="2.25" />
    </>
  );
}
