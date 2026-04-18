import { useState } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TimeSlotDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (time: string) => void;
  targetDate: Date | null;
  currentTime: string;
}

export function TimeSlotDialog({
  open,
  onClose,
  onConfirm,
  targetDate,
  currentTime,
}: TimeSlotDialogProps) {
  const [selectedTime, setSelectedTime] = useState(currentTime);

  const handleConfirm = () => {
    onConfirm(selectedTime);
  };

  const quickTimes = [
    { label: "9:00 AM", value: "09:00" },
    { label: "12:00 PM", value: "12:00" },
    { label: "3:00 PM", value: "15:00" },
    { label: "6:00 PM", value: "18:00" },
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Select Time for {targetDate ? format(targetDate, "MMMM d, yyyy") : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="time">Time</Label>
            <Input
              id="time"
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Quick Select</Label>
            <div className="grid grid-cols-4 gap-2">
              {quickTimes.map((qt) => (
                <Button
                  key={qt.value}
                  variant={selectedTime === qt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedTime(qt.value)}
                  className="text-xs"
                >
                  {qt.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
