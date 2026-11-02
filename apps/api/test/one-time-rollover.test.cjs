const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
require('reflect-metadata');
const { Prisma } = require('@prisma/client');
const { TodosService } = require('../dist/modules/todos/todos.service');
const { CalendarService } = require('../dist/modules/calendar/calendar.service');
const { StatsService } = require('../dist/modules/stats/stats.service');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
const { InternalService } = require('../dist/modules/internal/internal.service');
const { TasksService } = require('../dist/modules/tasks/tasks.service');
const { classifyTodos } = require('../dist/common/database/todo-classification');
const { todayStr, offsetDateStr } = require('../dist/common/utils/domain-utils');

const today = todayStr();
const yesterday = offsetDateStr(today, -1);
const earlier = offsetDateStr(today, -4);
const tomorrow = offsetDateStr(today, 1);
const task = (id, weekdays, userId = 'u1') => ({ id, userId, isDeleted: true, repeatRuleJson: { type: 'weekly', weekdays } });
const todo = (id, parentTaskId, extra = {}) => ({
  id, userId: 'u1', taskId: parentTaskId, parentTaskId, parentTodoId: null,
  isSubTodo: false, status: 1, isDeleted: false, todoDate: today,
  isExpired: false, expiredAt: 0n, completedAt: 0n, createdAt: 1n, updatedAt: 1n, deletedAt: 0n,
  title: id, remark: '保留备注', tagId: null, tagName: '', subTaskIndex: 0, ...extra,
});

// 用隔离的数据存储验证服务行为，不接触开发或线上数据库。
function matches(row, where = {}) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return condition.some((item) => matches(row, item));
    if (condition && typeof condition === 'object') {
      return Object.entries(condition).every(([op, value]) => {
        if (op === 'in') return value.includes(row[key]);
        if (op === 'lt') return row[key] < value;
        if (op === 'gte') return row[key] >= value;
        if (op === 'lte') return row[key] <= value;
        if (op === 'not') return row[key] !== value;
        throw new Error(`未支持的查询条件 ${op}`);
      });
    }
    return row[key] === condition;
  });
}

function database(todos, tasks) {
  const state = { todos: structuredClone(todos), tasks: structuredClone(tasks) };
  const db = { state, transactions: [], failChildren: false, conflicts: 0 };
  const table = (name) => ({
    async findMany({ where, select, orderBy } = {}) {
      let rows = state[name].filter((row) => matches(row, where));
      if (orderBy && !Array.isArray(orderBy)) {
        const key = Object.keys(orderBy)[0];
        rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      }
      return rows.map((row) => select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });
    },
    async findFirst(args) { return (await this.findMany(args))[0] || null; },
    async findUniqueOrThrow(args) { const row = await this.findFirst(args); if (!row) throw new Error('记录不存在'); return row; },
    async count(args) { return (await this.findMany(args)).length; },
    async updateMany({ where, data }) {
      if (db.failChildren && where.parentTodoId) throw new Error('模拟子项写入失败');
      const rows = state[name].filter((row) => matches(row, where));
      for (const row of rows) Object.assign(row, data);
      return { count: rows.length };
    },
    async update({ where, data }) {
      await this.updateMany({ where, data });
      return this.findUniqueOrThrow({ where });
    },
  });
  db.todo = table('todos');
  db.task = table('tasks');
  db.$transaction = async (callback, options) => {
    db.transactions.push(options);
    if (db.conflicts-- > 0) throw new Prisma.PrismaClientKnownRequestError('模拟并发冲突', { code: 'P2034', clientVersion: '6' });
    const before = structuredClone(state);
    try { return await callback(db); }
    catch (error) { Object.assign(state, before); throw error; }
  };
  return db;
}
const service = (db) => new TodosService(db, {});

test('归档任务可识别一次性；缺失关联、缺失规则和其他用户均不推测类型', async () => {
  const db = database([], [task('once', []), task('repeat', [1]), task('foreign', [], 'u2'), { id: 'unknown', userId: 'u1', repeatRuleJson: {} }]);
  const result = await classifyTodos(db, ['once', 'repeat', 'foreign', 'unknown', 'missing'].map((id) => todo(id, id)));
  assert.deepEqual(result.map((item) => item.isOneTime), [true, false, false, false, false]);
});

