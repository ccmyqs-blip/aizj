import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRegisterForm } from "@/components/auth/user-register-form";
import { getAuthenticatedUser } from "@/lib/user-auth";

export const metadata: Metadata = {
  title: "用户注册",
  description: "工程造价规范检索助手用户注册页。"
};

export default async function RegisterPage() {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/");
  }

  return (
    <div className="py-10">
      <UserRegisterForm />
    </div>
  );
}
