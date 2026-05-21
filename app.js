/* ==========================================================
   SCADA HMI DEMO — Интеллектуальное отопление частного дома
   Файл: app.js
   Назначение:
   - имитация датчиков и исполнительных устройств;
   - динамическая SPA-навигация;
   - графики Chart.js;
   - аварии, уведомления, журнал событий;
   - управление зонами, котлом и режимами.
   ========================================================== */

/* ---------- Утилиты ---------- */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomDelta(amplitude) {
  return (Math.random() - 0.5) * amplitude;
}

function formatTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ---------- Справочники режимов ---------- */

const modes = {
  comfort: {
    label: "Комфорт",
    shift: 0,
    description: "Поддержание стандартных уставок помещений"
  },
  economy: {
    label: "Экономия",
    shift: -3,
    description: "Снижение температуры при отсутствии жильцов"
  },
  night: {
    label: "Ночь",
    shift: -2,
    description: "Ночной режим с умеренным снижением температуры"
  },
  vacation: {
    label: "Отпуск",
    shift: -8,
    description: "Длительное отсутствие, минимальное энергопотребление"
  },
  antifreeze: {
    label: "Антифриз",
    shift: -15,
    description: "Защита здания и трубопроводов от замерзания"
  },
  manual: {
    label: "Ручной режим",
    shift: 0,
    description: "Оператор вручную изменяет уставки зон"
  }
};

/* ---------- Исходные данные тепловых зон ---------- */

const initialZones = [
  {
    id: 1,
    name: "Гостиная-кухня",
    area: 65,
    type: "радиаторы + тёплый пол",
    currentTemp: 21.2,
    baseSetpoint: 22,
    valve: 42,
    priority: 2,
    sensor: "DS18B20-01",
    actuator: "Реле контура Z1"
  },
  {
    id: 2,
    name: "Кабинет",
    area: 18,
    type: "радиатор",
    currentTemp: 20.5,
    baseSetpoint: 21,
    valve: 25,
    priority: 4,
    sensor: "DS18B20-02",
    actuator: "Реле контура Z2"
  },
  {
    id: 3,
    name: "Санузел и коридор",
    area: 35,
    type: "тёплый пол",
    currentTemp: 22.4,
    baseSetpoint: 24,
    valve: 70,
    priority: 1,
    sensor: "DS18B20-03",
    actuator: "Реле контура Z3"
  },
  {
    id: 4,
    name: "Котельная",
    area: 12,
    type: "радиатор",
    currentTemp: 18.2,
    baseSetpoint: 18,
    valve: 0,
    priority: 5,
    sensor: "DS18B20-04",
    actuator: "Реле контура Z4"
  },
  {
    id: 5,
    name: "Главная спальня",
    area: 20,
    type: "тёплый пол + радиатор",
    currentTemp: 20.1,
    baseSetpoint: 20,
    valve: 12,
    priority: 3,
    sensor: "DS18B20-05",
    actuator: "Реле контура Z5"
  },
  {
    id: 6,
    name: "Детская и спальни",
    area: 54,
    type: "тёплый пол",
    currentTemp: 20.8,
    baseSetpoint: 21,
    valve: 30,
    priority: 2,
    sensor: "DS18B20-06",
    actuator: "Реле контура Z6"
  },
  {
    id: 7,
    name: "Ванная и холл 2 этажа",
    area: 24,
    type: "тёплый пол",
    currentTemp: 22.1,
    baseSetpoint: 23,
    valve: 55,
    priority: 1,
    sensor: "DS18B20-07",
    actuator: "Реле контура Z7"
  }
];

/* ---------- Глобальное состояние симулятора ---------- */

const state = {
  running: true,
  mode: "comfort",

  zones: structuredClone(initialZones),

  outdoorTemp: -6.0,
  pressure: 1.45,
  supplyTemp: 54.0,
  returnTemp: 42.0,
  boilerPower: 48,

  mqttOnline: true,
  sensorFault: false,
  pressureFault: false,
  overheatFault: false,

  acknowledged: false,

  settings: {
    hysteresis: 0.5,
    minSupply: 35,
    maxSupply: 70,
    minPressure: 0.7,
    overheatLimit: 80
  },

  history: {
    labels: [],
    avgTemp: [],
    supplyTemp: [],
    outdoorTemp: [],
    pressure: [],
    boilerPower: [],
    zone1: [],
    zone3: [],
    zone6: []
  }
};

