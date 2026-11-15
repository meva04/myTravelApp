// 장소에 대해 사용자에게 묻는 알림 두 가지와 그 답을 처리하는 규칙. 기기 연결은 prompts.ts 에 있다.
import type { Repo } from '@/db/repo';
import type { Id, Stop } from '@/domain/types';
import { t } from '@/i18n/ko';

/**
 * arrival: 장소 근처에 왔을 때 "도착하셨나요?"
 * overdue: 예정 시간이 지났는데 도착 기록이 없을 때 "일정을 변경할까요?"
 */
export type PromptKind = 'arrival' | 'overdue';
export type PromptData = { kind: PromptKind; stopId: Id; tripId: Id };
export type PromptNotice = { title: string; body: string; category: PromptKind; data: PromptData };

/** 알림 버튼 */
export const ACTIONS = {
  arrived: 'arrived', // 네, 도착했어요
  onTheWay: 'onTheWay', // 아직이에요, 가는 중이에요
  reschedule: 'reschedule', // 네 (일정 변경)
  skip: 'skip', // 이번 여행에서는 못 갈 거 같아요
} as const;

/** 장소 화면을 열 때 함께 띄울 질문 */
export type StopPrompt = 'arrival' | 'overdue' | 'reschedule' | 'skip';

/** 예정 시간에서 이만큼 지나도 도착 기록이 없으면 묻는다. */
export const OVERDUE_AFTER_MINUTES = 15;
/** iOS 는 예약 알림을 64개까지만 둔다. 다른 알림 자리를 남겨 둔다. */
export const MAX_REMINDERS = 40;

export function arrivalNotice(stop: Stop, tripId: Id): PromptNotice {
  return {
    title: t('prompt.arrivalTitle', { name: stop.name }),
    body: t('prompt.arrivalBody'),
    category: 'arrival',
    data: { kind: 'arrival', stopId: stop.id, tripId },
  };
}

export function overdueNotice(stop: Stop, tripId: Id): PromptNotice {
  return {
    title: t('prompt.overdueTitle', { name: stop.name }),
    body: t('prompt.overdueBody'),
    category: 'overdue',
    data: { kind: 'overdue', stopId: stop.id, tripId },
  };
}

/** 현지 벽시계 시각. 여행지에 가면 휴대폰 시간대가 바뀌므로 절대 시각이 아니라 날짜·시·분으로 예약한다. */
export type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

export const wallKey = (w: WallTime): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`;
};

/** 'YYYY-MM-DD' 의 'HH:mm' 에서 minutes 분 뒤 (자정을 넘기면 다음 날). */
export function wallTimeAfter(date: string, time: string, minutes: number): WallTime {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const u = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  return { year: u.getUTCFullYear(), month: u.getUTCMonth() + 1, day: u.getUTCDate(), hour: u.getUTCHours(), minute: u.getUTCMinutes() };
}

export type Reminder = { at: WallTime; notice: PromptNotice };

/**
 * 앞으로 물어볼 "예정 시간이 지났어요" 알림들. 예정 시간이 있고, 아직 도착하지 않았고, 숨기지 않은 장소만.
 * nowWall 은 지금의 현지 벽시계 'YYYY-MM-DDTHH:mm'.
 */
export async function upcomingReminders(repo: Repo, nowWall: string): Promise<Reminder[]> {
  const out: Reminder[] = [];
  for (const trip of await repo.listTrips()) {
    for (const day of await repo.listDays(trip.id)) {
      for (const stop of await repo.listStops(day.id)) {
        if (!stop.plannedTime || stop.arrivedAt || stop.skipped) continue;
        const at = wallTimeAfter(day.date, stop.plannedTime, OVERDUE_AFTER_MINUTES);
        if (wallKey(at) > nowWall) out.push({ at, notice: overdueNotice(stop, trip.id) });
      }
    }
  }
  out.sort((a, b) => wallKey(a.at).localeCompare(wallKey(b.at)));
  return out.slice(0, MAX_REMINDERS);
}

export type ResponseDeps = {
  repo: Repo;
  /** 도착 감지·예정 알림을 다시 맞춘다 */
  refresh: () => void;
  /** 장소 화면을 연다 */
  openStop: (tripId: Id, stopId: Id, prompt?: StopPrompt) => void;
};

/**
 * 알림에 대한 답. action 은 누른 버튼 (알림 자체를 눌렀으면 null), answeredAt 은 알림이 온 시각.
 * "가는 중이에요" 는 아무것도 바꾸지 않고 기다린다 (근처에 오면 도착 질문이 다시 온다).
 */
export async function handlePromptResponse(deps: ResponseDeps, data: PromptData, action: string | null, notifiedAt: string): Promise<void> {
  const stop = await deps.repo.getStop(data.stopId);
  if (!stop) return; // 그 사이 지운 장소
  if (action === ACTIONS.onTheWay) return;
  if (data.kind === 'arrival') {
    if (action === ACTIONS.arrived) {
      await deps.repo.markStopArrived(stop.id, notifiedAt, 'auto');
      deps.refresh();
      return deps.openStop(data.tripId, stop.id);
    }
    // 이미 도착을 기록했으면 다시 묻지 않는다
    return deps.openStop(data.tripId, stop.id, stop.arrivedAt ? undefined : 'arrival');
  }
  if (stop.arrivedAt) return deps.openStop(data.tripId, stop.id);
  if (action === ACTIONS.reschedule) return deps.openStop(data.tripId, stop.id, 'reschedule');
  if (action === ACTIONS.skip) return deps.openStop(data.tripId, stop.id, 'skip');
  return deps.openStop(data.tripId, stop.id, 'overdue');
}
