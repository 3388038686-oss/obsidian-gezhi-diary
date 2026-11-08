/* ============ 农历 / 节气 / 节日（零依赖，1900–2100） ============
 * 为什么不直接引 lunar-javascript：那个库压缩后 419KB，而且是 UMD 包装，
 * 在 Obsidian 手机端的 CommonJS 环境下加载不可靠。
 * 这里只保留真正要用的两块数据（农历月规模 + 节气日期），合计约 6KB。
 *
 * 农历编码（每年一个整数）：
 *   bits 0-3  : 闰月是几月（0 = 这年没闰月）
 *   bit  16   : 闰月是 30 天（不置位 = 29 天）
 *   bits 4-15 : 正月..腊月的天数，1 = 30 天，0 = 29 天
 * ================================================================= */

const LUNAR_START_YEAR = 1900;
const LUNAR_END_YEAR = 2100;
/* 1900-01-31 是农历 1900 年正月初一，所有换算从这里起算 */
const LUNAR_EPOCH = Date.UTC(1900, 0, 31);

const LUNAR_TABLE = [
  "bd28", "7520", "ea50", "b2a5", "64b0", "a9b0", "1aa64", "56a0", "b590", "baa2",
  "7520", "da56", "b250", "a4b0", "1a4b5", "2ad0", "56b0", "5b52", "da90", "1e927",
  "e920", "d250", "d2d5", "a560", "2b60", "1ad54", "6d40", "ea90", "f4a2", "e920",
  "6a66", "52b0", "a570", "19565", "b5a0", "6d40", "17613", "7490", "1b137", "a930",
  "52b0", "151b6", "aad0", "56a0", "1da54", "ba40", "b490", "d4b2", "a950", "aad7",
  "5360", "aad0", "1aca5", "5b20", "da50", "1ea23", "d4a0", "5958", "a970", "5560",
  "5756", "ad50", "6d20", "7554", "ea50", "64a0", "64f3", "a9b0", "ada7", "56a0",
  "b690", "bb25", "b520", "b250", "b2b4", "a4b0", "aab8", "2ad0", "56d0", "15a96",
  "da90", "d920", "e954", "d250", "e4da", "a560", "2b60", "2f56", "6d50", "ea90",
  "f525", "e920", "d260", "52e3", "a570", "ad68", "35a0", "6d50", "b695", "7490",
  "6930", "a9b4", "52b0", "a5b0", "aae2", "56a0", "dd57", "ba40", "b490", "d535",
  "a950", "52d0", "55d4", "ab50", "baa9", "5d20", "da50", "1e8a6", "d4a0", "c950",
  "a9e4", "5560", "ab50", "ada2", "6d20", "7656", "7250", "64b0", "6575", "cab0",
  "55a0", "56e3", "b690", "f52b", "b520", "b250", "1d0b6", "a4b0", "4ab0", "2bb5",
  "5ad0", "b6a0", "daa2", "d920", "ea57", "d250", "a550", "1a4d5", "4b60", "5b50",
  "16d23", "ec90", "f928", "e920", "d260", "15166", "a570", "4d60", "13654", "7550",
  "7490", "74b3", "6930", "aab7", "52b0", "a5b0", "aba5", "56a0", "b650", "baa4",
  "b4a0", "d958", "a950", "52d0", "56d6", "ab50", "5aa0", "5d54", "da50", "d4a0",
  "e4d3", "c960", "cce7", "5560", "ab50", "1ad25", "6d20", "ea50", "72a4", "68b0",
  "6978", "4ab0", "55b0", "15566", "b6a0", "7520", "b954", "b450", "a8b0", "a4f2",
  "4ab0",
].map((h) => parseInt(h, 16));

/* 节气表：每年 24 个字符，位置 i 对应公历 floor(i/2)+1 月。
 * 字符是 36 进制（0-9a-z → 0-35），表示那一天是几号。
 * 顺序：小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至
 *       小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至 */
const TERM_NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分",
  "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
  "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
  "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];
