export const BUSINESS_COUNTRIES = [
  { code: 'DO', label: 'República Dominicana', currency: 'DOP', timezone: 'America/Santo_Domingo' },
  { code: 'MX', label: 'México', currency: 'MXN', timezone: 'America/Mexico_City' },
  { code: 'CO', label: 'Colombia', currency: 'COP', timezone: 'America/Bogota' },
  { code: 'PE', label: 'Perú', currency: 'PEN', timezone: 'America/Lima' },
  { code: 'CL', label: 'Chile', currency: 'CLP', timezone: 'America/Santiago' },
  { code: 'AR', label: 'Argentina', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'UY', label: 'Uruguay', currency: 'UYU', timezone: 'America/Montevideo' },
  { code: 'PY', label: 'Paraguay', currency: 'PYG', timezone: 'America/Asuncion' },
  { code: 'BO', label: 'Bolivia', currency: 'BOB', timezone: 'America/La_Paz' },
  { code: 'EC', label: 'Ecuador', currency: 'USD', timezone: 'America/Guayaquil' },
  { code: 'PA', label: 'Panamá', currency: 'USD', timezone: 'America/Panama' },
  { code: 'CR', label: 'Costa Rica', currency: 'CRC', timezone: 'America/Costa_Rica' },
  { code: 'GT', label: 'Guatemala', currency: 'GTQ', timezone: 'America/Guatemala' },
  { code: 'HN', label: 'Honduras', currency: 'HNL', timezone: 'America/Tegucigalpa' },
  { code: 'SV', label: 'El Salvador', currency: 'USD', timezone: 'America/El_Salvador' },
  { code: 'NI', label: 'Nicaragua', currency: 'NIO', timezone: 'America/Managua' },
  { code: 'BR', label: 'Brasil', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  { code: 'VE', label: 'Venezuela', currency: 'VES', timezone: 'America/Caracas' },
  { code: 'PR', label: 'Puerto Rico', currency: 'USD', timezone: 'America/Puerto_Rico' },
  { code: 'US', label: 'Estados Unidos', currency: 'USD', timezone: 'America/New_York' },
  { code: 'ES', label: 'España', currency: 'EUR', timezone: 'Europe/Madrid' },
];

export const BUSINESS_CURRENCIES = Array.from(new Set(BUSINESS_COUNTRIES.map((country) => country.currency)));

export function getBusinessCountry(code) {
  return BUSINESS_COUNTRIES.find((country) => country.code === code) || BUSINESS_COUNTRIES[0];
}
