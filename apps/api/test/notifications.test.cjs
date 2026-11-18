const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
require('reflect-metadata');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
const { InternalService } = require('../dist/modules/internal/internal.service');
const { todayStr, lastWeekRange } = require('../dist/common/utils/domain-utils');

function fixture() {
  const logs = [];
  const settings = { id: 's', userId: 'u', dailyEnabled: true, weeklyEnabled: true, sendKey: '', feishuWebhook: 'https://example.invalid/hook' };
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' ? row[key] !== value.not : row[key] === value);
  const db = {
    notificationSetting: {
      findUnique: async () => settings,
      findMany: async ({ where }) => matches(settings, where) ? [settings] : [],
      update: async ({ data }) => Object.assign(settings, data),
    },
    notificationLog: {
      findFirst: async ({ where }) => logs.find(row => matches(row, where)) || null,
      create: async ({ data }) => { const row = { id: String(logs.length), ...data }; logs.push(row); return row; },
      update: async ({ where, data }) => Object.assign(logs.find(row => row.id === where.id), data),
    },
  };
  const svc = new NotificationsService(db);
  const stats = { total: 4, completedCount: 3, uncompletedCount: 1, completionRate: 75 };
  svc.buildDailySummary = async () => ({ date: todayStr(), ...stats });
  svc.buildWeeklySummary = async () => {
    const range = lastWeekRange(todayStr());
    return { startDate: range.start, endDate: range.end, ...stats };
  };
  const sent = [];
  svc.sendToFeishu = async (...args) => { sent.push(args); };
  return { svc, logs, sent, settings, db };
}

test('停用服务酱：旧配置不能开启提醒或测试发送，也不会成为自动发送候选人', async () => onMonday(async () => {
  const { svc, settings, logs, sent } = fixture();
  settings.sendKey = 'legacy-key';
  settings.feishuWebhook = '';
  await assert.rejects(svc.saveNotificationSettings('u', { dailyEnabled: true }), /飞书/);
  await assert.rejects(svc.sendTestNotification('u'), /飞书/);
  await assert.rejects(svc.sendWeeklyTestNotification('u'), /飞书/);
  for (const result of [await svc.runDailySummaryNotification(), await svc.runWeeklySummaryNotification()]) {
    assert.equal(result.totalCandidates, 0);
    assert.equal(result.successCount, 0);
  }
  assert.equal(logs.length, 0);
  assert.equal(sent.length, 0);
}));

test('只保存飞书配置，旧请求字段被忽略，响应不再返回服务酱字段，旧数据库值保留', async () => {
  const { svc, settings } = fixture();
  settings.sendKey = 'legacy-key';
  const result = await svc.saveNotificationSettings('u', { dailyEnabled: true, sendKey: 'ignored', feishuWebhook: ' https://example.invalid/new ' });
  assert.equal(settings.sendKey, 'legacy-key');
  assert.equal(settings.feishuWebhook, 'https://example.invalid/new');
  assert.equal(result.hasFeishuWebhook, true);
  assert.equal('hasSendKey' in result, false);
  assert.equal('sendKeyMasked' in result, false);
  assert.equal('sendKey' in result, false);
  const queried = await svc.getNotificationSettings('u');
  assert.equal('hasSendKey' in queried, false);
  await assert.rejects(svc.saveNotificationSettings('u', { feishuWebhook: '' }), /飞书/);
  const cleared = await svc.saveNotificationSettings('u', { dailyEnabled: false, weeklyEnabled: false, feishuWebhook: '' });
  assert.equal(cleared.hasFeishuWebhook, false);
  assert.equal(settings.sendKey, 'legacy-key');
});

test('首次保存仅写飞书配置，飞书与旧服务酱配置并存时只产生飞书记录', async () => onMonday(async () => {
  let created;
  const svc = new NotificationsService({ notificationSetting: {
    findUnique: async () => null,
    create: async ({ data }) => { created = data; return data; },
  } });
  await svc.saveNotificationSettings('u', { dailyEnabled: true, feishuWebhook: 'https://example.invalid/hook', sendKey: 'ignored' });
  assert.equal('sendKey' in created, false);
  const f = fixture();
  f.settings.sendKey = 'legacy-key';
  await f.svc.sendTestNotification('u');
  await f.svc.sendWeeklyTestNotification('u');
  await f.svc.runDailySummaryNotification();
  await f.svc.runWeeklySummaryNotification();
  assert.equal(f.sent.length, 4);
  assert.equal(f.logs.length, 4);
  assert.ok(f.logs.every(row => row.channel.startsWith('feishu_')));
  const preview = await f.svc.previewNotificationContent('u', {});
  assert.equal('aiUsed' in preview, false);
  assert.equal('aiFallbackReason' in preview, false);
  assert.equal(preview.title, '任务精灵：日报');
}));