const TERM_TABLE = [
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j6l6l6m7m8o8o8o9o8n8n", "6l5k7m6l7m7m8o9o9o9o8n8n",
  "7l5k6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j6l6l6m6m8o8o8o9o8n8n", "6l5k7m6l7m7m8o9o9o9o8n8n",
  "7l5k6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j6l6l6m6m8o8o8o9o8n8n", "6l5k7m6l7m7m8o9o9o9o8n8n",
  "7l5k6l5k6l6m7n8n8n9o8m7m", "6k4j6l5l6m6m8n8o8n9o8n8m",
  "6l4j6l5l6m6m8o8o8o9o8n8n", "6l5k6m6l6m7m8o8o9o9o8n8n",
  "6l5k6l5k6l6m7n8n8n8o8m7m", "6k4j6l5l6l6m8n8o8n9o8n8m",
  "6l4j6l5l6m6m8o8o8o9o8n8m", "6l5k6m6l6m7m8o8o9o9o8n8n",
  "6l5k6l5k6l6m7n8n8n8o8m7m", "6k4j6l5k6l6m8n8o8n9o8n7m",
  "6l4j6l5l6m6m8o8o8o9o8n8m", "6l5j6l6l6m7m8o8o9o9o8n8n",
  "6l5k6l5k6l6m7n8n8n8o8m7m", "6k4j6l5k6l6m8n8o8n9o8n7m",
  "6l4j6l5l6m6m8n8o8o9o8n8m", "6l5j6l6l6m7m8o8o9o9o8n8n",
  "6l5k6l5k6l6m7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j6l5l6m6m8n8o8o9o8n8m", "6l5j6l6l6m7m8o8o8o9o8n8n",
  "6l5k6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j6l5l6m6m8n8o8o9o8n8m", "6l5j6l6l6m6m8o8o8o9o8n8n",
  "6l5k6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j6l5l6m6m8n8o8o9o8n8m", "6l5j6l6l6m6m8o8o8o9o8n8n",
  "6l5k6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j6l5l6m6m8n8o8o9o8n8m", "6l5j6l6l6m6m8o8o8o9o8n8n",
  "6l5k6l5k5l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n8o8m7m",
  "6k4j6l5l6m6m8n8o8n9o8n8m", "6l4j6l5l6m6m8o8o8o9o8n8n",
  "6l5k5l5k5l6l7n7n8n8n7m7m", "5k4j6l5k6l6m7n8n8n8o8m7m",
  "6k4j6l5k6l6m8n8o8n9o8n8m", "6l4j6l5l6m6m8o8o8o9o8n8n",
  "6l5k5l5k5l6l7n7n8n8n7m7m", "5k4j6l5k6l6m7n8n8n8o8m7m",
  "6k4j6l5k6l6m8n8o8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5k5k5k5l6l7n7n8n8n7m7m", "5k4j6l5k6l6m7n8n8n8o8m7m",
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j5k5k5l6l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j5k5k5l6l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8o9o8n8m",
  "6l5j5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n8n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n9o8n7m", "6l4j6l5l6m6m8n8o8n9o8n8m",
  "6l5j5k4k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n8o8n7m", "6k4j6l5l6l6m8n8o8n9o8n8m",
  "6l5j5k4k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j6l5k6l6m7n8n8n8o8m7m", "6k4j6l5k6l6m8n8o8n9o8n8m",
  "6l4j5k4k5l5l7m7n7n8n7m7m", "5k4j5l5k5l6l7n7n8n8n7m7m",
  "5k4j6l5k6l6m7n8n8n8o8m7m", "6k4j6l5k6l6m7n8o8n9o8n7m",
  "6l4j5k4k5l5l7m7n7n8n7m7l", "5k4j5k5k5l6l7n7n7n8n7m7m",
  "5k4j6l5k6l6l7n8n8n8o8m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l6l7n7n7n8n7m7m",
  "5k4j6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j6l5k6l6l7n8n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j6l5k5l6l7n7n8n8n7m7m", "6k4j6l5k6l6m7n8n8n9o8n7m",
  "6l4j5k4k5l5l7m7n7m8n7m7l", "5k4i5k4k5l5l7n7n7n8n7m7m",
  "5k4j6l5k5l6l7n7n8n8n7m7m", "6k4j6l5k6l6m7n8n8n8o8n7m",
  "6l4j5k4k5k5l7m7n7m8n7m7l", "5k4i5k4k5l5l7m7n7n8n7m7m",
  "5k4j6l5k5l6l7n7n8n8n7m7m", "6k4j6l5k6l6m7n8n8n8o8m7m",
  "6k4j5k4j5k5l7m7n7m8n7m7l", "5k3i5k4k5l5l7m7n7n8n7m7m",
  "5k4j5l5k5l6l7n7n8n8n7m7m", "5k4j6l5k6l6l7n8n8n8o8m7m",
  "6k4j5k4j5k5l6m7m7m8n7m7l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4j5k5k5l6l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8o8m7m",
  "6k4j5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8n7m7m",
  "6k4j5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k6l6l7n8n8n8n7m7m",
  "6k4j5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i5k5k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5k5l7m7n7m8n7m7l",
  "5k4i5k4k5l5l7n7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j5k4j5k5l6m7m7m7n7m6l", "5k3i5k4j5k5l7m7n7m8n7m7l",
  "5k4i5k4k5l5l7m7n7n8n7m7m", "5k4j6l5k5l6l7n7n8n8n7m7m",
  "6k4j5k4j5k5k6m7m7m7n7l6l", "5j3i5k4j5k5l6m7m7m8n7m7l",
  "5k3i5k4k5l5l7m7n7n8n7m7m", "5k4j5k5k5l6l7n7n7n8n7m7m",
  "5k4j5k4j5k5k6m7m7m7n7l6l", "5j3i5k4j5k5l6m7m7m8n7m7l",
  "5k3i5k4k5l5l7m7n7n8n7m7m", "5k4j5k5k5l5l7n7n7n8n7m7m",
  "5k4j5k4j5k5k6m7m7m7n7l6l", "5j3i5k4j5k5l6m7m7m8n7m6l",
  "5k3i5k4k5l5l7m7n7n8n7m7l", "5k4j5k5k5l5l7n7n7n8n7m7m",
  "5k4j5k4j5k5k6m7m7m7m6l6l", "5j3i5k4j5k5l6m7m7m8n7m6l",
  "5k3i5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j5k4j5k5k6m7m7m7m6l6l", "5j3i5k4j5k5l6m7m7m8n7m6l",
  "5k3i5k4k5l5l7m7n7n8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j5k4j4k5k6m6m7m7m6l6l", "5j3i5k4j5k5l6m7m7m8n7m6l",
  "5k3i5k4k5k5l7m7n7m8n7m7l", "5k4i5k5k5l5l7n7n7n8n7m7m",
  "5k4j5k4j4k5k6m6m7m7m6l6l", "5j3i5k4j5k5l6m7m7m7n7m6l",
  "5k3i5k4k5k5l7m7n7m8n7m7l", "5k4i5k4k5l5l7m7n7n8n7m7m",
  "5k4j5k4j4k5k6m6m7m7m6l6l", "5j3i5k4j5k5l6m7m7m7n7m6l",
  "5k3i5k4j5k5l6m7n7m8n7m7l", "5k4i5k4k5l5l7m7n7n8n7m7m",
  "5k4j5k4j4k5k6m6m7m7m6l6l", "5j3i5k4j5k5k6m7m7m7n7l6l",
  "5k3i5k4j5k5l6m7m7m8n7m7l", "5k3i5k4k5l5l7m7n7n8n7m7m",
  "5k4j4j4j4k5k6m6m6m7m6l6l", "4j3i5k4j5k5k6m7m7m7n7l6l",
  "5j3i5k4j5k5l6m7m7m8n7m7l", "5k3i5k4k5l5l7m7n7n8n7m7m",
  "5k4j4j4j4k4k6m6m6m7m6l6l", "4j3i5k4j5k5k6m7m7m7n7l6l",
  "5j3i5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4j4j4j4k4k6m6m6m7m6l6l", "4j3i5k4j5k5k6m7m7m7m6l6l",
  "5j3i5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i4j4j4k4k6m6m6m7m6l6l", "4j3i5k4j5k5k6m6m7m7m6l6l",
  "5j3i5k4j5k5l6m7m7m8n7m6l", "5k3i5k4k5l5l7m7n7n8n7m7l",
  "5k4i5k5k5l5l7n7n7n8n7m7m",
];
const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

