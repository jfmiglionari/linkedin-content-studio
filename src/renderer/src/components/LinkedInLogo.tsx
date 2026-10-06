import React from 'react'

export function LinkedInLogo({ size = 18 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="sidebar-title-logo"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        fill="#ffffff"
        d="M7.2 9.6H4.4V19.4H7.2V9.6ZM5.8 8.3C6.75 8.3 7.4 7.65 7.4 6.8C7.4 5.95 6.75 5.3 5.8 5.3C4.9 5.3 4.2 5.95 4.2 6.8C4.2 7.65 4.9 8.3 5.8 8.3ZM19.6 19.4V13.9C19.6 11 18 9.4 15.7 9.4C14 9.4 13.1 10.3 12.7 11V9.6H9.9C9.95 10.35 9.9 19.4 9.9 19.4H12.7V13.95C12.7 13.65 12.7 13.35 12.8 13.15C13.05 12.55 13.55 11.95 14.45 11.95C15.6 11.95 16.1 12.8 16.1 14.1V19.4H19.6Z"
      />
    </svg>
  )
}
