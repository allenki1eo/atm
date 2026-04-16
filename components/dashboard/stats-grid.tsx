import { Users, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  change?: string;
}

interface StatsGridProps {
  stats: Stat[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-bold">{stat.value}</p>
                {stat.change && (
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.change}</p>
                )}
              </div>
              <div className={cn("rounded-lg p-2", stat.bgColor)}>
                <stat.icon className={cn("h-5 w-5", stat.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export const defaultStats = {
  totalEmployees: (count: number): Stat => ({
    label: "Total Employees",
    value: count,
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  }),
  present: (count: number, total: number): Stat => ({
    label: "Present Today",
    value: count,
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    change: total > 0 ? `${Math.round((count / total) * 100)}% attendance` : undefined,
  }),
  late: (count: number): Stat => ({
    label: "Late Today",
    value: count,
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  }),
  absent: (count: number): Stat => ({
    label: "Absent Today",
    value: count,
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
  }),
};