const LUNAR_MONTH_CN = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const LUNAR_DAY_CN = [
  "", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];
const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/* 农历节日：键是 "月-日"，闰月不放假（民间习惯） */
const LUNAR_FESTIVALS = {
  "1-1": "春节", "1-15": "元宵节", "2-2": "龙抬头",
  "5-5": "端午节", "7-7": "七夕", "7-15": "中元节",
  "8-15": "中秋节", "9-9": "重阳节", "10-1": "寒衣节",
  "10-15": "下元节", "12-8": "腊八节", "12-23": "小年",
};
/* 公历节日 */
const SOLAR_FESTIVALS = {
  "01-01": "元旦", "02-14": "情人节", "03-08": "妇女节", "03-12": "植树节",
  "04-01": "愚人节", "05-01": "劳动节", "05-04": "青年节", "06-01": "儿童节",
  "07-01": "建党节", "08-01": "建军节", "09-10": "教师节", "10-01": "国庆节",
  "12-24": "平安夜", "12-25": "圣诞节",
};

/* 取某个农历年的总天数 */
function lunarYearDays(ly) {
  const info = LUNAR_TABLE[ly - LUNAR_START_YEAR];
  if (info == null) return 0;
  let total = 0;
  for (let m = 1; m <= 12; m++) total += info & (1 << (m + 3)) ? 30 : 29;
  const leap = info & 0xf;
  if (leap) total += info & 0x10000 ? 30 : 29;
  return total;
}

