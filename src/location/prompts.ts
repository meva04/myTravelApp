// 실제 기기 연결: 질문 알림의 버튼 등록, 예정 시간 알림 예약, 알림에 대한 답 받기.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { t } from '@/i18n/ko';
import { getServices } from '@/state/services';

import { localNow } from './clock';
import { ACTIONS, handlePromptResponse, upcomingReminders, type PromptData, type PromptNotice } from './promptsCore';

/** 알림 아래에 나오는 버튼들. "가는 중이에요" 는 앱을 열지 않는다. */
export async function registerPromptCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync('arrival', [
    { identifier: ACTIONS.arrived, buttonTitle: t('prompt.arrived'), options: { opensAppToForeground: true } },
    { identifier: ACTIONS.onTheWay, buttonTitle: t('prompt.onTheWay'), options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync('overdue', [
    { identifier: ACTIONS.reschedule, buttonTitle: t('prompt.reschedule'), options: { opensAppToForeground: true } },
    { identifier: ACTIONS.onTheWay, buttonTitle: t('prompt.onTheWayShort'), options: { opensAppToForeground: false } },
    { identifier: ACTIONS.skip, buttonTitle: t('prompt.skip'), options: { opensAppToForeground: true, isDestructive: true } },
  ]);
}

const content = (n: PromptNotice) => ({ title: n.title, body: n.body, categoryIdentifier: n.category, data: n.data });

export async function notifyNow(n: PromptNotice): Promise<void> {
  await Notifications.scheduleNotificationAsync({ content: content(n), trigger: null });
}

/**
 * "예정 시간이 지났어요" 알림을 일정에 맞춰 다시 예약한다. 시간대를 정하지 않은 달력 알림이라
 * 휴대폰이 여행지 시간대로 바뀌면 현지 시각에 맞춰 울린다.
 */
export async function refreshReminders(): Promise<void> {
  try {
    const { repo } = await getServices();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content.data as Partial<PromptData> | undefined)?.kind === 'overdue') await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    for (const r of await upcomingReminders(repo, localNow())) {
      await Notifications.scheduleNotificationAsync({
        content: content(r.notice),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, repeats: false, ...r.at },
      });
    }
  } catch (e) {
    console.warn('refreshReminders failed', e);
  }
}

function isPromptData(d: unknown): d is PromptData {
  const x = d as Partial<PromptData> | null;
  return !!x && (x.kind === 'arrival' || x.kind === 'overdue') && typeof x.stopId === 'string' && typeof x.tripId === 'string';
}

/** 알림을 누르거나 버튼으로 답했을 때 처리한다. 앱이 꺼져 있다가 알림으로 열린 경우도 포함. */
export function usePromptResponses(onChanged: () => void): void {
  useEffect(() => {
    const handle = async (r: Notifications.NotificationResponse) => {
      const data = r.notification.request.content.data;
      if (!isPromptData(data)) return;
      const { repo } = await getServices();
      const action = r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? null : r.actionIdentifier;
      await handlePromptResponse(
        {
          repo,
          refresh: onChanged,
          openStop: (tripId, stopId, prompt) =>
            router.push({ pathname: '/trip/[tripId]/stop/[stopId]', params: prompt ? { tripId, stopId, prompt } : { tripId, stopId } }),
        },
        data,
        action,
        new Date(r.notification.date).toISOString(),
      );
      Notifications.clearLastNotificationResponse();
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) void handle(last);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handle(r));
    return () => sub.remove();
  }, [onChanged]);
}
