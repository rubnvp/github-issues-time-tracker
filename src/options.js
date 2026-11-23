const controls = document.getElementById('settings-controls');
const settingsSectionGroup = document.getElementById('settings-section');
const pipSection = document.getElementById('pip-section');
const focusGoalSection = document.getElementById('focus-goal-section');
const focusRemindersSection = document.getElementById('focus-reminders-section');
const workScheduleSection = document.getElementById('work-schedule-section');
const autoPipInput = document.getElementById('auto-pip');
const keepPipOpenInput = document.getElementById('keep-pip-open');
const focusReminderVisualInput = document.getElementById('focus-reminder-visual');
const focusReminderSoundInput = document.getElementById('focus-reminder-sound');
const focusReminderIntervalInput = document.getElementById('focus-reminder-interval');
const focusGoalEnabled = document.getElementById('focus-goal-enabled');
const focusGoalHours = document.getElementById('focus-goal-hours');
const copySource = document.getElementById('copy-source');
const copyTarget = document.getElementById('copy-target');
const copyButton = document.getElementById('copy-schedule');
const weeklySchedule = document.getElementById('weekly-schedule');
const weeklyTotal = document.getElementById('weekly-total');
const saveStatus = document.getElementById('save-status');

function setStatus(message) {
  saveStatus.textContent = message;
}

function showSettingsSection(section) {
  pipSection.hidden = section !== 'basic';
  focusGoalSection.hidden = section !== 'support';
  focusRemindersSection.hidden = section !== 'tracking';
  workScheduleSection.hidden = section !== 'tracking';
}

settingsSectionGroup.addEventListener('change', (event) => {
  showSettingsSection(event.target.value);
});

function addDayOptions(select, includeEmpty) {
  if (includeEmpty) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a day';
    select.appendChild(placeholder);
  }

  for (const day of Settings.DAYS) {
    const option = document.createElement('option');
    option.value = day.key;
    option.textContent = day.label;
    select.appendChild(option);
  }
}

addDayOptions(copySource, false);
addDayOptions(copyTarget, true);

function createIntervalRow(interval, index) {
  const row = document.createElement('div');
  row.className = 'options__interval';
  row.dataset.index = String(index);

  for (const [field, labelText] of [['start', 'From'], ['end', 'To']]) {
    const label = document.createElement('label');
    label.className = 'options__time-field';

    const labelTextEl = document.createElement('span');
    labelTextEl.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'time';
    input.value = interval[field];
    input.dataset.field = field;
    input.setAttribute('aria-label', labelText);

    label.append(labelTextEl, input);
    row.appendChild(label);
  }

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'options__remove-interval';
  removeButton.textContent = 'Remove';
  removeButton.setAttribute('aria-label', 'Remove this work interval');
  row.appendChild(removeButton);

  return row;
}

function renderSchedule(schedule) {
  weeklySchedule.replaceChildren();

  for (const day of Settings.DAYS) {
    const daySection = document.createElement('section');
    daySection.className = 'options__day';
    daySection.dataset.day = day.key;

    const header = document.createElement('div');
    header.className = 'options__day-header';

    const title = document.createElement('h3');
    title.textContent = day.label;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'options__add-interval';
    addButton.textContent = '+ Add hours';

    header.append(title, addButton);

    const intervals = document.createElement('div');
    intervals.className = 'options__intervals';
    schedule[day.key].forEach((interval, index) => {
      intervals.appendChild(createIntervalRow(interval, index));
    });

    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'options__day-empty';
    emptyMessage.textContent = 'No work hours';
    emptyMessage.hidden = schedule[day.key].length > 0;

    const dailyTotal = document.createElement('p');
    dailyTotal.className = 'options__day-total';

    daySection.append(header, intervals, emptyMessage, dailyTotal);
    weeklySchedule.appendChild(daySection);
  }

  updateScheduleTotals(schedule);
}

