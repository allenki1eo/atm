import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, initializeDatabase, seedDemoData } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          await initializeDatabase();
          await seedDemoData();

          const result = await db.execute({
            sql: "SELECT * FROM users WHERE email = ?",
            args: [credentials.email as string],
          });

          const user = result.rows[0] as unknown as {
            id: string;
            email: string;
            name: string;
            role: string;
            phone: string;
            password_hash: string;
          } | undefined;

          if (!user) return null;

          const passwordValid = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          );

          if (!passwordValid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            phone: user.phone,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
        (session.user as { phone: string }).phone = token.phone as string;
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
