import { supabase } from './supabase'

type NotificationEvent =
  | { type: 'test' }
  | { type: 'service'; serviceId: string }
  | { type: 'stock'; productId: string }
  | { type: 'time_entry'; entryId: string }
  | { type: 'tool_request'; requestId: number }
  | { type: 'tool_returned'; requestId: number }

export async function solicitarNotificacao(event: NotificationEvent): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return

  try {
    const { error } = await supabase.functions.invoke('send-notification', { body: event })
    if (error) console.warn('Notificação não enviada:', error.message)
  } catch (error) {
    // Notificações nunca podem bloquear o lançamento principal.
    console.warn('Falha ao solicitar notificação:', error)
  }
}
