import * as Calendar from 'expo-calendar';

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

interface BookingCalendarEvent {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  notes?: string;
}

export async function addBookingToCalendar(event: BookingCalendarEvent): Promise<boolean> {
  const granted = await requestCalendarPermission();
  if (!granted) return false;

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  // Prefer the default calendar; fall back to first writable one.
  const defaultCalendar =
    calendars.find((c) => c.allowsModifications && c.source?.isLocalAccount) ??
    calendars.find((c) => c.allowsModifications);

  if (!defaultCalendar) return false;

  try {
    await Calendar.createEventAsync(defaultCalendar.id, {
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      notes: event.notes,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (err) {
    console.warn('[calendar] Failed to add event:', err);
    return false;
  }

  return true;
}
