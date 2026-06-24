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

export const IconPlay = (p: IconProps) => (
  <Base fill="currentColor" stroke="none" {...p}>
    <path d="M8 5v14l11-7z" />
  </Base>
);

// ---- Brand glyphs (simplified) for the "connect your channels" section ----
type BrandProps = SVGProps<SVGSVGElement>;
function BrandBase({ children, ...props }: BrandProps & { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconInstagram = (p: BrandProps) => (
  <BrandBase {...p}>
    <path d="M12 2.16c3.2 0 3.58 0 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s0-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zm0 1.8c-3.15 0-3.5 0-4.74.07-2.34.1-3.26 1.05-3.36 3.36C3.83 8.5 3.82 8.85 3.82 12s0 3.5.08 4.74c.1 2.3 1.02 3.26 3.36 3.36 1.24.06 1.59.07 4.74.07s3.5 0 4.74-.07c2.34-.1 3.26-1.06 3.36-3.36.06-1.24.07-1.59.07-4.74s0-3.5-.07-4.74c-.1-2.3-1.02-3.26-3.36-3.36C15.5 3.97 15.15 3.96 12 3.96zM12 6.86A5.14 5.14 0 1 0 12 17.14 5.14 5.14 0 0 0 12 6.86zm0 8.48A3.34 3.34 0 1 1 12 8.66a3.34 3.34 0 0 1 0 6.68zm5.34-9.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z" />
  </BrandBase>
);

export const IconYoutube = (p: BrandProps) => (
  <BrandBase {...p}>
    <path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.5zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
  </BrandBase>
);

export const IconTiktok = (p: BrandProps) => (
  <BrandBase {...p}>
    <path d="M16.6 5.8a4.3 4.3 0 0 1-1-2.8h-3.3v12.9a2.5 2.5 0 1 1-2.5-2.5c.26 0 .5.04.74.11V9.9a5.9 5.9 0 0 0-.74-.05 5.85 5.85 0 1 0 5.85 5.85V8.9a7.4 7.4 0 0 0 4.3 1.38V6.9a4.3 4.3 0 0 1-3.35-1.1z" />
  </BrandBase>
);
