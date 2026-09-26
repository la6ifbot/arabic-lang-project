import type { TimeId } from './sky';

export type PlaceId =
  | 'overview'
  | 'gate'
  | 'bridge'
  | 'lowerTower'
  | 'moat'
  | 'mound'
  | 'walls'
  | 'minaret'
  | 'barracks'
  | 'theatre'
  | 'shrine'
  | 'northTower';

export interface Place {
  id: PlaceId;
  ar: string;
  translit: string;
  en: string;
  about: string;
}

/** What the page says about each part of the citadel, in the order the tour lists them. */
export const PLACES: Place[] = [
  {
    id: 'overview',
    ar: 'قَلْعَة حَلَب',
    translit: 'qalʿat Ḥalab',
    en: 'The whole citadel',
    about:
      'People have built on this hill for more than 4,000 years. Most of what stands today is Ayyubid and Mamluk work, from the 12th to the 16th century.',
  },
  {
    id: 'gate',
    ar: 'البَوَّابَة',
    translit: 'al-bawwāba',
    en: 'The gate',
    about:
      'The entrance block was built under the Ayyubid sultan al-Zahir Ghazi (r. 1186–1216) and strengthened by the Mamluks. Inside, the passage turns five times at right angles and passes three gates. The Mamluk Throne Hall, 24 × 27 m, sits on top.',
  },
  {
    id: 'bridge',
    ar: 'الجِسْر',
    translit: 'al-jisr',
    en: 'The bridge',
    about: 'A stone viaduct on seven arches climbs across the moat, from the lower tower up to the gate.',
  },
  {
    id: 'lowerTower',
    ar: 'البُرْج المُتَقَدِّم',
    translit: 'al-burj al-mutaqaddim',
    en: 'The advanced tower',
    about: 'The lower gate tower stands on the city side of the moat. Visitors enter here and start the climb.',
  },
  {
    id: 'moat',
    ar: 'الخَنْدَق',
    translit: 'al-khandaq',
    en: 'The moat',
    about: 'Dug in the 12th century around the foot of the mound: about 22 m deep and 30 m wide.',
  },
  {
    id: 'mound',
    ar: 'التَّلّ',
    translit: 'at-tall',
    en: 'The mound',
    about:
      'An oval hill about 450 × 325 m at its base and 285 × 160 m on top, rising some 50 m above the city. Its slope, the glacis, was faced with large blocks of limestone.',
  },
  {
    id: 'walls',
    ar: 'السُّور',
    translit: 'as-sūr',
    en: 'The walls',
    about:
      'Curtain walls and square towers ring the top of the mound. Arrow slits and machicolations let defenders shoot down at anyone climbing the glacis.',
  },
  {
    id: 'minaret',
    ar: 'المِئْذَنَة',
    translit: 'al-miʾdhana',
    en: 'The minaret',
    about:
      'The Great Mosque of the Citadel was built in 1213–14 under al-Zahir Ghazi, on one of the highest points of the mound. Its square minaret is 21 m tall.',
  },
  {
    id: 'barracks',
    ar: 'الثُّكْنَة',
    translit: 'ath-thukna',
    en: 'The barracks',
    about: 'Built in 1834 by Ibrahim Pasha, partly from the stones of older buildings. It later became a museum.',
  },
  {
    id: 'theatre',
    ar: 'المَسْرَح',
    translit: 'al-masraḥ',
    en: 'The theatre',
    about: 'A modern open-air theatre inside the walls, used for concerts and festivals.',
  },
  {
    id: 'shrine',
    ar: 'مَقَام إِبْرَاهِيم',
    translit: 'maqām Ibrāhīm',
    en: 'Abraham’s shrine',
    about:
      'Tradition says Abraham rested on this hill and milked his grey cow here. The story is one explanation of the city’s name: ḥalab means ‘he milked’.',
  },
  {
    id: 'northTower',
    ar: 'البُرْج الشَّمَالِي',
    translit: 'al-burj ash-shamālī',
    en: 'The north tower',
    about: 'One of two advanced towers that the Mamluks added on the north and south slopes in 1415.',
  },
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

/** Times of day, each one a word from Durar. */
export const TIMES: { id: TimeId; ar: string; en: string }[] = [
  { id: 'fajr', ar: 'فَجْر', en: 'Dawn' },
  { id: 'duha', ar: 'ضُحًى', en: 'Morning' },
  { id: 'shafaq', ar: 'شَفَق', en: 'Sunset' },
  { id: 'layl', ar: 'لَيْل', en: 'Night' },
];