/* ---------- Расчётные функции ---------- */

function getZoneSetpoint(zone) {
  return clamp(zone.baseSetpoint + modes[state.mode].shift, 5, 27);
}

function hasCriticalAlarm() {
  return (
    state.sensorFault ||
    state.pressure < state.settings.minPressure ||
    state.overheatFault
  );
}

function hasAnyAlarm() {
  return hasCriticalAlarm() || !state.mqttOnline;
}

function hasHeatDemand() {
  return state.zones.some((zone) => zone.valve > 15);
}

function calculateWeatherSupplyTemp() {
  const outdoorMin = -25;
  const outdoorStop = 10;

  const raw =
    state.settings.maxSupply +
    ((state.outdoorTemp - outdoorMin) / (outdoorStop - outdoorMin)) *
      (state.settings.minSupply - state.settings.maxSupply);

  return clamp(raw, state.settings.minSupply, state.settings.maxSupply);
}

function calculateAverageZoneTemp() {
  const sum = state.zones.reduce((acc, zone) => acc + zone.currentTemp, 0);
  return sum / state.zones.length;
}

function calculateBoilerPower() {
  if (hasCriticalAlarm()) {
    return 0;
  }

  if (!hasHeatDemand()) {
    return 0;
  }

  const averageValve =
    state.zones.reduce((acc, zone) => acc + zone.valve, 0) / state.zones.length;

  return clamp(averageValve + 20, 20, 95);
}

/* ---------- Журнал событий и уведомления ---------- */

function addLog(message, level = "info") {
  const log = $("#eventLog");
  if (!log) return;

  const colorClass = {
    info: "text-slate-300",
    ok: "text-emerald-300",
    warning: "text-orange-300",
    alarm: "text-red-300",
    command: "text-cyan-300"
  }[level] || "text-slate-300";

  const row = document.createElement("div");
  row.className = colorClass;
  row.textContent = `[${formatTime()}] ${message}`;

  log.prepend(row);

  while (log.children.length > 80) {
    log.removeChild(log.lastChild);
  }
}

function showToast(message, type = "info") {
  const container = $("#toastContainer");
  if (!container) return;

  const palette = {
    info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
    ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    warning: "border-orange-400/40 bg-orange-400/10 text-orange-200",
    alarm: "border-red-400/40 bg-red-400/10 text-red-200"
  };

  const toast = document.createElement("div");
  toast.className = `
    min-w-[280px] rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-xl
    transition duration-300 ${palette[type] || palette.info}
  `;

  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="mt-1 h-2 w-2 rounded-full bg-current shadow-[0_0_14px_currentColor]"></div>
      <div>${message}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(16px)";
  }, 2800);

  setTimeout(() => {
    toast.remove();
  }, 3300);
}

/* ---------- SPA-навигация ---------- */

function initNavigation() {
  const navButtons = $$(".nav-item");
  const screens = $$(".screen");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.screenTarget;

      navButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      screens.forEach((screen) => screen.classList.remove("active"));

      const targetScreen = $(`#screen-${target}`);
      if (targetScreen) {
        targetScreen.classList.add("active");
      }

      addLog(`HMI: открыт экран "${button.textContent.trim()}"`, "command");
    });
  });
}

/* ---------- Рендер карточек зон ---------- */