test('积压一次性待办及全部子项移至当天，保留进度；完成、未来、删除、重复任务不移动', async () => {
  const rows = [
    todo('once', 't1', { todoDate: earlier, isExpired: true }),
    todo('child-done', 't1', { taskId: 't1:s1', parentTodoId: 'once', isSubTodo: true, status: 2, completedAt: 99n, todoDate: earlier }),
    todo('child-open', 't1', { taskId: 't1:s2', parentTodoId: 'once', isSubTodo: true, todoDate: earlier }),
    todo('done', 't2', { todoDate: yesterday, status: 2 }),
    todo('future', 't3', { todoDate: tomorrow }),
    todo('deleted', 't4', { todoDate: yesterday, isDeleted: true }),
    todo('repeat', 't5', { todoDate: yesterday }),
    todo('today', 't6'),
  ];
  const db = database(rows, ['t1', 't2', 't3', 't4', 't6'].map((id) => task(id, [])).concat(task('t5', [1])));
  const svc = service(db);
  assert.equal(await svc.deferUncompletedOneTimeTodos(today), 1);
  assert.equal(await svc.deferUncompletedOneTimeTodos(today), 0);
  for (const row of db.state.todos.slice(0, 3)) assert.equal(row.todoDate, today);
  assert.equal(db.state.todos[0].remark, '保留备注');
  assert.equal(db.state.todos[0].isExpired, false);
  assert.equal(db.state.todos[1].status, 2);
  assert.equal(db.state.todos[1].completedAt, 99n);
  assert.deepEqual(db.state.todos.slice(3), rows.slice(3));
  assert.equal(db.transactions[0].isolationLevel, 'Serializable');
  assert.equal(await svc.markExpiredBeforeDate(today), 1);
  assert.equal(db.state.todos.find((item) => item.id === 'repeat').isExpired, true);
});

test('事务失败不会只移动父项；并发冲突可重试，重试后仍只移动一次', async () => {
  const db = database([todo('p', 't', { todoDate: yesterday }), todo('c', 't', { taskId: 't:s', isSubTodo: true, parentTodoId: 'p', todoDate: yesterday })], [task('t', [])]);
  db.failChildren = true;
  await assert.rejects(service(db).deferUncompletedOneTimeTodos(today), /子项写入失败/);
  assert.equal(db.state.todos[0].todoDate, yesterday);
  db.failChildren = false;
  db.conflicts = 2;
  assert.equal(await service(db).deferUncompletedOneTimeTodos(today), 1);
  assert.equal(await service(db).deferUncompletedOneTimeTodos(today), 0);
});

test('列表保留一次性未完成项，但首页统计、月历、概览、趋势和通知均排除；重复任务仍计数', async () => {
  const db = database([todo('once', 't1'), todo('repeat', 't2'), todo('done', 't3', { status: 2 })], [task('t1', []), task('t2', [1]), task('t3', [])]);
  const list = await service(db).listTodos('u1', { date: today });
  assert.equal(list.list.length, 3);
  assert.equal(list.list.find((item) => item._id === 'once').isOneTime, true);
  assert.deepEqual([list.total, list.completedCount, list.uncompletedCount], [2, 1, 1]);
  const day = (await new CalendarService(db).getMonthCalendar('u1', today.slice(0, 7))).days.find((item) => item.date === today);
  assert.deepEqual([day.total, day.completedCount, day.uncompletedCount, day.status], [2, 1, 1, 'today_uncompleted']);
  const stats = new StatsService(db);
  assert.deepEqual((await stats.getOverview('u1')).today, { total: 2, completed: 1, completionRate: 50 });
  assert.equal((await stats.getTrend('u1')).days.at(-1).total, 2);
  const notice = new NotificationsService(db);
  const daily = await notice.buildDailySummary('u1', today);
  assert.deepEqual([daily.total, daily.completedCount, daily.uncompletedCount, daily.completionRate], [2, 1, 1, 50]);
  const onlyOnceDb = database([todo('once', 't1')], [task('t1', [])]);
  const neutral = (await new CalendarService(onlyOnceDb).getMonthCalendar('u1', today.slice(0, 7))).days.find((item) => item.date === today);
  assert.equal(neutral.status, 'no_todo');
  assert.equal((await new StatsService(onlyOnceDb).getStreak('u1')).current, 1);
});

test('周报与任务统计排除未完成一次性待办，完成后正常计入', async () => {
  const { lastWeekRange } = require('../dist/common/utils/domain-utils');
  const date = lastWeekRange(today).start;
  const db = database([todo('open', 't1', { todoDate: date }), todo('done', 't1', { todoDate: date, status: 2 })], [{ ...task('t1', []), isDeleted: false, title: '测试' }]);
  const weekly = await new NotificationsService(db).buildWeeklySummary('u1', today);
  assert.deepEqual([weekly.total, weekly.completedCount, weekly.uncompletedCount, weekly.completionRate], [1, 1, 0, 100]);
  const stats = await new TasksService(db).getTaskStats('u1', 't1');
  assert.equal(stats.all.totalTodos, 1);
  assert.equal(stats.all.uncompletedTodos, 0);
  await assert.rejects(new TasksService(db).getTaskStats('u2', 't1'), /任务不存在/);
});

