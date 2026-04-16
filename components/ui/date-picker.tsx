"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { CalendarPlus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: string | null;
  onChange: (date: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  modal?: boolean;
}

export function DatePicker({
  value,
  onChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  placeholder: _placeholder,
  disabled = false,
  className,
  modal,
}: DatePickerProps) {
  const t = useTranslations("datePicker");
  const [open, setOpen] = React.useState(false);
  const date = value ? new Date(value) : undefined;

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      // ISO string形式で保存（YYYY-MM-DD形式）
      const isoString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      onChange(isoString);
    } else {
      onChange(null);
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={disabled}
          className={cn(
            "group/datepicker relative w-auto min-w-[100px] justify-start text-left font-normal h-6 text-xs flex items-center",
            !date && "text-gray-300 hover:text-gray-500",
            className
          )}
        >
          {date ? (
            <>
              <span>{format(date, "yyyy/MM/dd")}</span>
              <span
                role="button"
                onClick={handleClear}
                className="absolute -top-1 -right-1 opacity-0 group-hover/datepicker:opacity-100 h-4 w-4 flex items-center justify-center rounded-full bg-gray-500 text-white text-[10px] hover:bg-gray-600 transition-all z-10 cursor-pointer"
                title={t("clearDate")}
              >
                ×
              </span>
            </>
          ) : (
            <span className="flex items-center justify-center w-full"><CalendarPlus className="w-4 h-4" /></span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="end"
        side="bottom"
        sideOffset={4}
        collisionPadding={16}
        avoidCollisions={true}
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}



