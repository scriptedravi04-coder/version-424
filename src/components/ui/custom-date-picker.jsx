import React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";

// v416: "YYYY-MM-DD" is read as a local day (new Date("2026-11-21") would be UTC midnight and can shift a day).
export function toPickerDate(value) {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// v416: light, readable popup (was white day text on a white calendar), closes after a pick,
// and `disablePast` greys out days before today. `value`/`onChange` kept as aliases for older callers.
export function CustomDatePicker({ date, setDate, value, onChange, placeholder = "Pick a date", className, disablePast = false }) {
  const [open, setOpen] = React.useState(false);
  const current = toPickerDate(date !== undefined ? date : value);
  const commit = setDate || onChange;
  const today = React.useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal bg-[var(--bg-elevated)] border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] text-[var(--text-primary)] rounded-xl py-6 px-4 font-mono",
            !current && "text-[var(--text-secondary)]",
            className
          )}
        >
          <CalendarIcon className="mr-3 h-4 w-4" aria-hidden="true" />
          {current ? format(current, "dd / MM / yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border border-gray-200 bg-white text-gray-900 rounded-2xl overflow-hidden shadow-xl" align="start">
        <Calendar
          mode="single"
          selected={current}
          defaultMonth={current || today}
          disabled={disablePast ? { before: today } : undefined}
          onSelect={(d) => {
            if (!d) return;
            commit?.(d.toISOString());
            setOpen(false); // v416: close as soon as a day is picked
          }}
          autoFocus
          className="p-4 bg-white text-gray-900 shadow-none rounded-2xl"
          classNames={{
            months: "flex flex-col sm:flex-row gap-4 relative",
            month: "space-y-3",
            month_caption: "flex justify-center items-center h-9",
            caption_label: "text-base font-semibold text-gray-900",
            nav: "absolute inset-x-0 top-0 flex items-center justify-between h-9 z-10",
            button_previous: "h-9 w-9 rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-40",
            button_next: "h-9 w-9 rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-40",
            chevron: "h-4 w-4 fill-current",
            month_grid: "w-full border-collapse",
            weekdays: "flex w-full",
            weekday: "text-gray-500 font-semibold text-[11px] uppercase tracking-wider w-10 flex items-center justify-center pb-1",
            week: "flex w-full mt-1 gap-0.5",
            day: "h-10 w-10 p-0 text-sm text-gray-900 rounded-full flex items-center justify-center",
            day_button: "h-10 w-10 rounded-full flex items-center justify-center hover:bg-[#F5F0FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C3AED] transition-colors",
            selected: "!bg-[#7C3AED] !text-white font-bold",
            today: "text-[#6D28D9] font-bold",
            outside: "text-gray-400",
            disabled: "text-gray-300 line-through pointer-events-none",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
