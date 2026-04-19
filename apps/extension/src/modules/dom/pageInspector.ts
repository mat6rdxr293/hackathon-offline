export type DetectedPageType =
  | 'patients_list'
  | 'patient_page'
  | 'primary_exam'
  | 'treatment_diary'
  | 'procedures'
  | 'discharge_summary'
  | 'schedule_block'
  | 'unknown';

const normalize = (value: string): string => value.trim().toLowerCase();

export class PageInspector {
  detect(): DetectedPageType {
    const declared = document.body.getAttribute('data-page-type');
    if (declared) {
      return declared as DetectedPageType;
    }

    const url = normalize(window.location.href);
    const title = normalize(document.title);
    const h1 = normalize(document.querySelector('h1')?.textContent ?? '');
    const activeTab = normalize(
      (document.querySelector('[data-tab].is-active') ?? document.querySelector('.mh-navigation .active > a'))
        ?.textContent ?? '',
    );
    const snapshot = `${title} ${h1} ${activeTab}`;

    // URL-based detection for real DMed routes
    if (url.includes('/medicalhistory/') || url.includes('/emergency/reception')) return 'patient_page';
    if (url.includes('/patientdiary/')) return 'treatment_diary';
    if (url.includes('/medicalrecord/')) return 'primary_exam';
    if (url.includes('/epicrisis/') || url.includes('/discharge')) return 'discharge_summary';

    // Title/content heuristics
    if (snapshot.includes('дневник') || snapshot.includes('күндел') || snapshot.includes('diary')) return 'treatment_diary';
    if (snapshot.includes('эпикриз') || snapshot.includes('шығару') || snapshot.includes('discharge')) return 'discharge_summary';
    if (snapshot.includes('первич') || snapshot.includes('алғашқы') || snapshot.includes('primary')) return 'primary_exam';
    if (snapshot.includes('процедур') || snapshot.includes('назначени') || snapshot.includes('procedure')) return 'procedures';
    if (snapshot.includes('распис') || snapshot.includes('кесте') || snapshot.includes('schedule')) return 'schedule_block';
    if (snapshot.includes('пациент') || snapshot.includes('patients')) return 'patients_list';
    if (snapshot.includes('карточк') || snapshot.includes('card') || snapshot.includes('историяболезни') || document.querySelector('.mh-navigation') !== null) return 'patient_page';

    return 'unknown';
  }
}
