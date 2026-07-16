---
name: reference_sound_notifications
description: "звуковые сигналы Claude Code — где настроены, что выбрал Артём, как менять"
metadata: 
  node_type: memory
  type: reference
  originSessionId: f55c7958-840f-467d-8861-1a5fe981f52a
---

Звук в Claude Code настроен 2026-07-13 в ГЛОБАЛЬНОМ `~/.claude/settings.json`, ключ `hooks` (не в проекте — работает во всех проектах Артёма). Прошлая попытка следов не оставила — делали с нуля.

Два хука, оба `async:true` (не тормозят ответ) + `timeout:10`, звук `C:\Windows\Media\Windows Message Nudge.wav` (Артём выбрал из 7 на прослушке 2026-07-13), через `powershell -NoProfile -Command "(New-Object Media.SoundPlayer '<путь.wav>').PlaySync()"` (Windows PowerShell 5 / powershell.exe; НЕ `shell:powershell` — тот зовёт pwsh, которого нет; инлайн-powershell Git Bash тут НЕ ломает — проверено пайп-тестом):
- **Notification** с `matcher:"permission_prompt"` → пищит ТОЛЬКО когда прошу разрешение. Матчер поставлен НАРОЧНО: без него ловится ещё и `idle_prompt`, который в Claude Code повторяется каждые ~60с пока не вернёшься (Артёма это раздражало — «услышать разок и всё»).
- **Stop** (без матчера) → один раз в конце каждого моего ответа.

Итог: строго ОДИН сигнал на событие, без повторов. Менять звук — поменять имя .wav (аудиции: `scratchpad/audition*.ps1`, играют с номерными пиками). Убрать звук на каждый ответ — удалить блок `Stop`. Если хук не подхватился сразу — открыть `/hooks` один раз или перезапустить Claude Code.
