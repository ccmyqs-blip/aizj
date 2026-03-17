import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserLoginForm } from "@/components/auth/user-login-form";
import { getAuthenticatedUser } from "@/lib/user-auth";

export const metadata: Metadata = {
  title: "用户登录",
  description: "工程造价规范检索助手用户登录页。"
};

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="py-10">
      <UserLoginForm />
    </div>
  );
}
