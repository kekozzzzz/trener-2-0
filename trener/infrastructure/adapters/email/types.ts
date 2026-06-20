// Порт отправки писем (architecture/06-внешние-сервисы.md, раздел 2.1): «отправь
// письмо адресату с таким-то содержанием». За портом — сменный адаптер (правило 4):
// сейчас Unisender Go, запасной — SendPulse (новый файл адаптера). Бизнес-логика
// зовёт порт и не знает, какой вендор за ним стоит.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string; // plaintext-версия (для клиентов без HTML и анти-спам репутации)
}

export interface EmailPort {
  // Отправить одно письмо. Бросает при ошибке доставки — решение «повторять или
  // глушить» принимает вызывающий (queue-шаг даёт retry/карантин; safeSendEmail — глушит).
  sendEmail(message: EmailMessage): Promise<void>;
}
