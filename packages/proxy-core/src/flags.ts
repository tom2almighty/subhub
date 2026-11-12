export type FlagPosition = 'prefix' | 'suffix' | 'replace';

const FLAG_REGEX = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

const REGIONS: { code: string; keywords: string[] }[] = [
  { code: 'HK', keywords: ['香港', 'hong kong'] },
  { code: 'TW', keywords: ['台湾', '台灣', '台北', '新北', '桃园', 'taiwan', 'taipei'] },
  { code: 'MO', keywords: ['澳门', '澳門', 'macau'] },
  { code: 'CN', keywords: ['中国', '中國', '大陆', '大陸', '内地', 'china', 'mainland'] },
  {
    code: 'JP',
    keywords: ['日本', '东京', '東京', '大阪', '埼玉', 'japan', 'tokyo', 'osaka'],
  },
  { code: 'SG', keywords: ['新加坡', '狮城', '獅城', 'singapore'] },
  {
    code: 'US',
    keywords: [
      '美国',
      '美國',
      '洛杉矶',
      '洛杉磯',
      '圣何塞',
      '聖何塞',
      '西雅图',
      '西雅圖',
      '纽约',
      '紐約',
      'united states',
      'america',
    ],
  },
  { code: 'KR', keywords: ['韩国', '韓國', '首尔', '首爾', 'korea', 'seoul'] },
  { code: 'GB', keywords: ['英国', '英國', '伦敦', '倫敦', 'britain', 'london'] },
  { code: 'DE', keywords: ['德国', '德國', '法兰克福', '法蘭克福', 'germany'] },
  { code: 'FR', keywords: ['法国', '法國', '巴黎', 'france', 'paris'] },
  { code: 'NL', keywords: ['荷兰', '荷蘭', '阿姆斯特丹', 'netherlands'] },
  { code: 'RU', keywords: ['俄罗斯', '俄羅斯', '莫斯科', 'russia', 'moscow'] },
  { code: 'CA', keywords: ['加拿大', '多伦多', '多倫多', 'canada', 'toronto'] },
  { code: 'AU', keywords: ['澳大利亚', '澳大利亞', '澳洲', '悉尼', 'australia', 'sydney'] },
  { code: 'IN', keywords: ['印度', '孟买', '孟買', 'india', 'mumbai'] },
  { code: 'TR', keywords: ['土耳其', '伊斯坦布尔', '伊斯坦堡', 'turkey', 'istanbul'] },
  { code: 'MY', keywords: ['马来西亚', '馬來西亞', '吉隆坡', 'malaysia'] },
  { code: 'TH', keywords: ['泰国', '泰國', '曼谷', 'thailand', 'bangkok'] },
  { code: 'VN', keywords: ['越南', 'vietnam'] },
  { code: 'PH', keywords: ['菲律宾', '菲律賓', 'philippines'] },
  { code: 'ID', keywords: ['印尼', '印度尼西亚', '印度尼西亞', '雅加达', '雅加達', 'indonesia'] },
  { code: 'AE', keywords: ['阿联酋', '阿聯酋', '迪拜', 'uae', 'dubai'] },
  { code: 'BR', keywords: ['巴西', 'brazil'] },
  { code: 'AR', keywords: ['阿根廷', 'argentina'] },
  { code: 'CH', keywords: ['瑞士', 'switzerland'] },
  { code: 'SE', keywords: ['瑞典', 'sweden'] },
  { code: 'NO', keywords: ['挪威', 'norway'] },
  { code: 'FI', keywords: ['芬兰', '芬蘭', 'finland'] },
  { code: 'DK', keywords: ['丹麦', '丹麥', 'denmark'] },
  { code: 'PL', keywords: ['波兰', '波蘭', 'poland'] },
  { code: 'ES', keywords: ['西班牙', 'spain'] },
  { code: 'IT', keywords: ['意大利', 'italy'] },
  { code: 'IE', keywords: ['爱尔兰', '愛爾蘭', 'ireland'] },
  { code: 'UA', keywords: ['乌克兰', '烏克蘭', 'ukraine'] },
  { code: 'IL', keywords: ['以色列', 'israel'] },
  { code: 'ZA', keywords: ['南非', 'south africa'] },
  { code: 'MX', keywords: ['墨西哥', 'mexico'] },
  { code: 'CL', keywords: ['智利', 'chile'] },
  { code: 'AT', keywords: ['奥地利', '奧地利', 'austria'] },
  { code: 'BE', keywords: ['比利时', '比利時', 'belgium'] },
  { code: 'CZ', keywords: ['捷克', 'czech'] },
  { code: 'HU', keywords: ['匈牙利', 'hungary'] },
  { code: 'RO', keywords: ['罗马尼亚', '羅馬尼亞', 'romania'] },
  { code: 'PT', keywords: ['葡萄牙', 'portugal'] },
  { code: 'GR', keywords: ['希腊', '希臘', 'greece'] },
  { code: 'EG', keywords: ['埃及', 'egypt'] },
  { code: 'SA', keywords: ['沙特', 'saudi'] },
  { code: 'PK', keywords: ['巴基斯坦', 'pakistan'] },
  { code: 'BD', keywords: ['孟加拉', 'bangladesh'] },
  { code: 'KZ', keywords: ['哈萨克斯坦', '哈薩克', 'kazakhstan'] },
];

const CODES: { code: string; pattern: RegExp }[] = REGIONS.map(({ code }) => ({
  code,
  pattern: new RegExp(`(?:^|[^A-Z])${code}(?:$|[^A-Z])`),
}));

export function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');
}

export function flagToCode(flag: string): string {
  return [...flag]
    .map((letter) => String.fromCharCode((letter.codePointAt(0) ?? 0x1f1e6) - 0x1f1e6 + 65))
    .join('');
}

export function detectRegionCode(name: string): string | undefined {
  const existing = name.match(FLAG_REGEX)?.[0];
  if (existing) return flagToCode(existing);

  const lower = name.toLowerCase();
  for (const region of REGIONS) {
    if (region.keywords.some((keyword) => lower.includes(keyword))) return region.code;
  }

  const upper = name.toUpperCase();
  for (const entry of CODES) {
    if (entry.pattern.test(upper)) return entry.code;
  }
  return undefined;
}

export function applyFlag(
  name: string,
  options: { position: FlagPosition; twAsCn: boolean },
): string {
  const { position, twAsCn } = options;
  const existingFlags = name.match(FLAG_REGEX) ?? [];

  if (position === 'replace') {
    if (existingFlags.length === 0) return name;
    return name.replace(FLAG_REGEX, (flag) => {
      const code = flagToCode(flag);
      return flagEmoji(twAsCn && code === 'TW' ? 'CN' : code);
    });
  }

  const detected = detectRegionCode(name);
  if (!detected) return name;
  const code = twAsCn && detected === 'TW' ? 'CN' : detected;
  const cleaned = name
    .replace(FLAG_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return position === 'prefix' ? `${flagEmoji(code)} ${cleaned}` : `${cleaned} ${flagEmoji(code)}`;
}
