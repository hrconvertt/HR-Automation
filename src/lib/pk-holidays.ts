/**
 * Pakistan public holidays for 2026. Dates that depend on lunar sightings
 * (Eid, Ashura, Rabi-ul-Awwal) are best-guess based on the 2026 government
 * calendar — HR can override by adding entries to the Holiday table.
 */
export interface PKHoliday {
  date: string // YYYY-MM-DD
  name: string
  type: 'PUBLIC' | 'OPTIONAL'
}

export const PK_HOLIDAYS_2026: PKHoliday[] = [
  { date: '2026-02-05', name: 'Kashmir Solidarity Day', type: 'PUBLIC' },
  { date: '2026-03-23', name: 'Pakistan Day', type: 'PUBLIC' },
  { date: '2026-04-10', name: 'Eid-ul-Fitr (Day 1)', type: 'PUBLIC' },
  { date: '2026-04-11', name: 'Eid-ul-Fitr (Day 2)', type: 'PUBLIC' },
  { date: '2026-04-12', name: 'Eid-ul-Fitr (Day 3)', type: 'PUBLIC' },
  { date: '2026-05-01', name: 'Labour Day', type: 'PUBLIC' },
  { date: '2026-06-16', name: 'Eid-ul-Adha (Day 1)', type: 'PUBLIC' },
  { date: '2026-06-17', name: 'Eid-ul-Adha (Day 2)', type: 'PUBLIC' },
  { date: '2026-06-18', name: 'Eid-ul-Adha (Day 3)', type: 'PUBLIC' },
  { date: '2026-07-16', name: 'Ashura (9 Muharram)', type: 'PUBLIC' },
  { date: '2026-07-17', name: 'Ashura (10 Muharram)', type: 'PUBLIC' },
  { date: '2026-08-14', name: 'Independence Day', type: 'PUBLIC' },
  { date: '2026-09-15', name: 'Eid Milad-un-Nabi', type: 'PUBLIC' },
  { date: '2026-11-09', name: 'Iqbal Day', type: 'PUBLIC' },
  { date: '2026-12-25', name: 'Quaid-e-Azam Day / Christmas', type: 'PUBLIC' },
]

export function holidaysForMonth(year: number, month: number): PKHoliday[] {
  // month is 0-indexed
  return PK_HOLIDAYS_2026.filter((h) => {
    const d = new Date(h.date)
    return d.getFullYear() === year && d.getMonth() === month
  })
}