function renderZones() {
  const grid = $("#zonesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  state.zones.forEach((zone) => {
    const setpoint = getZoneSetpoint(zone);
    const error = setpoint - zone.currentTemp;
    const heating = zone.valve > 12;

    const statusClass = heating
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : "border-slate-700 bg-slate-900 text-slate-400";

    const tempColor =
      Math.abs(error) <= 0.4
        ? "text-emerald-300"
        : error > 0
          ? "text-orange-300"
          : "text-blue-300";

    const card = document.createElement("article");
    card.className = "glass-panel rounded-3xl p-5 transition hover:border-cyan-400/40";

    card.innerHTML = `
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold text-white">${zone.name}</h3>
          <p class="mt-1 text-xs text-slate-400">
            ${zone.area} м² · ${zone.type}
          </p>
        </div>

        <span class="rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}">
          ${heating ? "Нагрев" : "Пауза"}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p class="text-xs text-slate-500">Температура</p>
          <p class="mt-1 text-xl font-bold ${tempColor}">
            ${zone.currentTemp.toFixed(1)} °C
          </p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p class="text-xs text-slate-500">Уставка</p>
          <p class="mt-1 text-xl font-bold text-white">
            ${setpoint.toFixed(1)} °C
          </p>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p class="text-xs text-slate-500">Клапан</p>
          <p class="mt-1 text-xl font-bold text-cyan-300">
            ${Math.round(zone.valve)}%
          </p>
        </div>
      </div>

      <div class="mt-4">
        <div class="mb-2 flex justify-between text-xs text-slate-400">
          <span>Открытие исполнительного контура</span>
          <span>${Math.round(zone.valve)}%</span>
        </div>

        <div class="h-3 rounded-full bg-slate-800">
          <div
            class="h-3 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all"
            style="width: ${zone.valve}%">
          </div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-2">
        <button
          class="zone-minus rounded-2xl border border-slate-700 px-3 py-2 text-sm transition hover:border-cyan-400 hover:text-cyan-300"
          data-zone-id="${zone.id}">
          −0.5 °C
        </button>

        <button
          class="zone-plus rounded-2xl border border-slate-700 px-3 py-2 text-sm transition hover:border-cyan-400 hover:text-cyan-300"
          data-zone-id="${zone.id}">
          +0.5 °C
        </button>
      </div>

      <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
        <p>Датчик: <span class="text-cyan-300">${zone.sensor}</span></p>
        <p>Исполнитель: <span class="text-emerald-300">${zone.actuator}</span></p>
        <p>Приоритет: <span class="text-orange-300">${zone.priority}</span></p>
      </div>
    `;

    grid.appendChild(card);
  });

  $$(".zone-minus").forEach((button) => {
    button.addEventListener("click", () => changeZoneSetpoint(button.dataset.zoneId, -0.5));
  });

  $$(".zone-plus").forEach((button) => {
    button.addEventListener("click", () => changeZoneSetpoint(button.dataset.zoneId, 0.5));
  });
}

function changeZoneSetpoint(zoneId, delta) {
  if (state.mode !== "manual") {
    showToast("Изменение уставок доступно только в ручном режиме", "warning");
    addLog("HMI: попытка изменить уставку вне ручного режима", "warning");
    return;
  }

  const zone = state.zones.find((item) => item.id === Number(zoneId));
  if (!zone) return;

  zone.baseSetpoint = clamp(zone.baseSetpoint + delta, 5, 27);

  renderZones();
  updateAllIndicators();

  const sign = delta > 0 ? "+" : "";
  addLog(`HMI: уставка зоны "${zone.name}" изменена на ${sign}${delta} °C`, "command");
  showToast(`Уставка зоны "${zone.name}" изменена`, "ok");
}

/* ---------- Расписание ---------- */

