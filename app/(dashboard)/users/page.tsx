"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCog, Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

interface SystemUser {
  id: string;
  name: string;
  role: "supervisor" | "hr" | "admin";
  phone: string | null;
  email: string | null;
  created_at: string;
}

const ROLES = ["supervisor", "hr", "admin"] as const;

const roleVariant: Record<string, "default" | "secondary" | "destructive" | "outline" | "info" | "success" | "warning"> = {
  admin: "destructive",
  hr: "warning",
  supervisor: "info",
};

const roleLabel: Record<string, string> = {
  admin: "Admin",
  hr: "HR",
  supervisor: "Supervisor",
};

const createSchema = z.object({
  name: z.string().min(2, "Jina linahitajika"),
  phone: z.string().optional(),
  email: z.string().email("Barua pepe si sahihi").optional().or(z.literal("")),
  role: z.enum(ROLES, { required_error: "Chagua wadhifa" }),
  password: z.string().min(6, "Nywila lazima iwe herufi 6+"),
}).refine((d) => d.phone || d.email, {
  message: "Simu au barua pepe inahitajika",
  path: ["phone"],
});

const editSchema = z.object({
  name: z.string().min(2, "Jina linahitajika").optional(),
  phone: z.string().optional(),
  email: z.string().email("Barua pepe si sahihi").optional().or(z.literal("")),
  role: z.enum(ROLES).optional(),
  password: z.string().min(6, "Nywila lazima iwe herufi 6+").optional().or(z.literal("")),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<SystemUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<SystemUser | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ name: string; phone: string | null; email: string | null; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed");
      const all = await res.json() as SystemUser[];
      return all.filter((u) => ROLES.includes(u.role as typeof ROLES[number]));
    },
  });

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      createForm.reset();
      setNewCredentials({ name: data.name, phone: data.phone, email: data.email, password: data.plainPassword });
    },
    onError: (err) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: EditForm & { id: string }) => {
      const body: Record<string, string> = { id: data.id };
      if (data.name) body.name = data.name;
      if (data.role) body.role = data.role;
      if (data.phone !== undefined) body.phone = data.phone ?? "";
      if (data.email !== undefined) body.email = data.email ?? "";
      if (data.password) body.password = data.password;

      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      editForm.reset();
      toast({ title: "Imehifadhiwa", description: "Taarifa zimeboreshwa." });
    },
    onError: (err) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteUser(null);
      toast({ title: "Imefutwa", description: "Mtumiaji amefutwa." });
    },
    onError: (err) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (user: SystemUser) => {
    setEditUser(user);
    editForm.reset({ name: user.name, phone: user.phone ?? "", email: user.email ?? "", role: user.role, password: "" });
  };

  const copyCredentials = () => {
    if (!newCredentials) return;
    const login = newCredentials.phone ?? newCredentials.email ?? "";
    navigator.clipboard.writeText(`Jina: ${newCredentials.name}\nLogin: ${login}\nNywila: ${newCredentials.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Watumiaji wa Mfumo</h1>
          </div>
          <p className="text-muted-foreground mt-1">Simamia wasimamizi, HR, na maadmin</p>
        </div>
        <Button onClick={() => { createForm.reset(); setCreateOpen(true); }} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Ongeza Mtumiaji
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jina</TableHead>
                <TableHead>Wadhifa</TableHead>
                <TableHead className="hidden sm:table-cell">Simu</TableHead>
                <TableHead className="hidden md:table-cell">Barua Pepe</TableHead>
                <TableHead>Vitendo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Inapakia...
                  </TableCell>
                </TableRow>
              ) : !users?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Hakuna watumiaji. Ongeza mtumiaji wa kwanza.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>
                      <Badge variant={roleVariant[user.role] ?? "secondary"}>
                        {roleLabel[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {user.phone ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {user.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteUser(user)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ongeza Mtumiaji Mpya</DialogTitle>
            <DialogDescription>Unda akaunti ya msimamizi, HR, au admin.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Jina kamili *</Label>
              <Input {...createForm.register("name")} placeholder="Jina la mtumiaji" />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nambari ya Simu</Label>
                <Input {...createForm.register("phone")} placeholder="+255..." />
              </div>
              <div className="space-y-2">
                <Label>Barua Pepe</Label>
                <Input {...createForm.register("email")} placeholder="email@example.com" />
              </div>
            </div>
            {createForm.formState.errors.phone && (
              <p className="text-xs text-destructive">{createForm.formState.errors.phone.message}</p>
            )}

            <div className="space-y-2">
              <Label>Wadhifa *</Label>
              <Select
                value={createForm.watch("role") ?? ""}
                onValueChange={(v) => createForm.setValue("role", v as typeof ROLES[number])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua wadhifa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {createForm.formState.errors.role && (
                <p className="text-xs text-destructive">{createForm.formState.errors.role.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Nywila ya awali *</Label>
              <div className="relative">
                <Input
                  {...createForm.register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Herufi 6+"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Ghairi</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inaunda...</> : "Unda Akaunti"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hariri Mtumiaji</DialogTitle>
            <DialogDescription>Badilisha taarifa za {editUser?.name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit((d) => editUser && editMutation.mutate({ ...d, id: editUser.id }))} className="space-y-4">
            <div className="space-y-2">
              <Label>Jina kamili</Label>
              <Input {...editForm.register("name")} />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Simu</Label>
                <Input {...editForm.register("phone")} placeholder="+255..." />
              </div>
              <div className="space-y-2">
                <Label>Barua Pepe</Label>
                <Input {...editForm.register("email")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Wadhifa</Label>
              <Select
                value={editForm.watch("role") ?? ""}
                onValueChange={(v) => editForm.setValue("role", v as typeof ROLES[number])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua wadhifa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nywila mpya (acha wazi kama haibadiliki)</Label>
              <div className="relative">
                <Input
                  {...editForm.register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="Herufi 6+"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-10"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {editForm.formState.errors.password && (
                <p className="text-xs text-destructive">{editForm.formState.errors.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Ghairi</Button>
              <Button type="submit" disabled={editMutation.isPending}>
                {editMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</> : "Hifadhi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Futa Mtumiaji</AlertDialogTitle>
            <AlertDialogDescription>
              Una uhakika wa kufuta <strong>{deleteUser?.name}</strong>? Hatua hii haiwezi kutenduliwa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ghairi</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Inafuta..." : "Futa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New credentials display */}
      <Dialog open={!!newCredentials} onOpenChange={(o) => !o && setNewCredentials(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              Akaunti Imeundwa
            </DialogTitle>
            <DialogDescription>
              Hizi ni nywila za mara moja. Zinaonyeshwa mara moja tu — zisafishie mtumiaji sasa.
            </DialogDescription>
          </DialogHeader>
          {newCredentials && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 font-mono text-sm">
              <p><span className="text-muted-foreground">Jina:</span> {newCredentials.name}</p>
              <p><span className="text-muted-foreground">Login:</span> {newCredentials.phone ?? newCredentials.email}</p>
              <p><span className="text-muted-foreground">Nywila:</span> {newCredentials.password}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyCredentials} className="flex-1">
              {copied ? <><Check className="h-4 w-4 mr-2" />Imenakiliwa</> : <><Copy className="h-4 w-4 mr-2" />Nakili</>}
            </Button>
            <Button onClick={() => setNewCredentials(null)} className="flex-1">Imeeleweka</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
