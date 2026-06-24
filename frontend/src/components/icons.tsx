/**
 * Minimal stroke icon set (Lucide-style, 24×24) for the Studio nav and UI.
 * Inline SVGs — no dependency, consistent 1.6 stroke, currentColor.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconInsights = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 14l3-3 3 3 4-5" />
  </Base>
);

export const IconConversations = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 9.5 9.5 0 0 1-4-.9L3 21l1-4a8.5 8.5 0 1 1 17-1.5z" />
  </Base>
);

export const IconAudience = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Base>
);

export const IconKnowledge = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Base>
);

export const IconMind = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="5" cy="6" r="1.6" />
    <circle cx="19" cy="6" r="1.6" />
    <circle cx="6" cy="19" r="1.6" />
    <circle cx="18" cy="18" r="1.6" />
    <path d="M10.3 10.6 6.3 7.1M13.7 10.6l3.6-3.3M10.5 13.4 7 17.6M13.6 13.5l3.1 3.2" />
  </Base>
);

export const IconPersona = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h4M15 13h4" />
  </Base>
);

export const IconTrain = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" />
  </Base>
);

export const IconExternal = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);

export const IconExpand = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Base>
);
