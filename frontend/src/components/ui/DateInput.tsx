import React, { useEffect, useMemo, useRef, useState } from 'react';

type DateInputProps = {
    id?: string;
    value?: string | Date | null;
    onChange?: (value: string) => void;
    className?: string;
    placeholder?: string;
    autoFocus?: boolean;
    required?: boolean;
    min?: string;
    max?: string;
};

const toDateOnlyString = (input: string | Date | null | undefined): string => {
    if (!input) return '';
    try {
        const d = typeof input === 'string' ? new Date(input) : input;
        if (Number.isNaN(d.getTime())) return '';
        const iso = new Date(
            Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
        ).toISOString();
        return iso.split('T')[0];
    } catch {
        return '';
    }
};

const fromYmd = (ymd: string): Date => {
    const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
};

const isWithinBounds = (ymd: string, min?: string, max?: string): boolean => {
    if (min && ymd < min) return false;
    if (max && ymd > max) return false;
    return true;
};

const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DateInput: React.FC<DateInputProps> = ({
    id,
    value,
    onChange,
    className = '',
    placeholder = 'YYYY-MM-DD',
    autoFocus = false,
    required = false,
    min,
    max,
}) => {
    const todayYmd = useMemo(() => toDateOnlyString(new Date()), []);
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState<string>(
        toDateOnlyString(value)
    );
    const [viewMonth, setViewMonth] = useState<number>(() =>
        inputValue ? fromYmd(inputValue).getMonth() : new Date().getMonth()
    );
    const [viewYear, setViewYear] = useState<number>(() =>
        inputValue
            ? fromYmd(inputValue).getFullYear()
            : new Date().getFullYear()
    );
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setInputValue(toDateOnlyString(value));
    }, [value]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const daysInMonth = (year: number, month: number) =>
        new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) =>
        new Date(year, month, 1).getDay();

    const navigateMonth = (delta: number) => {
        let m = viewMonth + delta;
        let y = viewYear;
        if (m < 0) {
            m = 11;
            y -= 1;
        } else if (m > 11) {
            m = 0;
            y += 1;
        }
        setViewMonth(m);
        setViewYear(y);
    };

    const selectDate = (ymd: string) => {
        if (!isWithinBounds(ymd, min, max)) return;
        setInputValue(ymd);
        onChange?.(ymd);
        setOpen(false);
    };

    const onInputBlurCommit = () => {
        if (!inputValue) return;
        // basic validation YYYY-MM-DD
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(inputValue);
        if (!ok) {
            setInputValue(toDateOnlyString(value));
            return;
        }
        if (!isWithinBounds(inputValue, min, max)) {
            setInputValue(toDateOnlyString(value));
            return;
        }
        onChange?.(inputValue);
        const d = fromYmd(inputValue);
        setViewMonth(d.getMonth());
        setViewYear(d.getFullYear());
    };

    const renderCalendar = () => {
        const totalDays = daysInMonth(viewYear, viewMonth);
        const startOffset = firstDayOfMonth(viewYear, viewMonth);
        const cells: Array<{
            label: string;
            ymd?: string;
            disabled?: boolean;
        }> = [];
        for (let i = 0; i < startOffset; i += 1) {
            cells.push({ label: '' });
        }
        for (let day = 1; day <= totalDays; day += 1) {
            const ymd = toDateOnlyString(new Date(viewYear, viewMonth, day));
            const disabled = !isWithinBounds(ymd, min, max);
            cells.push({ label: String(day), ymd, disabled });
        }
        return (
            <div className="absolute z-20 mt-1 w-72 rounded-md border bg-white shadow-lg p-3">
                <div className="flex items-center justify-between mb-2">
                    <button
                        type="button"
                        className="px-2 py-1 rounded hover:bg-gray-100"
                        onClick={() => navigateMonth(-1)}
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <div className="text-sm font-medium">
                        {new Date(viewYear, viewMonth, 1).toLocaleString(
                            undefined,
                            { month: 'long', year: 'numeric' }
                        )}
                    </div>
                    <button
                        type="button"
                        className="px-2 py-1 rounded hover:bg-gray-100"
                        onClick={() => navigateMonth(1)}
                        aria-label="Next month"
                    >
                        ›
                    </button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-xs text-gray-500 mb-1">
                    {weekdays.map((w) => (
                        <div key={w} className="text-center">
                            {w}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-sm mb-3">
                    {cells.map((c, idx) => {
                        const isSelected = c.ymd && c.ymd === inputValue;
                        return (
                            <button
                                key={idx}
                                type="button"
                                disabled={!c.ymd || c.disabled}
                                onClick={() => c.ymd && selectDate(c.ymd)}
                                className={`h-8 rounded text-center ${!c.ymd ? 'cursor-default' : c.disabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-blue-50'} ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-600' : ''}`}
                            >
                                {c.label || ''}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center justify-between">
                    <div className="space-x-2">
                        <button
                            type="button"
                            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                            onClick={() => selectDate(todayYmd)}
                            disabled={!isWithinBounds(todayYmd, min, max)}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                            onClick={() => {
                                const ymd = toDateOnlyString(new Date());
                                setViewMonth(new Date().getMonth());
                                setViewYear(new Date().getFullYear());
                                setInputValue(ymd);
                                onChange?.(ymd);
                            }}
                        >
                            Set
                        </button>
                    </div>
                    <button
                        type="button"
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                        onClick={() => setOpen(false)}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div className="flex items-center space-x-2">
                <input
                    id={id}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onBlur={onInputBlurCommit}
                    placeholder={placeholder}
                    autoFocus={!!autoFocus}
                    required={!!required}
                    className="px-3 py-2 border rounded w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    inputMode="numeric"
                    pattern="\d{4}-\d{2}-\d{2}"
                />
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="px-2 py-2 border rounded hover:bg-gray-50"
                    aria-label="Open calendar"
                >
                    📅
                </button>
                <button
                    type="button"
                    onClick={() => selectDate(todayYmd)}
                    className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                    title="Set to today"
                >
                    Today
                </button>
            </div>
            {open && renderCalendar()}
        </div>
    );
};

export default DateInput;