function renderScheduleTable() {
  const table = $("#scheduleTableBody");
  if (!table) return;

  table.innerHTML = "";

  state.zones.forEach((zone) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="px-4 py-3 font-semibold text-white">${zone.name}</td>
      <td class="px-4 py-3 text-slate-300">
        06:00–08:00 комфорт · 08:00–17:00 экономия · 17:00–23:00 комфорт
      </td>
      <td class="px-4 py-3 text-slate-300">
        08:00–23:00 комфорт · 23:00–08:00 ночь
      </td>
      <td class="px-4 py-3 text-cyan-300">
        ${Math.max(5, zone.baseSetpoint - 2).toFixed(1)} °C
      </td>
      <td class="px-4 py-3 text-orange-300">
        ${zone.priority}
      </td>
    `;

    table.appendChild(row);
  });
}

/* ---------- Chart.js ---------- */

let overviewChart = null;
let weatherCurveChart = null;
let zonesTrendChart = null;
let systemTrendChart = null;

function initCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 450
    },
    plugins: {
      legend: {
        labels: {
          color: "#CBD5E1"
        }
      },
      tooltip: {
        backgroundColor: "#020617",
        borderColor: "#334155",
        borderWidth: 1,
        titleColor: "#FFFFFF",
        bodyColor: "#CBD5E1"
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#94A3B8",
          maxTicksLimit: 8
        },
        grid: {
          color: "rgba(148, 163, 184, 0.08)"
        }
      },
      y: {
        ticks: {
          color: "#94A3B8"
        },
        grid: {
          color: "rgba(148, 163, 184, 0.08)"
        }
      }
    }
  };

  const overviewCanvas = $("#overviewChart");
  if (overviewCanvas) {
    overviewChart = new Chart(overviewCanvas, {
      type: "line",
      data: {
        labels: state.history.labels,
        datasets: [
          {
            label: "Средняя температура, °C",
            data: state.history.avgTemp,
            borderColor: "#22C55E",
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            borderWidth: 2,
            tension: 0.35,
            fill: true
          },
          {
            label: "Подача, °C",
            data: state.history.supplyTemp,
            borderColor: "#38BDF8",
            backgroundColor: "rgba(56, 189, 248, 0.08)",
            borderWidth: 2,
            tension: 0.35,
            fill: true
          },
          {
            label: "Наружная, °C",
            data: state.history.outdoorTemp,
            borderColor: "#F97316",
            backgroundColor: "rgba(249, 115, 22, 0.08)",
            borderWidth: 2,
            tension: 0.35,
            fill: true
          }
        ]
      },
      options: commonOptions
    });
  }

  const weatherCanvas = $("#weatherCurveChart");
  if (weatherCanvas) {
    const outdoorPoints = [-25, -20, -15, -10, -5, 0, 5, 10];
    const supplyPoints = outdoorPoints.map((temp) => {
      const savedOutdoor = state.outdoorTemp;
      state.outdoorTemp = temp;
      const supply = calculateWeatherSupplyTemp();
      state.outdoorTemp = savedOutdoor;
      return supply;
    });

    weatherCurveChart = new Chart(weatherCanvas, {
      type: "line",
      data: {
        labels: outdoorPoints.map((item) => `${item}°C`),
        datasets: [
          {
            label: "Температура подачи",
            data: supplyPoints,
            borderColor: "#38BDF8",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            borderWidth: 3,
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        ...commonOptions,
        maintainAspectRatio: false
      }
    });
  }

  const zonesCanvas = $("#zonesTrendChart");
  if (zonesCanvas) {
    zonesTrendChart = new Chart(zonesCanvas, {
      type: "line",
      data: {
        labels: state.history.labels,
        datasets: [
          {
            label: "Зона 1",
            data: state.history.zone1,
            borderColor: "#22C55E",
            borderWidth: 2,
            tension: 0.35
          },
          {
            label: "Зона 3",
            data: state.history.zone3,
            borderColor: "#38BDF8",
            borderWidth: 2,
            tension: 0.35
          },
          {
            label: "Зона 6",
            data: state.history.zone6,
            borderColor: "#F97316",
            borderWidth: 2,
            tension: 0.35
          }
        ]
      },
      options: commonOptions
    });
  }

  const systemCanvas = $("#systemTrendChart");
  if (systemCanvas) {
    systemTrendChart = new Chart(systemCanvas, {
      type: "line",
      data: {
        labels: state.history.labels,
        datasets: [
          {
            label: "Давление, бар",
            data: state.history.pressure,
            borderColor: "#22C55E",
            borderWidth: 2,
            tension: 0.35,
            yAxisID: "y"
          },
          {
            label: "Мощность котла, %",
            data: state.history.boilerPower,
            borderColor: "#F97316",
            borderWidth: 2,
            tension: 0.35,
            yAxisID: "y1"
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          x: commonOptions.scales.x,
          y: {
            type: "linear",
            position: "left",
            ticks: { color: "#94A3B8" },
            grid: { color: "rgba(148, 163, 184, 0.08)" }
          },
          y1: {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            ticks: { color: "#94A3B8" },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }
}

function pushHistoryPoint() {
  const label = formatTime();
  const avgTemp = calculateAverageZoneTemp();

  state.history.labels.push(label);
  state.history.avgTemp.push(Number(avgTemp.toFixed(2)));
  state.history.supplyTemp.push(Number(state.supplyTemp.toFixed(1)));
  state.history.outdoorTemp.push(Number(state.outdoorTemp.toFixed(1)));
  state.history.pressure.push(Number(state.pressure.toFixed(2)));
  state.history.boilerPower.push(Number(state.boilerPower.toFixed(0)));
  state.history.zone1.push(Number(state.zones[0].currentTemp.toFixed(2)));
  state.history.zone3.push(Number(state.zones[2].currentTemp.toFixed(2)));
  state.history.zone6.push(Number(state.zones[5].currentTemp.toFixed(2)));

  const maxPoints = 28;

  Object.keys(state.history).forEach((key) => {
    while (state.history[key].length > maxPoints) {
      state.history[key].shift();
    }
  });

  updateCharts();
}

function updateCharts() {
  [overviewChart, zonesTrendChart, systemTrendChart].forEach((chart) => {
    if (chart) chart.update("none");
  });
}

function updateWeatherCurveChart() {
  if (!weatherCurveChart) return;

  const outdoorPoints = [-25, -20, -15, -10, -5, 0, 5, 10];

  const supplyPoints = outdoorPoints.map((temp) => {
    const savedOutdoor = state.outdoorTemp;
    state.outdoorTemp = temp;
    const supply = calculateWeatherSupplyTemp();
    state.outdoorTemp = savedOutdoor;
    return supply;
  });

  weatherCurveChart.data.datasets[0].data = supplyPoints;
  weatherCurveChart.update();
}

/* ---------- Динамическая модель системы ---------- */

function updateThermalModel() {
  if (!state.running) return;

  state.supplyTemp = state.overheatFault
    ? clamp(state.supplyTemp + 2.5, 30, 95)
    : calculateWeatherSupplyTemp();

  state.outdoorTemp = clamp(state.outdoorTemp + randomDelta(0.18), -25, 10);

  if (state.pressureFault) {
    state.pressure = clamp(state.pressure - 0.035, 0.35, 2.2);
  } else {
    state.pressure = clamp(state.pressure + randomDelta(0.018), 0.8, 2.1);
  }

  state.zones.forEach((zone) => {
    const setpoint = getZoneSetpoint(zone);
    const error = setpoint - zone.currentTemp;

    let targetValve;

    if (hasCriticalAlarm()) {
      targetValve = 0;
    } else if (zone.type.includes("тёплый пол")) {
      if (zone.currentTemp < setpoint - state.settings.hysteresis) {
        targetValve = 100;
      } else if (zone.currentTemp > setpoint + state.settings.hysteresis) {
        targetValve = 0;
      } else {
        targetValve = zone.valve;
      }
    } else {
      targetValve = clamp(error * 36 + zone.valve * 0.35, 0, 100);
    }

    zone.valve += (targetValve - zone.valve) * 0.28;

    const heatGain = (zone.valve / 100) * (state.supplyTemp - 25) * 0.006;
    const heatLoss = (zone.currentTemp - state.outdoorTemp) * 0.0026;
    const noise = randomDelta(0.025);

    zone.currentTemp += heatGain - heatLoss + noise;

    if (state.sensorFault && zone.id === 1) {
      zone.currentTemp += 0.45;
    }

    zone.currentTemp = clamp(zone.currentTemp, 3, 32);
    zone.valve = clamp(zone.valve, 0, 100);
  });

  state.boilerPower = calculateBoilerPower();
  state.returnTemp = clamp(state.supplyTemp - 7 - state.boilerPower * 0.05 + randomDelta(0.4), 25, 65);

  updateAlarmsByLimits();
  updateAllIndicators();
  renderZones();
}

function updateAlarmsByLimits() {
  if (state.supplyTemp >= state.settings.overheatLimit) {
    state.overheatFault = true;
  }
}

/* ---------- Обновление элементов интерфейса ---------- */

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function setWidth(selector, percent) {
  const element = $(selector);
  if (element) {
    element.style.width = `${clamp(percent, 0, 100)}%`;
  }
}

function updateAllIndicators() {
  const avgTemp = calculateAverageZoneTemp();
  const critical = hasCriticalAlarm();
  const anyAlarm = hasAnyAlarm();
  const heatDemand = hasHeatDemand();

  setText("#currentTime", formatTime());

  setText("#avgTempValue", avgTemp.toFixed(1));
  setText("#outdoorTempValue", state.outdoorTemp.toFixed(1));
  setText("#boilerPowerValue", Math.round(state.boilerPower));
  setText("#pressureValue", state.pressure.toFixed(2));

  setText("#supplyTempValue", state.supplyTemp.toFixed(1));
  setText("#returnTempValue", state.returnTemp.toFixed(1));
  setText("#heatDemandValue", heatDemand && !critical ? "Активен" : "Нет");

  setText("#weatherSupplyValue", calculateWeatherSupplyTemp().toFixed(1));
  setText("#boilerPowerBarText", Math.round(state.boilerPower));

  setWidth("#supplyTempBar", (state.supplyTemp / 90) * 100);
  setWidth("#returnTempBar", (state.returnTemp / 90) * 100);
  setWidth("#boilerPowerBar", state.boilerPower);

  setText("#burnerState", state.boilerPower > 0 ? "Включена" : "Остановлена");
  setText("#antiCycleState", critical ? "Блокировка" : "Норма");
  setText("#radiatorPumpState", heatDemand && !critical ? "Работает" : "Остановлен");
  setText("#floorPumpState", heatDemand && !critical ? "Работает" : "Остановлен");

  const topStatus = $("#systemTopStatus");
  const overviewBadge = $("#overviewStatusBadge");

  if (topStatus) {
    topStatus.textContent = anyAlarm ? "Есть активные события" : "Система в норме";
  }

  if (overviewBadge) {
    overviewBadge.textContent = critical ? "Авария" : anyAlarm ? "Предупреждение" : "Норма";

    overviewBadge.className = critical
      ? "rounded-full border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-300"
      : anyAlarm
        ? "rounded-full border border-orange-400/40 bg-orange-400/10 px-4 py-2 text-sm font-semibold text-orange-300"
        : "rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300";
  }

  renderActiveAlarms();
}

function renderActiveAlarms() {
  const list = $("#activeAlarmsList");
  if (!list) return;

  const alarms = [];

  if (state.sensorFault) {
    alarms.push({
      title: "Отказ датчика температуры зоны 1",
      text: "Показания выходят за допустимый диапазон. Регулирование зоны заблокировано.",
      level: "critical"
    });
  }

  if (state.pressure < state.settings.minPressure) {
    alarms.push({
      title: "Низкое давление теплоносителя",
      text: `Текущее давление ${state.pressure.toFixed(2)} бар ниже порога ${state.settings.minPressure.toFixed(2)} бар.`,
      level: "critical"
    });
  }

  if (!state.mqttOnline) {
    alarms.push({
      title: "Потеря связи с MQTT-брокером",
      text: "Верхний уровень HMI не получает телеметрию. Локальная логика управления продолжает работу.",
      level: "warning"
    });
  }

  if (state.overheatFault) {
    alarms.push({
      title: "Перегрев подающего трубопровода",
      text: `Температура подачи превысила ${state.settings.overheatLimit} °C. Котёл заблокирован.`,
      level: "critical"
    });
  }

  list.innerHTML = "";

  if (alarms.length === 0) {
    list.innerHTML = `
      <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        Аварий нет. Система работает в штатном режиме.
      </div>
    `;
    return;
  }

  alarms.forEach((alarm) => {
    const critical = alarm.level === "critical";

    const item = document.createElement("div");
    item.className = critical
      ? "rounded-2xl border border-red-500/40 bg-red-500/10 p-4"
      : "rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4";

    item.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="mt-1 h-3 w-3 rounded-full ${critical ? "bg-red-400 text-red-400" : "bg-orange-400 text-orange-400"} shadow-[0_0_14px_currentColor]"></div>
        <div>
          <p class="font-bold ${critical ? "text-red-300" : "text-orange-300"}">${alarm.title}</p>
          <p class="mt-1 text-sm text-slate-300">${alarm.text}</p>
          <p class="mt-2 text-xs text-slate-500">
            Статус: ${state.acknowledged ? "квитировано оператором" : "ожидает квитирования"}
          </p>
        </div>
      </div>
    `;

    list.appendChild(item);
  });
}

