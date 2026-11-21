// Kapcsolati adatok: csak a kitöltött mezők jelennek meg az oldalon.
export const site = {
  name: 'Nails by Evelin',
  facebookUrl: 'https://www.facebook.com/share/1EanjEpSsz/',
  instagramUrl: '',
  phone: '+36 20 219 2374',
  address: '', // pl. '1234 Város, Utca 1.' – a keresőknek (helyi találatok) is ez kerül a strukturált adatba
  // Helyszín: a címben, leírásban, kulcsszavakban és a Google helyi találatainál (strukturált adat) használjuk
  city: 'Kaposvár',
  cityIn: 'Kaposváron', // ragozott alak a szövegekhez
  postalCode: '7400',
  region: 'Somogy megye',
}

// Keresőoptimalizálás: cím, leírás, kulcsszavak (index.html <head>, a vite.config.ts injektálja build közben)
export const seo = {
  title: 'Műköröm és géllakk Kaposváron – Nails by Evelin | Online foglalás',
  description: 'Műköröm építés, töltés és géllakk Kaposváron, Evelintől: precízen, kapkodás nélkül. Átlátható árak, online időpontfoglalás és ajándékutalvány.',
  keywords: [
    'műköröm Kaposvár', 'géllakk Kaposvár', 'körömépítés Kaposvár', 'körmös Kaposvár', 'műköröm töltés Kaposvár',
    'műköröm', 'géllakk', 'körömépítés', 'műköröm töltés', 'francia géllakk', 'köröm díszítés', 'ajándékutalvány', 'online időpontfoglalás',
  ],
  ogImage: 'og-image.jpg',
}