function formatScheduledMinutes(minutes) {
  if (minutes === null) return 'Check hours';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function updateScheduleTotals(schedule) {
  const { dailyMinutes, weeklyMinutes } = Settings.getScheduleTotals(schedule);
  for (const { key } of Settings.DAYS) {
    const total = weeklySchedule.querySelector(`[data-day="${key}"] .options__day-total`);
    total.textContent = `Daily total: ${formatScheduledMinutes(dailyMinutes[key])}`;
  }
  weeklyTotal.textContent = `Weekly total: ${formatScheduledMinutes(weeklyMinutes)}`;
}

function readScheduleFromForm() {
  const schedule = Object.fromEntries(Settings.DAYS.map(({ key }) => [key, []]));

  for (const day of Settings.DAYS) {
    const daySection = weeklySchedule.querySelector(`[data-day="${day.key}"]`);
    const rows = daySection.querySelectorAll('.options__interval');
    schedule[day.key] = [...rows].map((row) => ({
      start: row.querySelector('[data-field="start"]').value,
      end: row.querySelector('[data-field="end"]').value,
    }));
  }

  return schedule;
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

async function saveSchedule(schedule, successMessage = 'Saved') {
  const validationError = Settings.validateWeeklySchedule(schedule);
  if (validationError) {
    setStatus(validationError);
    return false;
  }

  setStatus('Saving…');
  try {
    await Settings.setWeeklySchedule(schedule);
    setStatus(successMessage);
    return true;
  } catch (error) {
    console.error('Unable to save work schedule', error);
    setStatus('Unable to save work schedule.');
    return false;
  }
}

function addInterval(dayKey) {
  const schedule = readScheduleFromForm();
  const intervals = schedule[dayKey];
  const previousEnd = intervals.at(-1)?.end;
  const start = previousEnd || '09:00';
  const startMinutes = timeToMinutes(start);
  if (startMinutes === null || startMinutes >= 23 * 60 + 59) {
    setStatus('No more same-day work time can be added after 23:59.');
    return;
  }

  const endMinutes = intervals.length === 0
    ? 17 * 60
    : Math.min(startMinutes + 60, 23 * 60 + 59);
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  intervals.push({ start, end });
  renderSchedule(schedule);
  saveSchedule(schedule);
}

weeklySchedule.addEventListener('click', (event) => {
  const daySection = event.target.closest('[data-day]');
  if (!daySection) return;

  if (event.target.closest('.options__add-interval')) {
    addInterval(daySection.dataset.day);
    return;
  }

  if (event.target.closest('.options__remove-interval')) {
    const schedule = readScheduleFromForm();
    const index = Number(event.target.closest('.options__interval').dataset.index);
    schedule[daySection.dataset.day].splice(index, 1);
    renderSchedule(schedule);
    saveSchedule(schedule);
  }
});

weeklySchedule.addEventListener('change', () => {
  const schedule = readScheduleFromForm();
  updateScheduleTotals(schedule);
  saveSchedule(schedule);
});

weeklySchedule.addEventListener('input', () => {
  updateScheduleTotals(readScheduleFromForm());
});

copyTarget.addEventListener('change', () => {
  copyButton.disabled = !copyTarget.value || copyTarget.value === copySource.value;
});

copySource.addEventListener('change', () => {
  copyButton.disabled = !copyTarget.value || copyTarget.value === copySource.value;
});

copyButton.addEventListener('click', () => {
  if (!copyTarget.value || copyTarget.value === copySource.value) return;

  const schedule = readScheduleFromForm();
  schedule[copyTarget.value] = schedule[copySource.value].map(interval => ({ ...interval }));
  renderSchedule(schedule);
  const targetDay = Settings.DAYS.find(({ key }) => key === copyTarget.value);
  saveSchedule(schedule, `${targetDay.label} schedule copied and saved.`);
});

autoPipInput.addEventListener('change', async () => {
  const previousValue = Settings.shouldOpenPip();
  autoPipInput.disabled = true;
  setStatus('Saving…');

  try {
    await Settings.setAutoPipEnabled(autoPipInput.checked);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save extension settings', error);
    autoPipInput.checked = previousValue;
    setStatus('Unable to save settings.');
  } finally {
    autoPipInput.disabled = false;
  }
});

keepPipOpenInput.addEventListener('change', async () => {
  keepPipOpenInput.disabled = true;
  setStatus('Saving…');
  try {
    await Settings.setKeepPipOpen(keepPipOpenInput.checked);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save PiP pause setting', error);
    keepPipOpenInput.checked = Settings.shouldKeepPipOpen();
    setStatus('Unable to save settings.');
  } finally {
    keepPipOpenInput.disabled = false;
  }
});

focusReminderVisualInput.addEventListener('change', async () => {
  focusReminderVisualInput.disabled = true;
  setStatus('Saving…');
  try {
    await Settings.setFocusReminderVisualEnabled(focusReminderVisualInput.checked);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save visual focus reminder setting', error);
    focusReminderVisualInput.checked = Settings.shouldShowFocusReminder();
    setStatus('Unable to save settings.');
  } finally {
    focusReminderVisualInput.disabled = false;
  }
});

focusReminderSoundInput.addEventListener('change', async () => {
  focusReminderSoundInput.disabled = true;
  setStatus('Saving…');
  try {
    await Settings.setFocusReminderSoundEnabled(focusReminderSoundInput.checked);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save focus reminder sound setting', error);
    focusReminderSoundInput.checked = Settings.shouldPlayFocusReminder();
    setStatus('Unable to save settings.');
  } finally {
    focusReminderSoundInput.disabled = false;
    focusReminderIntervalInput.disabled = !focusReminderSoundInput.checked;
  }
});

focusReminderIntervalInput.addEventListener('change', async () => {
  const minutes = focusReminderIntervalInput.valueAsNumber;
  if (!Number.isInteger(minutes) || minutes < 1 || !Number.isFinite(minutes * 60000)) {
    setStatus('Reminder interval must be a whole number of minutes, at least 1.');
    return;
  }

  focusReminderIntervalInput.disabled = true;
  setStatus('Saving…');
  try {
    await Settings.setFocusReminderIntervalMinutes(minutes);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save focus reminder interval', error);
    focusReminderIntervalInput.value = String(Settings.getFocusReminderIntervalMinutes());
    setStatus('Unable to save focus reminder interval.');
  } finally {
    focusReminderIntervalInput.disabled = !focusReminderSoundInput.checked;
  }
});

async function saveFocusGoal() {
  const enabled = focusGoalEnabled.checked;
  // Disabling must still work when an unfinished hours edit is invalid.
  const hours = enabled ? focusGoalHours.valueAsNumber : Settings.getFocusGoal().hours;
  focusGoalHours.disabled = !enabled;
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(hours * 3600000)) {
    setStatus('Focus goal must be a positive number of hours.');
    return;
  }

  focusGoalEnabled.disabled = true;
  focusGoalHours.disabled = true;
  setStatus('Saving…');
  try {
    await Settings.setFocusGoal({ enabled, hours });
    focusGoalHours.value = String(hours);
    setStatus('Saved');
  } catch (error) {
    console.error('Unable to save focus goal', error);
    const previousGoal = Settings.getFocusGoal();
    focusGoalEnabled.checked = previousGoal.enabled;
    focusGoalHours.value = String(previousGoal.hours);
    setStatus('Unable to save focus goal.');
  } finally {
    focusGoalEnabled.disabled = false;
    focusGoalHours.disabled = !focusGoalEnabled.checked;
  }
}

focusGoalEnabled.addEventListener('change', saveFocusGoal);
focusGoalHours.addEventListener('change', saveFocusGoal);

Settings.ready
  .then(() => {
    showSettingsSection('basic');
    autoPipInput.checked = Settings.shouldOpenPip();
    keepPipOpenInput.checked = Settings.shouldKeepPipOpen();
    focusReminderVisualInput.checked = Settings.shouldShowFocusReminder();
    focusReminderSoundInput.checked = Settings.shouldPlayFocusReminder();
    focusReminderIntervalInput.value = String(Settings.getFocusReminderIntervalMinutes());
    focusReminderIntervalInput.disabled = !focusReminderSoundInput.checked;
    const goal = Settings.getFocusGoal();
    focusGoalEnabled.checked = goal.enabled;
    focusGoalHours.value = String(goal.hours);
    focusGoalHours.disabled = !goal.enabled;
    renderSchedule(Settings.getWeeklySchedule());
    controls.disabled = false;
  })
  .catch((error) => {
    console.error('Unable to load extension settings', error);
    setStatus('Unable to load settings.');
  });
