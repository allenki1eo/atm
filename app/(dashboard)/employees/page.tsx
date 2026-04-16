"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department: string;
  supervisor_id: string;
  daily_rate: number;
  monthly_salary: number;
  overtime_rule: string;
  active: number;
}

const employeeSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(7, "Valid phone required"),
  type: z.enum(["casual", "fulltime"]),
  department: z.string().optional(),
  supervisor_id: z.string().optional(),
  daily_rate: z.number().min(0).optional(),
  monthly_salary: z.number().min(0).optional(),
  overtime_rule: z.enum(["all_days", "holidays_only", "none"]).optional(),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: supervisors } = useQuery({
    queryKey: ["users", "supervisors"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { type: "casual", overtime_rule: "none" },
  });

  const type = watch("type");

  const createMutation = useMutation({
    mutationFn: async (data: EmployeeForm) => {
      const res = await fetch("/api/employees", {
        method: editingEmployee ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingEmployee ? { ...data, id: editingEmployee.id } : data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
      setEditingEmployee(null);
      reset();
      toast({ title: editingEmployee ? "Employee updated" : "Employee created" });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    reset({
      name: emp.name,
      phone: emp.phone,
      type: emp.type,
      department: emp.department,
      supervisor_id: emp.supervisor_id,
      daily_rate: emp.daily_rate,
      monthly_salary: emp.monthly_salary,
      overtime_rule: emp.overtime_rule as "all_days" | "holidays_only" | "none",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingEmployee(null);
    reset({ type: "casual", overtime_rule: "none" });
    setDialogOpen(true);
  };

  const filtered = (employees ?? []).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search)
  );

  const onSubmit = (data: EmployeeForm) => {
    const payload = {
      ...data,
      daily_rate: data.type === "casual" ? Math.round(data.daily_rate ?? 0) : 0,
      monthly_salary: data.type === "fulltime" ? Math.round(data.monthly_salary ?? 0) : 0,
    };
    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Employees</h1>
          </div>
          <p className="text-muted-foreground mt-1">Manage your workforce</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{employees?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">
              {employees?.filter((e) => e.type === "casual").length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Casual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">
              {employees?.filter((e) => e.type === "fulltime").length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Full-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>
                    <Badge variant={emp.type === "casual" ? "info" : "success"} className="capitalize">
                      {emp.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {emp.department ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {emp.phone}
                  </TableCell>
                  <TableCell>
                    {emp.type === "casual"
                      ? `${formatCurrency(emp.daily_rate)}/siku`
                      : `${formatCurrency(emp.monthly_salary)}/mwezi`}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add New Employee"}</DialogTitle>
            <DialogDescription>
              {editingEmployee ? "Update employee information" : "Add a new employee to the system"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="John Doe" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Nambari ya Simu</Label>
              <Input placeholder="+255712345678" {...register("phone")} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Aina ya Mfanyakazi</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setValue("type", v as "casual" | "fulltime")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Mkataba (Casual)</SelectItem>
                    <SelectItem value="fulltime">Kudumu (Full-time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Idara</Label>
                <Input placeholder="Uendeshaji" {...register("department")} />
              </div>
            </div>

            {type === "casual" ? (
              <div className="space-y-2">
                <Label>Kiwango cha Siku (TZS)</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="15000"
                  {...register("daily_rate", { valueAsNumber: true })}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Mshahara wa Mwezi (TZS)</Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="800000"
                    {...register("monthly_salary", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overtime Rule</Label>
                  <Select
                    defaultValue="none"
                    onValueChange={(v) =>
                      setValue("overtime_rule", v as "all_days" | "holidays_only" | "none")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Overtime</SelectItem>
                      <SelectItem value="all_days">All Days</SelectItem>
                      <SelectItem value="holidays_only">Holidays Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : editingEmployee ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