/* ---------- Обработчики управления ---------- */

function initControls() {
  const modeSelect = $("#globalModeSelect");
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      state.mode = modeSelect.value;
      state.acknowledged = false;

      addLog(`HMI: выбран режим "${modes[state.mode].label}"`, "command");
      showToast(`Режим изменён: ${modes[state.mode].label}`, "ok");

      updateAllIndicators();
      renderZones();
    });
  }

  const simulationToggle = $("#simulationToggle");
  if (simulationToggle) {
    simulationToggle.addEventListener("click", () => {
      state.running = !state.running;
      simulationToggle.textContent = state.running ? "Пауза" : "Старт";

      addLog(state.running ? "SIM: симуляция продолжена" : "SIM: симуляция приостановлена", "command");
      showToast(state.running ? "Симуляция запущена" : "Симуляция остановлена", "info");
    });
  }

  const resetButton = $("#resetSimulation");
  if (resetButton) {
    resetButton.addEventListener("click", resetSimulation);
  }

  const sensorButton = $("#faultSensorButton");
  if (sensorButton) {
    sensorButton.addEventListener("click", () => {
      state.sensorFault = !state.sensorFault;
      state.acknowledged = false;

      addLog(
        state.sensorFault
          ? "ALARM: имитация отказа датчика температуры зоны 1"
          : "ALARM: отказ датчика зоны 1 устранён",
        state.sensorFault ? "alarm" : "ok"
      );

      showToast(
        state.sensorFault ? "Активирован отказ датчика" : "Отказ датчика устранён",
        state.sensorFault ? "alarm" : "ok"
      );

      updateAllIndicators();
    });
  }

  const pressureButton = $("#faultPressureButton");
  if (pressureButton) {
    pressureButton.addEventListener("click", () => {
      state.pressureFault = !state.pressureFault;
      state.acknowledged = false;

      if (!state.pressureFault) {
        state.pressure = 1.35;
      }

      addLog(
        state.pressureFault
          ? "TEST: включена имитация падения давления теплоносителя"
          : "TEST: давление восстановлено до штатного уровня",
        state.pressureFault ? "warning" : "ok"
      );

      showToast(
        state.pressureFault ? "Давление начало снижаться" : "Давление восстановлено",
        state.pressureFault ? "warning" : "ok"
      );

      updateAllIndicators();
    });
  }

  const mqttButton = $("#faultMqttButton");
  if (mqttButton) {
    mqttButton.addEventListener("click", () => {
      state.mqttOnline = !state.mqttOnline;
      state.acknowledged = false;

      addLog(
        state.mqttOnline
          ? "MQTT: соединение с брокером восстановлено"
          : "WARNING: потеря связи с MQTT-брокером",
        state.mqttOnline ? "ok" : "warning"
      );

      showToast(
        state.mqttOnline ? "MQTT-связь восстановлена" : "MQTT-связь потеряна",
        state.mqttOnline ? "ok" : "warning"
      );

      updateAllIndicators();
    });
  }

  const overheatButton = $("#faultOverheatButton");
  if (overheatButton) {
    overheatButton.addEventListener("click", () => {
      state.overheatFault = !state.overheatFault;
      state.acknowledged = false;

      if (!state.overheatFault) {
        state.supplyTemp = calculateWeatherSupplyTemp();
      }

      addLog(
        state.overheatFault
          ? "ALARM: имитация перегрева подающего трубопровода"
          : "ALARM: перегрев устранён, уставка подачи восстановлена",
        state.overheatFault ? "alarm" : "ok"
      );

      showToast(
        state.overheatFault ? "Активирован перегрев подачи" : "Перегрев устранён",
        state.overheatFault ? "alarm" : "ok"
      );

      updateAllIndicators();
    });
  }

  const ackButton = $("#ackAlarmsButton");
  if (ackButton) {
    ackButton.addEventListener("click", () => {
      state.acknowledged = true;
      addLog("HMI: оператор выполнил квитирование аварий", "command");
      showToast("Аварии квитированы оператором", "ok");
      renderActiveAlarms();
    });
  }

  const saveSettingsButton = $("#saveSettingsButton");
  if (saveSettingsButton) {
    saveSettingsButton.addEventListener("click", saveSettings);
  }
}

