/**
 * Spain's 50 provinces and 2 autonomous cities, each with its community, to name a place in Spain
 * by its province ("Andújar, Jaén") the same on both phones: Apple's geocoder puts the province in
 * one field and Google's in another, under names that change with the phone's language
 * ("Sevilla", "Seville", "Provincia de Sevilla") or are co-official ("Gerona", "Girona"). Each
 * province is written by its usual name in Spanish, as the communities are.
 */
interface Province {
  readonly name: string;
  readonly community: string;
  /** Other names a geocoder may give it, besides `name`. */
  readonly aliases?: readonly string[];
}

const ANDALUCIA = 'Andalucía';
const ARAGON = 'Aragón';
const CANARIAS = 'Canarias';
const CASTILLA_LA_MANCHA = 'Castilla-La Mancha';
const CASTILLA_Y_LEON = 'Castilla y León';
const CATALUNA = 'Cataluña';
const VALENCIANA = 'Comunidad Valenciana';
const EXTREMADURA = 'Extremadura';
const GALICIA = 'Galicia';
const PAIS_VASCO = 'País Vasco';

const PROVINCES: readonly Province[] = [
  { name: 'A Coruña', community: GALICIA, aliases: ['La Coruña', 'Coruña', 'Corunna'] },
  { name: 'Álava', community: PAIS_VASCO, aliases: ['Araba', 'Araba/Álava', 'Álava/Araba'] },
  { name: 'Albacete', community: CASTILLA_LA_MANCHA },
  { name: 'Alicante', community: VALENCIANA, aliases: ['Alacant', 'Alicante/Alacant'] },
  { name: 'Almería', community: ANDALUCIA },
  { name: 'Asturias', community: 'Asturias', aliases: ['Principado de Asturias'] },
  { name: 'Ávila', community: CASTILLA_Y_LEON },
  { name: 'Badajoz', community: EXTREMADURA },
  { name: 'Barcelona', community: CATALUNA },
  { name: 'Burgos', community: CASTILLA_Y_LEON },
  { name: 'Cáceres', community: EXTREMADURA },
  { name: 'Cádiz', community: ANDALUCIA },
  { name: 'Cantabria', community: 'Cantabria' },
  { name: 'Castellón', community: VALENCIANA, aliases: ['Castelló', 'Castellón/Castelló'] },
  { name: 'Ceuta', community: 'Ceuta' },
  { name: 'Ciudad Real', community: CASTILLA_LA_MANCHA },
  { name: 'Córdoba', community: ANDALUCIA },
  { name: 'Cuenca', community: CASTILLA_LA_MANCHA },
  { name: 'Girona', community: CATALUNA, aliases: ['Gerona'] },
  { name: 'Granada', community: ANDALUCIA },
  { name: 'Guadalajara', community: CASTILLA_LA_MANCHA },
  { name: 'Guipúzcoa', community: PAIS_VASCO, aliases: ['Gipuzkoa'] },
  { name: 'Huelva', community: ANDALUCIA },
  { name: 'Huesca', community: ARAGON },
  {
    name: 'Islas Baleares',
    community: 'Islas Baleares',
    aliases: ['Illes Balears', 'Baleares', 'Balearic Islands'],
  },
  { name: 'Jaén', community: ANDALUCIA },
  { name: 'La Rioja', community: 'La Rioja', aliases: ['Rioja'] },
  { name: 'Las Palmas', community: CANARIAS },
  { name: 'León', community: CASTILLA_Y_LEON },
  { name: 'Lleida', community: CATALUNA, aliases: ['Lérida'] },
  { name: 'Lugo', community: GALICIA },
  { name: 'Madrid', community: 'Comunidad de Madrid', aliases: ['Community of Madrid'] },
  { name: 'Málaga', community: ANDALUCIA },
  { name: 'Melilla', community: 'Melilla' },
  { name: 'Murcia', community: 'Región de Murcia', aliases: ['Region of Murcia'] },
  { name: 'Navarra', community: 'Navarra', aliases: ['Nafarroa', 'Navarre'] },
  { name: 'Ourense', community: GALICIA, aliases: ['Orense'] },
  { name: 'Palencia', community: CASTILLA_Y_LEON },
  { name: 'Pontevedra', community: GALICIA },
  { name: 'Salamanca', community: CASTILLA_Y_LEON },
  { name: 'Santa Cruz de Tenerife', community: CANARIAS },
  { name: 'Segovia', community: CASTILLA_Y_LEON },
  { name: 'Sevilla', community: ANDALUCIA, aliases: ['Seville'] },
  { name: 'Soria', community: CASTILLA_Y_LEON },
  { name: 'Tarragona', community: CATALUNA },
  { name: 'Teruel', community: ARAGON },
  { name: 'Toledo', community: CASTILLA_LA_MANCHA },
  { name: 'Valencia', community: VALENCIANA, aliases: ['València', 'Valencia/València'] },
  { name: 'Valladolid', community: CASTILLA_Y_LEON },
  { name: 'Vizcaya', community: PAIS_VASCO, aliases: ['Bizkaia', 'Biscay'] },
  { name: 'Zamora', community: CASTILLA_Y_LEON },
  { name: 'Zaragoza', community: ARAGON, aliases: ['Saragossa'] },
];

/**
 * A name as compared: lowercase, without accents, without "Provincia de" or "Province of"
 * (Google's names may carry them). Time O(n) in its length.
 */
export function normalizePlaceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(provincia de|province of|provincia)\s+/, '')
    .trim();
}

/** Every name of every province, normalized, to its province. */
const BY_NAME: ReadonlyMap<string, Province> = new Map(
  PROVINCES.flatMap((province) =>
    [province.name, ...(province.aliases ?? [])].map(
      (alias) => [normalizePlaceName(alias), province] as const,
    ),
  ),
);

/** The Spanish province one of `names` names, with its community; `null` if none does. */
export function spanishProvince(
  ...names: readonly (string | null)[]
): { readonly province: string; readonly community: string } | null {
  for (const name of names) {
    const province = name === null ? undefined : BY_NAME.get(normalizePlaceName(name));
    if (province !== undefined) {
      return { province: province.name, community: province.community };
    }
  }
  return null;
}

/** How many provinces and autonomous cities there are, for the tests. */
export const SPANISH_PROVINCE_COUNT = PROVINCES.length;
