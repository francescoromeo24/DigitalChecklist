/**
 * Thin wrapper around the browser Notifications API. This shows OS-level
 * notifications while the app is open (or backgrounded). True push when the
 * app is fully closed would require a push server, which this local app has no
 * backend for.
 */

export function nativeSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function nativePermission(): NotificationPermission {
  return nativeSupported() ? Notification.permission : 'denied';
}

export async function requestNativePermission(): Promise<NotificationPermission> {
  if (!nativeSupported()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function notifyNative(title: string, body: string): void {
  if (!nativeSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
  } catch {
    // Some browsers require notifications to originate from a SW; ignore failures.
  }
}
