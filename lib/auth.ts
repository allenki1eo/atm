import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, initializeDatabase, seedDemoData } from "@/lib/db";
import { authenticateSsoToken } from "@/lib/sso";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email / Simu", type: "text" },
        password: { label: "Password / PIN", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          await initializeDatabase();
          await seedDemoData();

          const identifier = (credentials.email as string).trim();

          // Try login by email first, then by phone number
          const result = await db.execute({
            sql: "SELECT * FROM users WHERE email = ? OR phone = ?",
            args: [identifier, identifier],
          });

          const user = result.rows[0] as unknown as {
            id: string;
            email: string | null;
            name: string;
            role: string;
            phone: string | null;
            password_hash: string;
            employee_id: string | null;
          } | undefined;

          if (!user) return null;

          const passwordValid = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          );

          if (!passwordValid) return null;

          // Block login if the linked employee record was deactivated.
          if (user.employee_id) {
            const empRes = await db.execute({
              sql: "SELECT active FROM employees WHERE id = ?",
              args: [user.employee_id],
            });
            const empRow = empRes.rows[0] as unknown as { active: number } | undefined;
            if (empRow && empRow.active !== 1) return null;
          }

          return {
            id: user.id,
            email: user.email ?? user.phone ?? "",
            name: user.name,
            role: user.role,
            phone: user.phone ?? "",
            employeeId: user.employee_id ?? null,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
    // IMS launches TrustTrack at /api/sso/callback. This provider accepts only
    // that short-lived HS256 token — never a password — and returns the same
    // user shape as password login so the JWT session callbacks stay shared.
    Credentials({
      id: "ims",
      name: "IMS SSO",
      credentials: {
        token: { label: "SSO Token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.token;
        if (typeof token !== "string" || !token) return null;

        try {
          const result = await authenticateSsoToken(token);
          if (!result.ok) return null;
          return result.user;
        } catch {
          console.error("SSO sign-in failed");
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.phone = (user as { phone: string }).phone;
        token.employeeId = (user as { employeeId: string }).employeeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { phone: string }).phone = token.phone as string;
        (session.user as { employeeId: string | null }).employeeId =
          (token.employeeId as string | null) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
});
