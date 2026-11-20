// 두 장소 사이에 이동 메모(가는 길에 할 일)를 넣는 페이지. 한 줄이 메모 카드 하나가 된다.
import { useState } from 'react';

import type { CheckItem } from '@/domain/checklist';
import { t } from '@/i18n/ko';
import { useServices } from '@/state/ServicesContext';
import { Checklist, withDraft } from '@/ui/Checklist';
import { FormPage } from '@/ui/FormPage';

type Props = {
  dayId: string;
  /** 이 장소(와 딸린 메모들) 바로 뒤에 넣는다 */
  afterStopId: string;
  onDone: () => void;
  onBack?: () => void;
};

export function AddNoteScreen({ dayId, afterStopId, onDone, onBack }: Props) {
  const { repo } = useServices();
  const [items, setItems] = useState<CheckItem[]>([]);
  const [typing, setTyping] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (saving) return;
    const texts = withDraft(items, typing)
      .map((it) => it.text.trim())
      .filter(Boolean);
    if (!texts.length) return setNotice(t('note.writeFirst'));
    setSaving(true);
    try {
      await repo.addNotes(dayId, afterStopId, texts);
      onDone();
    } finally {
      setSaving(false);
    }
  };
  return (
    <FormPage title={t('note.pageTitle')} onBack={onBack ?? onDone} submitLabel={t('add.add')} onSubmit={() => void submit()} notice={notice}>
      <Checklist items={items} onChange={setItems} onDraft={setTyping} editable placeholder={t('leg.notePlaceholder')} autoFocus />
    </FormPage>
  );
}
