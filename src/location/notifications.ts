import * as Notifications from 'expo-notifications';

export async function getNotificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationsAllowed(): Promise<boolean> {
  return (await Notifications.requestPermissionsAsync()).granted;
}
