// Иконки соцсетей бренда — тот же приём, что уже был в app/support/support-form.tsx
// (заливка currentColor, один-два <path>, без стороннего пакета иконок — новая
// библиотека требует отдельного разрешения, а lucide-react брендовых значков не
// содержит). Монохромные: подчиняются токену цвета через currentColor, не несут
// собственного акцента — так их можно красить как любую другую ссылку в навигации.
export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M21.94 4.6 18.6 20.24c-.25 1.1-.9 1.38-1.83.86l-5.06-3.73-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.15 9.38-8.48c.41-.36-.09-.56-.63-.2L6.1 12.9 1.1 11.33c-1.08-.34-1.1-1.08.23-1.6L20.6 3.05c.9-.33 1.68.2 1.34 1.55Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0 2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z"
      />
      <circle cx="17.3" cy="6.7" r="1.1" />
    </svg>
  );
}
