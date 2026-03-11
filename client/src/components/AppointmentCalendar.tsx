import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────────

export type CalendarAppointment = {
  id: number;
  barberId: number;
  clientId: number;
  appointmentDate: Date | string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  serviceName: string | null;
  durationMinutes: number | null;
  barberName: string | null;
  clientName: string | null;
  guestName?: string | null;
  notes: string | null;
};

type Props = {
  appointments: CalendarAppointment[];
  barbers?: { id: number; name: string }[];
  onCreateClick?: (date: string, time: string, barberId?: number) => void;
  onAppointmentClick?: (appointment: CalendarAppointment) => void;
};

// ── Constants ──────────────────────────────────────────────────────────────────

// Calendar shows 8:00 – 21:00 in 30-min slots
const START_HOUR = 8;
const END_HOUR = 21;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES; // 26

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  pending:   { bg: "bg-yellow-50 dark:bg-yellow-900/30",  border: "border-yellow-400",  text: "text-yellow-800 dark:text-yellow-300" },
  confirmed: { bg: "bg-blue-50 dark:bg-blue-900/30",     border: "border-blue-400",     text: "text-blue-800 dark:text-blue-300"   },
  completed: { bg: "bg-green-50 dark:bg-green-900/30",   border: "border-green-500",    text: "text-green-800 dark:text-green-300" },
  cancelled: { bg: "bg-red-50 dark:bg-red-900/20",       border: "border-red-300",      text: "text-red-600 dark:text-red-400"    },
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date) {
  return date.toISOString().split("T")[0];
}

function timeToSlotIndex(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  return ((hours - START_HOUR) * 60 + minutes) / SLOT_MINUTES;
}

