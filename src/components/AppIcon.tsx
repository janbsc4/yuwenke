type IconName = "study" | "mastered" | "favorites" | "chat" | "account" | "sound" | "muted" | "send";

const paths: Record<IconName, string> = {
  study: "M8 3h11a2 2 0 0 1 2 2v11M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
  mastered: "M20 11v1a8 8 0 1 1-4.7-7.3M8 11l4 4 9-10",
  favorites: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-10A8.5 8.5 0 0 1 21 11.5Z",
  account: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  sound: "M11 4 5 9H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16",
  muted: "M11 4 5 9H2v6h3l6 5ZM16 9l6 6m0-6-6 6",
  send: "M12 20V4m-7 7 7-7 7 7",
};

export function AppIcon({ name }: { name: IconName }) {
  return (
    <svg className="app-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
