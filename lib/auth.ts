import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, initializeDatabase, seedDemoData } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
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

          return {
            id: user.id,
            email: user.email ?? user.phone ?? "",
            name: user.name,
            role: user.role,
            phone: user.phone ?? "",
            employeeId: user.employee_id ?? user.id,
          };
        } catch (error) {
          console.error("Auth error:", error);
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
        (session.user as { employeeId: string }).employeeId = token.employeeId as string;
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