test('提醒页保存飞书、清除配置、失败阻断测试；旧渠道字段不再提交', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  let definition;
  let payload;
  let failSave = false;
  let testCalls = 0;
  const api = {
    updateNotificationSettings: async value => {
      payload = value;
      if (failSave) throw new Error('模拟保存失败');
      return { dailyEnabled: value.dailyEnabled, weeklyEnabled: value.weeklyEnabled, hasFeishuWebhook: Boolean(value.feishuWebhook), feishuWebhookMasked: '已脱敏' };
    },
    testNotificationSend: async () => { testCalls++; },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/notification/index.js'), 'utf8'), {
    require: name => name.endsWith('/api') ? api : {}, Page: value => { definition = value; },
  });
  const page = { ...definition, data: structuredClone(definition.data), showPageToast() {}, setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.');
      if (parts.length === 2) this.data[parts[0]][parts[1]] = value;
      else this.data[key] = value;
    }
  } };
  page.onFeishuWebhookInput({ detail: { value: ' https://example.invalid/hook ' } });
  await page.saveSettings(false);
  assert.equal(payload.feishuWebhook, 'https://example.invalid/hook');
  assert.equal('sendKey' in payload, false);
  assert.equal(page.data.hasFeishuWebhook, true);
  assert.equal(page.data.form.feishuWebhook, '');
  assert.equal('feishuWebhook' in page.buildSavePayload(), false);
  page.onClearFeishuWebhook();
  assert.equal(page.buildSavePayload().feishuWebhook, '');
  await page.saveSettings(false);
  assert.equal(page.data.hasFeishuWebhook, false);
  assert.equal(page.data.pendingClearFeishuWebhook, false);
  failSave = true;
  await page.onTestDailySend();
  assert.equal(testCalls, 0);
  assert.equal(page.data.lastTestStatus, 'failed');
});

test('日报测试与正式记录隔离，旧测试不拦截，正式成功后测试也不会导致重发', async () => {
  const { svc, logs, sent } = fixture();
  logs.push({ id: 'old', userId: 'u', summaryDate: todayStr(), channel: 'feishu_daily_2200', status: 'success', source: 'manual_test_daily', attemptCount: 1 });
  await svc.sendTestNotification('u');
  assert.equal((await svc.runDailySummaryNotification()).successCount, 1);
  const formal = { ...logs.find(row => row.channel === 'feishu_daily_2200') };
  await svc.sendTestNotification('u');
  assert.deepEqual(logs.find(row => row.channel === 'feishu_daily_2200'), formal);
  assert.equal((await svc.runDailySummaryNotification()).skippedCount, 1);
  assert.equal(sent.length, 3);
  assert.equal(sent[0][1], '任务精灵：日报（测试）');
  assert.equal(sent[1][1], '任务精灵：日报');
  assert.deepEqual(sent[1][2].split('\n').slice(1), ['任务数：4', '已完成：3', '未完成：1', '完成率：75%']);
});

// 固定北京时间周一，验证跨日时区及周报保护，不访问真实网络和数据库。
async function onMonday(run) {
  const RealDate = global.Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-23T01:00:00Z'])); }
    static now() { return new RealDate('2026-11-23T01:00:00Z').getTime(); }
  };
  try { await run(); } finally { global.Date = RealDate; }
}

test('周报测试隔离、正式去重，使用上周日期且四项统计独立成行', async () => onMonday(async () => {
  const { svc, logs, sent } = fixture();
  logs.push({ id: 'old', userId: 'u', summaryDate: lastWeekRange(todayStr()).end, channel: 'feishu_weekly_0900', status: 'success', source: 'manual_test_weekly', attemptCount: 1 });
  await svc.sendWeeklyTestNotification('u');
  assert.equal((await svc.runWeeklySummaryNotification()).successCount, 1);
  await svc.sendWeeklyTestNotification('u');
  assert.equal((await svc.runWeeklySummaryNotification()).skippedCount, 1);
  assert.equal(sent[1][1], '任务精灵：周报');
  assert.equal(sent[1][2], '日期：2026-11-16 至 2026-11-22\n任务数：4\n已完成：3\n未完成：1\n完成率：75%');
  assert.equal(logs.filter(row => !row.channel.endsWith('_test')).length, 1);
}));

test('日报正式失败不记成功，后续重跑可发送，测试失败不覆盖正式记录', async () => {
  const { svc, logs } = fixture();
  svc.sendToFeishu = async () => { throw new Error('模拟失败'); };
  assert.equal((await svc.runDailySummaryNotification()).failedCount, 1);
  assert.equal(logs[0].status, 'failed');
  svc.sendToFeishu = async () => {};
  assert.equal((await svc.runDailySummaryNotification()).successCount, 1);
  const formal = { ...logs[0] };
  svc.sendToFeishu = async () => { throw new Error('模拟失败'); };
  await assert.rejects(svc.sendTestNotification('u'));
  assert.deepEqual(logs[0], formal);
  assert.equal(logs[1].status, 'failed');
  assert.equal((await svc.runDailySummaryNotification()).skippedCount, 1);
});