/* 取某农历月天数；leap=true 取闰月 */
function lunarMonthDays(ly, m, leap) {
  const info = LUNAR_TABLE[ly - LUNAR_START_YEAR];
  if (info == null) return 29;
  if (leap) return info & 0x10000 ? 30 : 29;
  return info & (1 << (m + 3)) ? 30 : 29;
}

/* 公历 "YYYY-MM-DD" → 农历对象 */
function lunarOf(dateStr) {
  const p = String(dateStr || "").split("-").map(Number);
  if (p.length < 3 || !p[0]) return null;
  const [y, mo, d] = p;
  let offset = Math.round((Date.UTC(y, mo - 1, d) - LUNAR_EPOCH) / 86400000);
  if (offset < 0 || y > LUNAR_END_YEAR) return null;

  let ly = LUNAR_START_YEAR;
  while (ly <= LUNAR_END_YEAR) {
    const yd = lunarYearDays(ly);
    if (offset < yd) break;
    offset -= yd;
    ly++;
  }
  const info = LUNAR_TABLE[ly - LUNAR_START_YEAR];
  const leapMonth = info & 0xf;
  let lm = 1, isLeap = false;
  for (lm = 1; lm <= 12; lm++) {
    const md = lunarMonthDays(ly, lm, false);
    if (offset < md) break;
    offset -= md;
    if (leapMonth === lm) {
      const ld = lunarMonthDays(ly, lm, true);
      if (offset < ld) { isLeap = true; break; }
      offset -= ld;
    }
  }
  const ld = offset + 1;
  return {
    ly, lm, ld, isLeap, monthDays: lunarMonthDays(ly, lm, isLeap),
    monthName: (isLeap ? "闰" : "") + LUNAR_MONTH_CN[lm - 1] + "月",
    dayName: LUNAR_DAY_CN[ld] || String(ld),
    ganzhi: GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12],
  };
}

/* 公历 "YYYY-MM-DD" 当天的节气名（没有则空） */
function termOf(dateStr) {
  const p = String(dateStr || "").split("-").map(Number);
  if (p.length < 3 || !p[0]) return "";
  const row = TERM_TABLE[p[0] - LUNAR_START_YEAR];
  if (!row) return "";
  const d = p[2], month = p[1];
  for (let k = 0; k < 2; k++) {
    const i = (month - 1) * 2 + k;
    if (B36.indexOf(row[i]) === d) return TERM_NAMES[i];
  }
  return "";
}

/* 当天最该显示的那一句：农历节日 > 公历节日 > 节气 */
function festivalOf(dateStr) {
  const p = String(dateStr || "").split("-");
  if (p.length < 3) return "";
  const solar = SOLAR_FESTIVALS[p[1] + "-" + p[2]];
  const ln = lunarOf(dateStr);
  let lunar = "";
  if (ln && !ln.isLeap) {
    lunar = LUNAR_FESTIVALS[ln.lm + "-" + ln.ld] || "";
    /* 除夕：腊月最后一天 */
    if (!lunar && ln.lm === 12 && ln.ld === ln.monthDays) lunar = "除夕";
  }
  return lunar || solar || termOf(dateStr) || "";
}

/* 日历格子里那行小字：节日优先，其次节气，再看农历日（初一显示月名，十五显示「十五」） */
function lunarLabel(dateStr, granularity) {
  const fest = festivalOf(dateStr);
  if (fest) return fest;
  const ln = lunarOf(dateStr);
  if (!ln) return "";
  const g = granularity || "major";
  if (g === "full") return ln.dayName;
  if (ln.ld === 1) {
    /* 初一时显示月名更有信息量，但「正月」和「一月」重名，加「月」字区分 */
    return ln.isLeap ? "闰" + LUNAR_MONTH_CN[ln.lm - 1] + "月" : LUNAR_MONTH_CN[ln.lm - 1] + "月";
  }
  if (ln.ld === 15) return "十五";
  if (g === "major") return "";
  return ln.dayName;
}

/* 节气是否落在某天 */
function isTermDay(dateStr) { return !!termOf(dateStr); }
