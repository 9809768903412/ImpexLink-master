import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const COUNTRY_CODES = [
  { value: '+63', label: 'PH +63' },
  { value: '+1', label: 'US +1' },
  { value: '+65', label: 'SG +65' },
  { value: '+971', label: 'AE +971' },
  { value: '+81', label: 'JP +81' },
  { value: '+82', label: 'KR +82' },
  { value: '+86', label: 'CN +86' },
  { value: '+61', label: 'AU +61' },
];

function splitPhone(value?: string) {
  const raw = String(value || '').trim();
  const matched = COUNTRY_CODES.find((option) => raw === option.value || raw.startsWith(`${option.value} `));
  const countryCode = matched?.value || '+63';
  const localNumber = matched ? raw.slice(countryCode.length).trim() : raw.replace(/^\+\d+\s*/, '').trim();
  return { countryCode, localNumber };
}

function formatPhone(countryCode: string, localNumber: string) {
  return `${countryCode} ${localNumber.replace(/^\+\d+\s*/, '').trim()}`.trim();
}

interface PhoneInputWithCountryProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PhoneInputWithCountry({
  value,
  onChange,
  placeholder = '917 123 4567',
  disabled,
}: PhoneInputWithCountryProps) {
  const { countryCode, localNumber } = splitPhone(value);

  return (
    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
      <Select
        value={countryCode}
        onValueChange={(nextCode) => onChange(formatPhone(nextCode, localNumber))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full sm:w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={localNumber}
        onChange={(event) => onChange(formatPhone(countryCode, event.target.value))}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