test('周报先失败两次后成功，日志累计三次；持续失败最多三次', async () => onMonday(async () => {
  for (const eventuallySuccess of [true, false]) {
    const { svc, logs } = fixture();
    let attempts = 0;
    svc.sendToFeishu = async () => { if (++attempts < 3 || !eventuallySuccess) throw new Error('模拟失败'); };
    const result = await svc.runWeeklySummaryNotification();
    assert.equal(attempts, 3);
    assert.equal(result.successCount, eventuallySuccess ? 1 : 0);
    assert.equal(result.failedCount, eventuallySuccess ? 0 : 1);
    assert.equal(logs[0].attemptCount, 3);
    assert.equal(logs[0].status, eventuallySuccess ? 'success' : 'failed');
  }
}));

test('非周一自动周报跳过，手动测试失败只尝试一次', async () => {
  const { svc, sent } = fixture();
  const RealDate = global.Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-18T14:00:00Z'])); }
    static now() { return new RealDate('2026-11-18T14:00:00Z').getTime(); }
  };
  try {
    assert.equal((await svc.runWeeklySummaryNotification()).blockedReason, 'not_monday');
    assert.equal(sent.length, 0);
    let attempts = 0;
    svc.sendToFeishu = async () => { attempts++; throw new Error('模拟失败'); };
    await assert.rejects(svc.sendWeeklyTestNotification('u'));
    assert.equal(attempts, 1);
  } finally { global.Date = RealDate; }
});

test('定时任务绑定北京时间、日报22点和周一9点，并阻止同一定时任务重叠', async () => {
  for (const [method, cronTime] of [['scheduledDailySummaryNotification', '0 22 * * *'], ['scheduledWeeklySummaryNotification', '0 9 * * 1']]) {
    const metadata = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', InternalService.prototype[method]);
    assert.equal(metadata.cronTime, cronTime);
    assert.equal(metadata.timeZone, 'Asia/Shanghai');
    assert.equal(metadata.waitForCompletion, true);
  }
  const svc = new InternalService({}, {}, {}, { runDailySummaryNotification: async () => { throw new Error('模拟失败'); } });
  const errors = [];
  svc.logger = { log() {}, error(...args) { errors.push(args); } };
  await svc.scheduledDailySummaryNotification();
  assert.equal(errors.length, 1);
});

test('飞书发送卡片标题颜色正确、各项单独一行，并严格处理各种响应和超时', async () => {
  const originalRequest = https.request;
  try {
    for (const scenario of ['daily', 'weekly', 'legacy', 'http', 'invalid', 'business', 'null', 'timeout', 'aborted']) {
      let payload;
      https.request = (_options, callback) => {
        const req = new EventEmitter();
        req.write = body => { payload = JSON.parse(body); };
        req.setTimeout = (ms, fn) => { assert.equal(ms, 20000); req.timeout = fn; };
        req.destroy = error => req.emit('error', error);
        req.end = () => {
          if (scenario === 'timeout') return req.timeout();
          const res = new EventEmitter();
          res.statusCode = scenario === 'http' ? 500 : 200;
          callback(res);
          if (scenario === 'aborted') return res.emit('aborted');
          res.emit('data', scenario === 'invalid' ? '<html>' : scenario === 'null' ? 'null' : JSON.stringify(scenario === 'legacy' ? { StatusCode: 0 } : { code: scenario === 'business' ? 1 : 0 }));
          res.emit('end');
        };
        return req;
      };
      const svc = new NotificationsService({});
      const weekly = scenario === 'weekly';
      const title = weekly ? '任务精灵：周报' : '任务精灵：日报';
      const content = svc.buildDailyContent({ date: '2026-11-18', total: 4, completedCount: 3, uncompletedCount: 1, completionRate: 75 });
      const promise = svc.sendToFeishu('https://example.invalid/hook', title, content);
      if (['daily', 'weekly', 'legacy'].includes(scenario)) await promise;
      else await assert.rejects(promise);
      assert.equal(payload.msg_type, 'interactive');
      assert.equal(payload.card.header.title.content, title);
      assert.equal(payload.card.header.template, weekly ? 'purple' : 'blue');
      assert.deepEqual(payload.card.body.elements.map(element => element.text.content), content.split('\n'));
      assert.equal(payload.card.body.elements.length, 5);
    }
  } finally { https.request = originalRequest; }
});
