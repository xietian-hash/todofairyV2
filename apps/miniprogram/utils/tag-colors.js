/**
 * 标签颜色映射
 * 符合轻拟物质感UI规范：柔和的浅色背景 + 适中饱和度文字色
 * 对比度均 >= 4.5:1，符合无障碍标准
 */

const TAG_COLORS = [
  { name: '蓝色', bg: '#E0F5FF', text: '#0369A1' },  // 品牌色系
  { name: '紫色', bg: '#EDE9FE', text: '#6D28D9' },  // 渐变终点色系
  { name: '绿色', bg: '#D1FAE5', text: '#047857' },  // 清新绿
  { name: '黄色', bg: '#FEF3C7', text: '#B45309' },  // 柔和黄
  { name: '橙色', bg: '#FFEDD5', text: '#C2410C' },  // 温暖橙
  { name: '红色', bg: '#FEE2E2', text: '#B91C1C' },  // 柔和红
  { name: '粉色', bg: '#FCE7F3', text: '#BE185D' },  // 淡粉
  { name: '青色', bg: '#CFFAFE', text: '#0E7490' },  // 清透青
];

/**
 * 根据颜色索引获取颜色配置
 * @param {number} colorIndex - 颜色索引（0-7）
 * @returns {{ bg: string, text: string }} 颜色配置
 */
function getTagColor(colorIndex) {
  const index = Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex <= 7
    ? colorIndex
    : 0;
  return TAG_COLORS[index];
}

/**
 * 获取所有颜色选项（用于颜色选择器）
 * @returns {Array<{ index: number, name: string, bg: string, text: string }>}
 */
function getAllTagColors() {
  return TAG_COLORS.map((color, index) => ({
    index,
    ...color,
  }));
}

module.exports = {
  TAG_COLORS,
  getTagColor,
  getAllTagColors,
};