function saveSettings() {
  state.settings.hysteresis = safeNumber($("#hysteresisInput")?.value, 0.5);
  state.settings.minSupply = safeNumber($("#minSupplyInput")?.value, 35);
  state.settings.maxSupply = safeNumber($("#maxSupplyInput")?.value, 70);
  state.settings.minPressure = safeNumber($("#minPressureInput")?.value, 0.7);
  state.settings.overheatLimit = safeNumber($("#overheatInput")?.value, 80);

  state.settings.hysteresis = clamp(state.settings.hysteresis, 0.1, 3);
  state.settings.minSupply = clamp(state.settings.minSupply, 25, 50);
  state.settings.maxSupply = clamp(state.settings.maxSupply, 50, 90);
  state.settings.minPressure = clamp(state.settings.minPressure, 0.3, 1.5);
  state.settings.overheatLimit = clamp(state.settings.overheatLimit, 60, 95);

  if (state.settings.minSupply >= state.settings.maxSupply) {
    state.settings.minSupply = state.settings.maxSupply - 5;
  }

  updateWeatherCurveChart();
  updateAllIndicators();

  addLog("HMI: инженерные настройки алгоритмов сохранены", "command");
  showToast("Настройки сохранены", "ok");
}

/* ---------- Сброс симуляции ---------- */

