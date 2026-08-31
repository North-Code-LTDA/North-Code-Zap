import { SchedulerService } from './server/scheduler';

const dummyInstanceManager: any = {
  get: () => null
};
const scheduler = new SchedulerService(dummyInstanceManager);

function assertEqual(actual: any, expected: any, msg: string) {
  if (actual !== expected) {
    console.error("FAIL: " + msg + " | Expected: " + expected + ", Got: " + actual);
    process.exit(1);
  }
  console.log("PASS: " + msg + " => " + actual);
}

function testMonthly() {
  const dummySchedule: any = {
    scheduleType: 'monthly',
    monthlyTimeSlots: [{ day: 15, times: ['08:00'] }],
  };

  const from1 = new Date(2027, 0, 31, 12, 0, 0, 0);
  const next1 = scheduler.calculateNextRunAt(dummySchedule, from1);
  const expected1 = new Date(2027, 1, 15, 8, 0, 0, 0).toISOString();
  assertEqual(next1, expected1, 'Monthly Jan 31 -> Feb 15');

  const dummySchedule2: any = {
    scheduleType: 'monthly',
    monthlyTimeSlots: [{ day: 31, times: ['08:00'] }],
  };
  const from2 = new Date(2027, 1, 1, 12, 0, 0, 0);
  const next2 = scheduler.calculateNextRunAt(dummySchedule2, from2);
  const expected2 = new Date(2027, 2, 31, 8, 0, 0, 0).toISOString();
  assertEqual(next2, expected2, 'Monthly Feb 1 -> Mar 31');

  const from3 = new Date(2027, 0, 10, 12, 0, 0, 0);
  const next3 = scheduler.calculateNextRunAt(dummySchedule, from3);
  const expected3 = new Date(2027, 0, 15, 8, 0, 0, 0).toISOString();
  assertEqual(next3, expected3, 'Monthly same-month (Jan 10 -> Jan 15)');
}

testMonthly();
