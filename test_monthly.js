const { scheduler } = require('./dist/server.js');

const monthlySchedule = {
  scheduleType: 'monthly',
  monthlyTimeSlots: [{ day: 15, times: ['08:00'] }],
  specificDateTimeSlots: [],
  dailyTimes: [],
  weeklyTimeSlots: [],
  scheduledAt: null
};

// 31/01/2027 12:00
const fromDate = new Date(2027, 0, 31, 12, 0, 0);

// We need to access calculateNextRunAt. Wait, it's private.
// We can just extract the logic.
const slots = monthlySchedule.monthlyTimeSlots;
const baseYear = fromDate.getFullYear();
const baseMonth = fromDate.getMonth();
let result = null;
const nowTime = fromDate.getTime();

for (let offset = 0; offset <= 24; offset++) {
  const absoluteMonth = baseMonth + offset;
  const year = baseYear + Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;

  for (const slotForDay of slots) {
    const targetDay = slotForDay.day;
    for (const timeStr of slotForDay.times) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const candidateRun = new Date(year, month, targetDay, hours, minutes, 0, 0);
      if (
        candidateRun.getFullYear() === year &&
        candidateRun.getMonth() === month &&
        candidateRun.getDate() === targetDay
      ) {
        if (candidateRun.getTime() > nowTime) {
          result = candidateRun.toISOString();
          break;
        }
      }
    }
    if (result) break;
  }
  if (result) break;
}

console.log('Test A (Jan31 -> Feb15):', result); // Expected Feb 15

// Test B: monthly day 31, fromDate Feb 01
const slots2 = [{ day: 31, times: ['08:00'] }];
const fromDate2 = new Date(2027, 1, 1, 12, 0, 0);
const baseYear2 = fromDate2.getFullYear();
const baseMonth2 = fromDate2.getMonth();
let result2 = null;
const nowTime2 = fromDate2.getTime();

for (let offset = 0; offset <= 24; offset++) {
  const absoluteMonth = baseMonth2 + offset;
  const year = baseYear2 + Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;

  for (const slotForDay of slots2) {
    const targetDay = slotForDay.day;
    for (const timeStr of slotForDay.times) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const candidateRun = new Date(year, month, targetDay, hours, minutes, 0, 0);
      if (
        candidateRun.getFullYear() === year &&
        candidateRun.getMonth() === month &&
        candidateRun.getDate() === targetDay
      ) {
        if (candidateRun.getTime() > nowTime2) {
          result2 = candidateRun.toISOString();
          break;
        }
      }
    }
    if (result2) break;
  }
  if (result2) break;
}

console.log('Test B (Feb01 -> Mar31):', result2); // Expected March 31
