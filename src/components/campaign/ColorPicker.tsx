import { useState, useRef, useEffect } from "react";
import { Pipette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
}

const presetColors = [
  "#FF6B35", "#E53935", "#D81B60", "#8E24AA", "#5E35B1",
  "#3949AB", "#1E88E5", "#039BE5", "#00ACC1", "#00897B",
  "#43A047", "#7CB342", "#C0CA33", "#FDD835", "#FFB300",
  "#FB8C00", "#F4511E", "#6D4C41", "#757575", "#546E7A",
  "#004E89", "#2D3748", "#1A202C", "#000000", "#FFFFFF"
];

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [inputValue, setInputValue] = useState(color);
  const [isOpen, setIsOpen] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(color);
  }, [color]);

  const handleHexChange = (value: string) => {
    setInputValue(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    }
  };

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setInputValue(newColor);
    onChange(newColor);
  };

  const handlePresetClick = (presetColor: string) => {
    setInputValue(presetColor);
    onChange(presetColor);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className="w-full flex items-center gap-3 p-2 rounded-lg border border-border hover:border-primary transition-colors bg-card"
          >
            <div 
              className="w-10 h-10 rounded-lg border-2 border-white shadow-md flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{color.toUpperCase()}</p>
              <p className="text-xs text-muted-foreground">Click to change</p>
            </div>
            <Pipette className="w-4 h-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            {/* Native color picker */}
            <div className="flex items-center gap-2">
              <div 
                className="w-10 h-10 rounded-lg border cursor-pointer overflow-hidden"
                onClick={() => colorInputRef.current?.click()}
              >
                <input
                  ref={colorInputRef}
                  type="color"
                  value={color}
                  onChange={handleColorInputChange}
                  className="w-14 h-14 -m-2 cursor-pointer"
                />
              </div>
              <Input
                value={inputValue}
                onChange={(e) => handleHexChange(e.target.value)}
                placeholder="#000000"
                className="flex-1 font-mono text-sm"
                maxLength={7}
              />
            </div>
            
            {/* Preset colors */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Preset Colors</p>
              <div className="grid grid-cols-5 gap-1.5">
                {presetColors.map((presetColor) => (
                  <button
                    key={presetColor}
                    onClick={() => handlePresetClick(presetColor)}
                    className={`w-8 h-8 rounded-md border-2 transition-transform hover:scale-110 ${
                      color.toLowerCase() === presetColor.toLowerCase() 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-white shadow-sm'
                    }`}
                    style={{ backgroundColor: presetColor }}
                    title={presetColor}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}