function slotToLabel(slot: number): string {
  const totalMin = START_HOUR * 60 + slot * SLOT_MINUTES;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotToTimeString(slot: number): string {
  return slotToLabel(slot);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AppointmentCalendar({
  appointments,
  barbers,
  onCreateClick,
  onAppointmentClick,
}: Props) {
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null);

  // Days shown in the current view
  const visibleDays = useMemo(() => {
    if (viewMode === "day") return [selectedDay];
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [viewMode, weekStart, selectedDay]);

  // Group appointments by date string → slot → list
  const apptMap = useMemo(() => {
    const map = new Map<string, Map<number, CalendarAppointment[]>>();
    for (const appt of appointments) {
      if (appt.status === "cancelled") continue;
      if (selectedBarberId && appt.barberId !== selectedBarberId) continue;
      const d = typeof appt.appointmentDate === "string"
        ? new Date(appt.appointmentDate)
        : appt.appointmentDate;
      const dateKey = toDateStr(d);
      const slotIdx = timeToSlotIndex(d);
      if (slotIdx < 0 || slotIdx >= TOTAL_SLOTS) continue;

      if (!map.has(dateKey)) map.set(dateKey, new Map());
      const slots = map.get(dateKey)!;
      if (!slots.has(slotIdx)) slots.set(slotIdx, []);
      slots.get(slotIdx)!.push(appt);
    }
    return map;
  }, [appointments, selectedBarberId]);

  // Navigation
  function prevPeriod() {
    if (viewMode === "week") {
      setWeekStart(prev => addDays(prev, -7));
    } else {
      setSelectedDay(prev => addDays(prev, -1));
    }
  }

  function nextPeriod() {
    if (viewMode === "week") {
      setWeekStart(prev => addDays(prev, 7));
    } else {
      setSelectedDay(prev => addDays(prev, 1));
    }
  }

  function goToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setWeekStart(getWeekStart(today));
    setSelectedDay(today);
  }

  const todayStr = toDateStr(new Date());

  // Title
  const periodTitle = useMemo(() => {
    if (viewMode === "day") {
      return selectedDay.toLocaleDateString("pt-BR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    }
    const end = addDays(weekStart, 6);
    const sameMonth = weekStart.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${weekStart.getDate()}–${end.getDate()} de ${weekStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
    }
    return `${weekStart.toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [viewMode, weekStart, selectedDay]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Hoje</Button>
          <button
            className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-accent transition-colors"
            onClick={prevPeriod}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-accent transition-colors"
            onClick={nextPeriod}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold capitalize">{periodTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Barber filter */}
          {barbers && barbers.length > 1 && (
            <select
              value={selectedBarberId ?? ""}
              onChange={e => setSelectedBarberId(e.target.value ? Number(e.target.value) : null)}
              className="text-xs border rounded-md px-2 py-1.5 bg-background"
            >
              <option value="">Todos os barbeiros</option>
              {barbers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            {(["week", "day"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {mode === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar grid ─────────────────────────────────────────────────────── */}
      <div className="border rounded-xl overflow-auto">
        <div
          className="grid min-w-[600px]"
          style={{
            gridTemplateColumns: `56px repeat(${visibleDays.length}, 1fr)`,
          }}
        >
          {/* ── Header row ──────────────────────────────────────────────────── */}
          {/* Time gutter header */}
          <div className="sticky top-0 z-20 border-b border-r bg-background h-12" />

          {/* Day headers */}
          {visibleDays.map((day) => {
            const dateStr = toDateStr(day);
            const isToday = dateStr === todayStr;
            const dayAppts = (() => {
              const slots = apptMap.get(dateStr);
              if (!slots) return 0;
              let count = 0;
              slots.forEach(arr => (count += arr.length));
              return count;
            })();

            return (
              <div
                key={dateStr}
                className={`sticky top-0 z-20 border-b border-r bg-background h-12 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/30 transition-colors ${
                  isToday ? "bg-primary/5" : ""
                }`}
                onClick={() => { setViewMode("day"); setSelectedDay(day); }}
              >
                <span className="text-[10px] text-muted-foreground uppercase">
                  {WEEK_DAYS[day.getDay()]}
                </span>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm font-bold leading-none ${
                      isToday
                        ? "h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs"
                        : ""
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayAppts > 0 && (
                    <span className="text-[9px] bg-primary/20 text-primary rounded-full px-1 py-0.5 font-medium">
                      {dayAppts}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* ── Time slot rows ───────────────────────────────────────────────── */}
          {Array.from({ length: TOTAL_SLOTS }, (_, slotIdx) => {
            const label = slotToLabel(slotIdx);
            const isHourMark = slotIdx % 2 === 0; // every even slot = top of hour

            return [
              // Time gutter cell
              <div
                key={`gutter-${slotIdx}`}
                className="border-b border-r flex items-start justify-end pr-2 pt-1"
                style={{ minHeight: "48px" }}
              >
                {isHourMark && (
                  <span className="text-[10px] text-muted-foreground select-none">{label}</span>
                )}
              </div>,

              // Day cells for this slot
              ...visibleDays.map((day) => {
                const dateStr = toDateStr(day);
                const isToday = dateStr === todayStr;
                const cellAppts = apptMap.get(dateStr)?.get(slotIdx) ?? [];

                return (
                  <div
                    key={`cell-${dateStr}-${slotIdx}`}
                    className={`border-b border-r relative group ${
                      isToday ? "bg-primary/[0.02]" : ""
                    } ${isHourMark ? "" : "border-b border-dashed border-border/40"}`}
                    style={{ minHeight: "48px" }}
                    onClick={() => {
                      if (onCreateClick && cellAppts.length === 0) {
                        onCreateClick(dateStr, slotToTimeString(slotIdx), selectedBarberId ?? undefined);
                      }
                    }}
                  >
                    {/* Quick-add hint on empty cell */}
                    {cellAppts.length === 0 && onCreateClick && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Plus className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                    )}

                    {/* Appointment blocks */}
                    {cellAppts.map((appt, i) => {
                      const colors = STATUS_COLORS[appt.status] ?? STATUS_COLORS.pending;
                      const dur = Number(appt.durationMinutes ?? 30);
                      const spans = Math.max(1, Math.ceil(dur / SLOT_MINUTES));
                      const widthPct = cellAppts.length > 1 ? `${Math.floor(100 / cellAppts.length)}%` : "calc(100% - 4px)";
                      const leftPct = cellAppts.length > 1 ? `${(100 / cellAppts.length) * i}%` : "2px";

                      return (
                        <div
                          key={appt.id}
                          className={`absolute top-0.5 rounded-md border-l-2 px-1.5 py-1 cursor-pointer overflow-hidden
                            transition-all duration-150 hover:z-10 hover:shadow-md
                            ${colors.bg} ${colors.border} ${colors.text}`}
                          style={{
                            left: leftPct,
                            width: widthPct,
                            height: `${spans * 48 - 4}px`,
                            zIndex: i + 1,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAppointmentClick?.(appt);
                          }}
                        >
                          <p className="text-[10px] font-bold leading-tight truncate">
                            {appt.clientName ?? appt.guestName ?? `Cliente #${appt.clientId}`}
                          </p>
                          {spans > 1 && (
                            <p className="text-[9px] opacity-70 truncate leading-tight mt-0.5">
                              {appt.serviceName ?? "—"}
                            </p>
                          )}
                          {spans > 2 && appt.barberName && (
                            <p className="text-[9px] opacity-60 truncate leading-tight">
                              {appt.barberName}
                            </p>
                          )}
                          {spans > 1 && (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <Clock className="h-2 w-2 opacity-50" />
                              <span className="text-[9px] opacity-60">{dur}min</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Conflict indicator */}
                    {cellAppts.length > 1 && (
                      <div className="absolute top-0.5 right-0.5 z-20 h-3.5 w-3.5 rounded-full bg-red-500 flex items-center justify-center">
                        <span className="text-[8px] text-white font-bold">{cellAppts.length}</span>
                      </div>
                    )}
                  </div>
                );
              }),
            ];
          })}
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(STATUS_LABELS).map(([status, label]) => {
          const colors = STATUS_COLORS[status];
          return (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-sm border-l-2 ${colors.bg} ${colors.border}`} />
              <span>{label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="h-3.5 w-3.5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">2</span>
          </div>
          <span>Conflito de horário</span>
        </div>
      </div>
    </div>
  );
}
