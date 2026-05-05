function pad2(num) {
  return String(num).padStart(2, "0");
}

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function monthOfDate(dateStr) {
  return dateStr.slice(0, 7);
}

function shiftMonth(monthStr, delta) {
  const [year, month] = monthStr.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function listMonthGrid(monthStr, selectedDate, today, dayStatusMap = {}) {
  const [year, month] = monthStr.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  // JS getDay(): 周日=0，周一=1...；此处转换为周一=0，周日=6。
  const leading = (first.getDay() + 6) % 7;
  const totalDays = last.getDate();

  const cells = [];
  for (let i = 0; i < leading; i += 1) {
    cells.push({
      type: "empty",
      key: `empty-${i}`,
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    cells.push({
      type: "day",
      key: date,
      day,
      date,
      isToday: date === today,
      isSelected: date === selectedDate,
      status: dayStatusMap[date] || "no_todo",
    });
  }

  return cells;
}

module.exports = {
  getTodayDate,
  monthOfDate,
  shiftMonth,
  listMonthGrid,
};
