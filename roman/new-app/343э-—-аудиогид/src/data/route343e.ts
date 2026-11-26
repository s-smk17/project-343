export interface RoutePoint {
  num: string;
  name: string;
  lat: number;
  lon: number;
  audio?: string;
}

export interface AudioStop extends RoutePoint {
  audio: string;
  trackCode: string;
}

export const APP_VERSION = '1.2.0';
export const DEFAULT_TRIGGER_RADIUS_M = 20;
export const DEFAULT_AUDIO_VOLUME = 1.0;
export const DEFAULT_CLOUD_BASE_URL =
  'https://raw.githubusercontent.com/s-smk17/project-343/main/fedor_andrey/';

export const ROUTE_343E: RoutePoint[] = [
  { num: '1', name: 'Станция метро Проспект Ветеранов', lat: 59.841925, lon: 30.251472 },
  { num: '2', name: 'Улица Солдата Корзуна', lat: 59.833626, lon: 30.217203 },
  { num: '3', name: 'Проспект Маршала Жукова', lat: 59.833122, lon: 30.196659 },
  { num: '4', name: 'Авангардная улица', lat: 59.833096, lon: 30.181858 },
  { num: '5', name: 'Улица Пограничника Гарькавого', lat: 59.835494, lon: 30.14603 },
  { num: '6', name: 'Улица Пионерстроя', lat: 59.835505, lon: 30.128085 },
  { num: '7', name: 'Рогачёвский переулок', lat: 59.84197, lon: 30.130531 },
  {
    num: '8',
    name: 'Проспект Будённого',
    lat: 59.852752,
    lon: 30.089369,
    audio: '08 начало о проекте, проспект Буденного.mp3',
  },
  {
    num: '8.5',
    name: 'Константиновский дворец',
    lat: 59.851541,
    lon: 30.058099,
    audio: '08.5 продолжение Константиновский дворец).mp3',
  },
  {
    num: '9',
    name: 'Фронтовая улица',
    lat: 59.85291,
    lon: 30.036047,
    audio: '09 Фронтовая улица.mp3',
  },
  { num: '10', name: 'Кропоткинская улица', lat: 59.854896, lon: 30.020567 },
  {
    num: '11',
    name: 'Улица Крылова',
    lat: 59.858147,
    lon: 30.004907,
    audio: '11 остановка от ул. Крылова до Николаевской больницы.mp3',
  },
  {
    num: '12',
    name: 'Константиновская улица – Николаевская больница',
    lat: 59.878519,
    lon: 29.920103,
    audio: '12 Николаевская больница.mp3',
  },
  {
    num: '12.5',
    name: 'Фонтаны',
    lat: 59.880442,
    lon: 29.906564,
    audio: '12.5 о Фонтанах (до Разводной улицы).mp3',
  },
  {
    num: '13',
    name: 'Разводная улица',
    lat: 59.880977,
    lon: 29.902956,
    audio: '13 остановка О часовом заводе Ракета (от Разводной до Фабричной).mp3',
  },
  {
    num: '14',
    name: 'Фабричная улица',
    lat: 59.883181,
    lon: 29.889367,
    audio: '14 остановка Фабричная улица.mp3',
  },
  {
    num: '15',
    name: 'Посёлок Просвещения',
    lat: 59.894253,
    lon: 29.861075,
    audio: '15 остановка Мордвиновка.mp3',
  },
  {
    num: '16',
    name: 'Мордвиновка',
    lat: 59.899376,
    lon: 29.827707,
    audio: '16 остановка Новогорская улица.mp3',
  },
  {
    num: '17',
    name: 'Новогорская улица',
    lat: 59.899998,
    lon: 29.814455,
    audio: '17 остановка Ул. Связи.mp3',
  },
  {
    num: '18',
    name: 'Улица Связи',
    lat: 59.897904,
    lon: 29.807719,
    audio: '18 остановка ул. Федюнинского.mp3',
  },
  {
    num: '19',
    name: 'Улица Федюнинского',
    lat: 59.894654,
    lon: 29.796321,
    audio: '19 остановка Ораниенбаумский проспект.mp3',
  },
  {
    num: '20',
    name: 'Ораниенбаумский проспект / Улица Федюнинского, 31',
    lat: 59.900046,
    lon: 29.777662,
    audio: '20 ост ул Федюнинского-ул Победы.mp3',
  },
  {
    num: '21',
    name: 'Улица Федюнинского / Улица Победы',
    lat: 59.903017,
    lon: 29.770512,
    audio: '21 остановка Швейцарская ул - Победы.mp3',
  },
  {
    num: '22',
    name: 'Швейцарская улица / Улица Победы',
    lat: 59.906088,
    lon: 29.772622,
    audio: '22 остановка Красноармейская ул.mp3',
  },
  {
    num: '23',
    name: 'Красноармейская улица',
    lat: 59.907723,
    lon: 29.774272,
    audio: '23 остановка Александровская улица.mp3',
  },
  {
    num: '24',
    name: 'Александровская улица',
    lat: 59.909975,
    lon: 29.774892,
    audio: '24 остановка Владимирская улица.mp3',
  },
  {
    num: '25',
    name: 'Ломоносов – Владимирская улица',
    lat: 59.910435,
    lon: 29.769417,
    audio: '25 остановка Межрайонная Ломоносовская больница.mp3',
  },
  {
    num: '26',
    name: 'Ломоносовская межрайонная больница',
    lat: 59.913697,
    lon: 29.767054,
    audio: '26 остановка Рынок.mp3',
  },
  {
    num: '27',
    name: 'Ломоносов – Вокзал',
    lat: 59.917927,
    lon: 29.767671,
    audio: '27 остановка Ломоносов, вокзал.mp3',
  },
];

export const STOPS_343E: AudioStop[] = ROUTE_343E.filter(
  (point): point is RoutePoint & { audio: string } => Boolean(point.audio)
).map((point) => ({
  ...point,
  trackCode: point.num,
}));

/** Расстояние в метрах между двумя координатами (формула гаверсинусов). */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatAudioTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function resolveCloudAudioUrl(
  stop: AudioStop,
  cloudBaseUrl: string,
  includeAudioSubfolder: boolean,
  customUrls: Record<string, string>
): string {
  const override = customUrls[stop.name]?.trim();
  if (override) {
    return override;
  }
  const base = cloudBaseUrl.trim();
  if (!base) {
    return '';
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const encodedFile = encodeURIComponent(stop.audio);
  return includeAudioSubfolder
    ? `${normalizedBase}audio/${encodedFile}`
    : `${normalizedBase}${encodedFile}`;
}