test('直接完成与最后一个子项完成时归至完成当天，撤销完成后不标记失效', async () => {
  const db = database([todo('p', 't', { todoDate: yesterday })], [task('t', [])]);
  const completed = await service(db).setTodoStatus('u1', 'p', 2);
  assert.equal(completed.todoDate, today);
  assert.equal(completed.isOneTime, true);
  assert.equal(await service(db).deferUncompletedOneTimeTodos(tomorrow), 0);
  await assert.rejects(service(db).setTodoStatus('u2', 'p', 1), /待办不存在/);
  await assert.rejects(service(db).setTodoStatus('u1', 'p', 8), /状态不合法/);
  db.state.todos[0].todoDate = yesterday;
  const reopened = await service(db).setTodoStatus('u1', 'p', 1);
  assert.equal(reopened.isExpired, false);
  const family = database([todo('p', 't', { todoDate: yesterday }), todo('c', 't', { taskId: 't:s', parentTodoId: 'p', isSubTodo: true, todoDate: yesterday })], [task('t', [])]);
  await assert.rejects(service(family).setTodoStatus('u1', 'p', 2), /请先完成子待办/);
  await service(family).setTodoStatus('u1', 'c', 2);
  assert.equal(family.state.todos[0].status, 2);
  assert.ok(family.state.todos.every((item) => item.todoDate === today));
});

test('日切先顺延再处理过期与生成，返回顺延数量', async () => {
  const calls = [];
  const todos = {
    deferUncompletedOneTimeTodos: async () => { calls.push('顺延'); return 2; },
    markExpiredBeforeDate: async () => { calls.push('过期'); return 3; },
    shouldTaskGenerateOnDate: () => true,
    ensureTodoForTaskDate: async () => { calls.push('生成'); return { created: true }; },
  };
  const internal = new InternalService({}, { getActiveTasksForDate: async () => [{}] }, todos, {});
  assert.deepEqual(await internal.dailyRollover(), { oneTimeDeferred: 2, todoGenerated: 1, expiredMarked: 3 });
  assert.deepEqual(calls, ['顺延', '过期', '生成']);
});

test('已完成的一次性待办重复提交完成不会移动历史日期或重写完成时间', async () => {
  const db = database([todo('done', 't', { status: 2, todoDate: earlier, completedAt: 123n })], [task('t', [])]);
  const result = await service(db).setTodoStatus('u1', 'done', 2);
  assert.equal(result.todoDate, earlier);
  assert.equal(result.completedAt, 123);
});

test('父项顺延前已完成时不再移动；未完成项次日继续顺延，编辑返回保留类型', async () => {
  const db = database([todo('p', 't', { todoDate: yesterday })], [task('t', [])]);
  const svc = service(db);
  assert.equal(await svc.deferUncompletedOneTimeTodos(today), 1);
  assert.equal(await svc.deferUncompletedOneTimeTodos(tomorrow), 1);
  const edited = await svc.updateTodo('u1', 'p', { title: '更新标题', remark: '更新备注' });
  assert.equal(edited.isOneTime, true);
  assert.equal(edited.isExpired, false);
  const originalTransaction = db.$transaction;
  db.$transaction = (...args) => {
    db.state.todos[0].status = 2;
    return originalTransaction(...args);
  };
  assert.equal(await svc.deferUncompletedOneTimeTodos(offsetDateStr(tomorrow, 1)), 0);
  assert.equal(db.state.todos[0].todoDate, tomorrow);
});

test('页面即时勾选与服务端统计一致，一次性待办重新未完成时不标红', () => {
  const filename = path.resolve(__dirname, '../../miniprogram/pages/index/index.js');
  const context = { require: createRequire(filename), Page() {}, console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filename, 'utf8') + '\nthis.helpers = {buildTodoViewState, applyOptimisticTodoStatus, applyTodoStatusSnapshot};', context);
  const { buildTodoViewState, applyOptimisticTodoStatus, applyTodoStatusSnapshot } = context.helpers;
  const row = { _id: 'once', status: 1, isOneTime: true, todoDate: today };
  const neutral = buildTodoViewState([row], {}, today, today);
  assert.equal(neutral.todos.length, 1);
  assert.equal(neutral.total, 0);
  assert.equal(neutral.selectedDayStatus, 'no_todo');
  const optimistic = applyOptimisticTodoStatus([row], 'once', 2, today);
  const done = buildTodoViewState(optimistic.nextList, {}, today, today);
  assert.equal(done.progressPercent, 100);
  assert.equal(done.selectedDayStatus, 'completed');
  assert.equal(applyTodoStatusSnapshot({ ...row, todoDate: yesterday }, 1, 1, today).isExpired, false);
  const mixed = buildTodoViewState([row, { _id: 'repeat', status: 1 }], {}, today, today);
  assert.equal(mixed.uncompletedCount, 1);
  assert.equal(mixed.selectedDayStatus, 'today_uncompleted');
});