function resetSimulation() {
  state.running = true;
  state.mode = "comfort";
  state.zones = structuredClone(initialZones);

  state.outdoorTemp = -6.0;
  state.pressure = 1.45;
  state.supplyTemp = 54.0;
  state.returnTemp = 42.0;
  state.boilerPower = 48;

  state.mqttOnline = true;
  state.sensorFault = false;
  state.pressureFault = false;
  state.overheatFault = false;
  state.acknowledged = false;

  state.history.labels.length = 0;
  state.history.avgTemp.length = 0;
  state.history.supplyTemp.length = 0;
  state.history.outdoorTemp.length = 0;
  state.history.pressure.length = 0;
  state.history.boilerPower.length = 0;
  state.history.zone1.length = 0;
  state.history.zone3.length = 0;
  state.history.zone6.length = 0;

  const modeSelect = $("#globalModeSelect");
  if (modeSelect) modeSelect.value = "comfort";

  const simulationToggle = $("#simulationToggle");
  if (simulationToggle) simulationToggle.textContent = "Пауза";

  for (let i = 0; i < 10; i++) {
    pushHistoryPoint();
  }

  renderZones();
  renderScheduleTable();
  updateAllIndicators();
  updateCharts();

  addLog("SIM: симуляция сброшена к исходному состоянию", "command");
  showToast("Симуляция сброшена", "ok");
}

