export type Photo = { name: string; w: number; h: number; alt: string; caption: string; focus?: string }

// A /public/images alatt: <név>.webp (≤1080 px), <név>-sm.webp (640 px), <név>-xs.webp (400 px) – tools/convert-images.sh
export const photos: Record<string, Photo> = {
  'chanel-black': { name: 'chanel-black', w: 1080, h: 1216, alt: 'Fekete körmök strasszos díszekkel', caption: 'Fekete, díszekkel' },
  'french-flower': { name: 'french-flower', w: 1080, h: 2033, alt: 'Francia köröm kék virágmintával', caption: 'Francia, virággal', focus: '50% 38%' },
  'pink-glitter': { name: 'pink-glitter', w: 1080, h: 1392, alt: 'Rózsaszín csillogó és gyöngyházfehér körmök', caption: 'Rózsaszín csillogás' },
  'leopard-rust': { name: 'leopard-rust', w: 1080, h: 1440, alt: 'Rozsdabarna körmök leopárdmintával', caption: 'Rozsda és leopárd' },
  'burgundy-dots': { name: 'burgundy-dots', w: 1024, h: 1174, alt: 'Bordó francia és pöttyös körmök', caption: 'Bordó, pöttyökkel' },
  'red-glitter': { name: 'red-glitter', w: 1080, h: 1282, alt: 'Hosszú mandula alakú körmök vörös glitterrel', caption: 'Vörös glitter' },
  'mocha-crystals': { name: 'mocha-crystals', w: 1080, h: 1386, alt: 'Mokkabarna körmök apró kristályokkal', caption: 'Mokka, kristályokkal' },
  'french-gems': { name: 'french-gems', w: 1080, h: 1398, alt: 'Fehér végű francia körmök drágakő díszekkel', caption: 'Francia, drágakővel' },
  'pink-nude': { name: 'pink-nude', w: 1080, h: 1426, alt: 'Natúr rózsaszín, hosszú körmök', caption: 'Nude rózsa' },
  'ombre-pearls': { name: 'ombre-pearls', w: 1080, h: 1419, alt: 'Rózsaszínből fehérbe tűnő ombré körmök', caption: 'Ombré' },
  'burgundy-french': { name: 'burgundy-french', w: 1080, h: 1161, alt: 'Bordó végű francia körmök', caption: 'Bordó francia' },
  'christmas-wonder': { name: 'christmas-wonder', w: 1080, h: 1182, alt: 'Egy kis karácsonyi csoda – Nails by Evelin', caption: 'Karácsonyi csoda' },
  voucher: { name: 'voucher', w: 1080, h: 712, alt: 'Karácsonyi ajándékutalvány – Nails by Evelin', caption: 'Ajándékutalvány' },
}