/* ---------- Периодические процессы ---------- */

function startLoops() {
  setInterval(() => {
    setText("#currentTime", formatTime());
  }, 1000);

  setInterval(() => {
    updateThermalModel();
  }, 1200);

  setInterval(() => {
    if (!state.running) return;

    pushHistoryPoint();

    if (state.mqttOnline) {
      addLog(
        `MQTT telemetry: avg=${calculateAverageZoneTemp().toFixed(1)}°C, supply=${state.supplyTemp.toFixed(1)}°C, pressure=${state.pressure.toFixed(2)}bar`,
        "info"
      );
    } else {
      addLog("MQTT: пакет телеметрии не отправлен — соединение недоступно", "warning");
    }
  }, 4000);
}

/* ---------- Инициализация приложения ---------- */

function seedInitialHistory() {
  for (let i = 0; i < 12; i++) {
    state.history.labels.push(formatTime());
    state.history.avgTemp.push(Number((20.7 + randomDelta(0.4)).toFixed(2)));
    state.history.supplyTemp.push(Number((54 + randomDelta(1.5)).toFixed(1)));
    state.history.outdoorTemp.push(Number((-6 + randomDelta(0.6)).toFixed(1)));
    state.history.pressure.push(Number((1.45 + randomDelta(0.04)).toFixed(2)));
    state.history.boilerPower.push(Number((48 + randomDelta(8)).toFixed(0)));
    state.history.zone1.push(Number((21.2 + randomDelta(0.2)).toFixed(2)));
    state.history.zone3.push(Number((22.4 + randomDelta(0.2)).toFixed(2)));
    state.history.zone6.push(Number((20.8 + randomDelta(0.2)).toFixed(2)));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  seedInitialHistory();

  initNavigation();
  initControls();
  initCharts();

  renderZones();
  renderScheduleTable();
  updateAllIndicators();

  startLoops();

  addLog("SPA: веб-интерфейс HMI загружен", "ok");
  addLog("SCADA: активна модель 7 тепловых зон", "ok");
  addLog("CONTROL: погодозависимое регулирование включено", "ok");

  showToast("SCADA HMI запущен", "ok");

  if (window.lucide) {
    lucide.createIcons();
  }
});
